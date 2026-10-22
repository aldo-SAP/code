#!/usr/bin/env node
// The viewer's FatturaPA structure check against libxml2's XML Schema validation on the same documents (verdicts from mutate.py): a document is invalid for both or for neither.
// usage: differential.js VERDICTS.json
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
(async () => {
  const verdicts = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const texts = Object.keys(verdicts);
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.setContent("<html></html>");
  for (const f of ["rules/it-schema-data.js", "rules/it-schema.js"]) await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "..", "..", f), "utf8") });
  const out = await page.evaluate((ts) => ts.map((t) => {
    const d = new DOMParser().parseFromString(t, "application/xml");
    if (d.getElementsByTagName("parsererror").length) return null;
    try { return ItSchema.check(d.documentElement).map((x) => x.kind + " " + x.detail); } catch (e) { return ["CRASH " + e.message + e.stack]; }
  }), texts);
  await browser.close();
  const miss = [], extra = [];
  let both = 0, bothOk = 0;
  const kinds = {};
  texts.forEach((t, k) => {
    const mine = out[k], official = verdicts[t];
    if (!mine) return;
    mine.forEach((m) => { kinds[m.slice(0, 2)] = (kinds[m.slice(0, 2)] || 0) + 1; });
    const bad = mine.length > 0;
    if (!official[0] && !bad) miss.push([official[1], mine]);
    else if (official[0] && bad) extra.push([official[1], mine[0]]);
    else if (bad) both++; else bothOk++;
  });
  console.log(texts.length + " documents: invalid for both " + both + ", valid for both " + bothOk);
  console.log("kinds found by the viewer:", JSON.stringify(kinds));
  console.log("LIBXML2 ONLY (the viewer misses it): " + (miss.length || "none"));
  miss.slice(0, 15).forEach(([e]) => console.log("  " + e.slice(0, 200)));
  console.log("VIEWER ONLY (libxml2 accepts it): " + (extra.length || "none"));
  extra.slice(0, 15).forEach(([e, m]) => console.log("  " + e.slice(0, 120) + "\n    " + m.slice(0, 200)));
  process.exit(miss.length || extra.length ? 1 : 0);
})();
