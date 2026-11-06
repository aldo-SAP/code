#!/usr/bin/env node
// "What to change": the figures RequestFixes proposes, each tried by applying it to the request and checking that the rule then passes.
// usage: fixes.js
"use strict";
const fs = require("fs"), path = require("path");
const { open } = require("../lib/engine");
const base = JSON.parse(fs.readFileSync(path.join(__dirname, "base.json"), "utf8"));
const cases = [
  ["total with VAT wrong", (i) => { i.DocumentTotalWithVAT = "999.00"; }, ["BR-CO-15"]],
  ["VAT total and amount due wrong", (i) => { i.DocumentTotalTaxAmount = "12.00"; i.DocumentDueAmount = "1"; }, ["BR-CO-14", "BR-CO-15", "BR-CO-16"]],
  ["net amount of the lines wrong", (i) => { i.DocumentNetAmount = "190.00"; }, ["BR-CO-10"]],
  ["total without VAT wrong", (i) => { i.DocumentTotalWithoutVAT = "150.00"; }, ["BR-CO-13"]],
  ["VAT amount of the row wrong", (i) => { i.InvoiceHeaderItemList[0].TaxAmount = "10.00"; }, ["BR-CO-17"]],
  ["taxable amount of the row wrong", (i) => { i.InvoiceHeaderItemList[0].TaxableAmount = "150.00"; }, ["BR-S-08"]],
  ["line amount does not fit quantity × price", (i) => { i.InvoiceLineList[0].LineQuantity = "9"; }, ["PEPPOL-EN16931-R120"]]
];
// hints: a field taken out of the request must be named by the rule that then fails
const gone = [
  ["seller name", (i) => { delete i.SellerLegalName; }, "SellerLegalName"],
  ["buyer country", (i) => { delete i.BuyerCountry; }, "BuyerCountry"],
  ["unit of the line", (i) => { delete i.InvoiceLineList[0].LineUOMCode; }, "LineUOMCode"],
  ["item name", (i) => { delete i.InvoiceLineList[0].ItemName; }, "ItemName"],
  ["VAT category of the line", (i) => { delete i.InvoiceLineList[0].LineVATCategory; }, "LineVATCategory"],
  ["total with VAT", (i) => { delete i.DocumentTotalWithVAT; }, "DocumentTotalWithVAT"]
];
(async () => {
  const e = await open(); let bad = 0;
  for (const [name, mutate, field] of gone) {
    const input = JSON.parse(JSON.stringify(base)); mutate(input.req[0]);
    const r = await e.page.evaluate(([input, sets]) => {
      const root = new DOMParser().parseFromString(RequestToUbl.convert(input).xml, "application/xml").documentElement;
      const checks = EN16931.check(root, root.localName, sets).filter((x) => !x.ok);
      return RequestFixes.hints(input, checks, []).filter((h) => h.state === "missing").map((h) => h.field);
    }, [input, ["peppol"]]);
    const okk = r.includes(field);
    if (!okk) bad++;
    console.log((okk ? "ok   " : "FAIL ") + "hint names " + field + " when " + name + " is missing" + (okk ? "" : " (named: " + r.join(", ") + ")"));
  }
  for (const [name, mutate, expect] of cases) {
    const input = JSON.parse(JSON.stringify(base)); mutate(input.req[0]);
    if (name.startsWith("taxable") ) input.req[0].DocumentNetAmount = input.req[0].DocumentNetAmount;
    const r = await e.page.evaluate(([input, sets]) => {
      const fails = (inp) => { const root = new DOMParser().parseFromString(RequestToUbl.convert(inp).xml, "application/xml").documentElement; return EN16931.check(root, root.localName, sets).filter((x) => !x.ok).map((x) => x.id); };
      const before = fails(input);
      const list = RequestFixes.suggest(input, before);
      // apply every proposal to the request
      const inv = input.req[0];
      list.forEach((f) => {
        let o = inv;
        (f.where ? f.where.split(".") : []).forEach((p) => { const m = /^(\w+)\[(\d+)\]$/.exec(p); o = o[m[1]][m[2] - 1]; });
        o[f.field] = f.should;
      });
      return { before, list: list.map((f) => f.rule + ":" + f.field + "→" + f.should), after: fails(input) };
    }, [input, ["peppol"]]);
    const IGNORE = ["PEPPOL-EN16931-R004", "PEPPOL-EN16931-R007"];
    const problems = [];
    expect.forEach((id) => { if (!r.before.includes(id)) problems.push("the case should fail " + id + " but does not (fails: " + r.before + ")"); });
    const after = r.after.filter((id) => !IGNORE.includes(id));
    if (after.length) problems.push("still failing after the proposed changes: " + after.join(", ") + " | proposals: " + r.list.join("; "));
    if (!r.list.length) problems.push("no proposal");
    if (problems.length) bad++;
    console.log((problems.length ? "FAIL " : "ok   ") + name + (problems.length ? "\n       " + problems.join("\n       ") : ""));
  }
  await e.close();
  console.log(bad ? bad + " cases not solved by the proposals" : "every proposal solves its case");
  process.exit(bad ? 1 : 0);
})();
