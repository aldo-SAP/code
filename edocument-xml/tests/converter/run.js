#!/usr/bin/env node
// The French request -> UBL converter against what the platform (GTES) really produced: each case in cases.json is a confirmed platform result (or marked as an assumption),
// applied to the base request, with the facts the XML must show (XPath) and the rules that must or must not fail.
// usage: run.js     (the base request is invented; the sources of the cases are the platform results sent on the dates given in cases.json)
"use strict";
const fs = require("fs"), path = require("path");
const { open } = require("../lib/engine");
const base = JSON.parse(fs.readFileSync(path.join(__dirname, "base.json"), "utf8"));
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "cases.json"), "utf8"));
// The French request has a billing framework ("B1") where Peppol wants its business process id: these two Peppol rules are about that and say nothing about the lines.
const IGNORE = new Set(["PEPPOL-EN16931-R004", "PEPPOL-EN16931-R007"]);
(async () => {
  const e = await open();
  let bad = 0;
  for (const c of cases) {
    const input = JSON.parse(JSON.stringify(base));
    const inv = input.req[0], line = inv.InvoiceLineList[0];
    Object.assign(inv, c.header || {});
    Object.assign(line, c.line || {});
    if (c.itemList) line.InvoiceLineItemList = c.itemList;
    if (c.headerItems) inv.InvoiceHeaderItemList = c.headerItems;
    if (c.creditNote) inv.InvoiceType = "381";
    const r = await e.page.evaluate(([input, facts, sets]) => {
      const out = { errors: [], facts: [], fails: [] };
      let res;
      try { res = RequestToUbl.convert(input); } catch (x) { out.errors.push("convert: " + x.message); return out; }
      const doc = new DOMParser().parseFromString(res.xml, "application/xml");
      const ns = { cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2", cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2", u: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2", cn: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" };
      const resolver = (p) => ns[p] || null;
      (facts || []).forEach(([xp, want]) => {
        let got;
        try {
          const v = doc.evaluate(xp, doc, resolver, XPathResult.ANY_TYPE, null);
          got = v.resultType === XPathResult.NUMBER_TYPE ? String(v.numberValue) : v.resultType === XPathResult.BOOLEAN_TYPE ? String(v.booleanValue) : v.resultType === XPathResult.STRING_TYPE ? v.stringValue : (() => { const n = v.iterateNext(); return n ? n.textContent : ""; })();
        } catch (x) { got = "XPATH ERROR " + x.message; }
        out.facts.push([xp, want, got]);
      });
      out.notMapped = res.notMapped.map((n) => n.path + " | " + (n.reason || ""));
      try {
        const root = doc.documentElement;
        out.fails = EN16931.check(root, root.localName, sets).filter((x) => !x.ok).map((x) => x.id);
      } catch (x) { out.errors.push("check: " + x.message); }
      return out;
    }, [input, c.facts, c.sets || ["peppol"]]);
    const problems = [];
    r.errors.forEach((x) => problems.push(x));
    r.facts.forEach(([xp, want, got]) => { if (String(want) !== got) problems.push("fact " + xp + ": wanted " + JSON.stringify(want) + ", got " + JSON.stringify(got)); });
    (c.mustFail || []).forEach((id) => { if (!r.fails.includes(id)) problems.push("rule " + id + " should fail but does not"); });
    (c.noFailures ? r.fails.filter((id) => !IGNORE.has(id)) : (c.mustNotFail || []).filter((id) => r.fails.includes(id))).forEach((id) => problems.push("rule " + id + " fails"));
    (c.notMapped || []).forEach((frag) => { if (!(r.notMapped || []).some((n) => n.includes(frag))) problems.push("notMapped should mention: " + frag); });
    if (problems.length) bad++;
    console.log((problems.length ? "FAIL " : "ok   ") + c.name + (problems.length ? "\n       " + problems.join("\n       ") : ""));
  }
  await e.close();
  console.log(bad ? bad + " of " + cases.length + " cases differ from the platform's results" : "all " + cases.length + " cases agree with the platform's results");
  process.exit(bad ? 1 : 0);
})();
