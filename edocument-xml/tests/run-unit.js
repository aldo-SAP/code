#!/usr/bin/env node
// Runs the official validator unit tests (ConnectingEurope/eInvoicing-EN16931 test/*-unit-UBL, OpenPEPPOL unit-UBL-PEPPOL)
// against the rule engine. Each <test> holds a document and the rule that must (<error>) or must not (<success>) fail.
// usage: run-unit.js [--sets=peppol] dir…        exit code 1 when a test fails
"use strict";
const fs = require("fs"), path = require("path");
const { open } = require("./lib/engine");

const args = process.argv.slice(2);
const sets = (args.find((a) => a.startsWith("--sets=")) || "").slice(7);
const dirs = args.filter((a) => !a.startsWith("--"));
if (!dirs.length) { console.error("usage: run-unit.js [--sets=peppol] testdir…"); process.exit(2); }

function inPage([text, forced]) {
  const out = [], doc = new DOMParser().parseFromString(text, "application/xml");
  const kids = (el, n) => Array.from(el.children).filter((c) => c.localName === n);
  Array.from(doc.getElementsByTagNameNS("*", "test")).forEach((t, i) => {
    const expect = [];
    kids(t, "assert").forEach((a) => ["success", "error", "warning"].forEach((k) => kids(a, k).forEach((s) => expect.push([k, s.textContent.trim()]))));
    const inv = Array.from(t.children).find((c) => c.localName === "Invoice" || c.localName === "CreditNote");
    if (!inv) return;
    let res;
    // the rules look at the document element (/ubl:Invoice …): the invoice of a test becomes a document of its own
    const root = new DOMParser().parseFromString(new XMLSerializer().serializeToString(inv), "application/xml").documentElement;
    try { res = EN16931.check(root, root.localName, forced ? [forced] : EN16931.detect(root)); } catch (e) { out.push({ i, crash: String(e.message) }); return; }
    // ids like BR-IG-08-1 name a variant of BR-IG-08
    const bad = expect.filter(([k, id]) => {
      const base = id.replace(/-\d$/, ""), failed = res.some((x) => (x.id === id || x.id === base) && !x.ok);
      return k === "success" ? failed : !failed;
    });
    out.push({ i, expect, bad });
  });
  return out;
}

(async () => {
  const eng = await open();
  let tests = 0, problems = [];
  for (const d of dirs) for (const f of fs.readdirSync(d).filter((x) => /\.xml$/i.test(x)).sort()) {
    const rows = await eng.page.evaluate(inPage, [fs.readFileSync(path.join(d, f), "utf8"), sets || null]);
    for (const r of rows) { tests++; if (r.crash || (r.bad && r.bad.length)) problems.push(path.basename(d) + "/" + f + " #" + r.i + " " + (r.crash || JSON.stringify(r.bad))); }
  }
  await eng.close();
  console.log(`${tests} tests, ${problems.length} failing` + (eng.errors.length ? `, ${eng.errors.length} page errors` : ""));
  problems.slice(0, 40).forEach((p) => console.log("  " + p));
  process.exit(problems.length || eng.errors.length ? 1 : 0);
})();
