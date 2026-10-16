#!/usr/bin/env node
// The viewer's UBL 2.1 structure check against libxml2's XML Schema validation (verdicts from xsd-verdicts.py) on the same documents:
// a document is invalid for both or for neither. usage: xsd-differential.js VERDICTS.json
"use strict";
const fs = require("fs");
const { open } = require("./lib/engine");
(async () => {
  const verdicts = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const files = Object.keys(verdicts).sort();
  const eng = await open();
  const miss = [], extra = [];
  let both = 0, bothOk = 0;
  const kinds = {};
  for (let i = 0; i < files.length; i += 25) {
    const chunk = files.slice(i, i + 25);
    const texts = chunk.map((f) => fs.readFileSync(f, "utf8"));
    const out = await eng.page.evaluate((ts) => ts.map((t) => {
      const d = new DOMParser().parseFromString(t, "application/xml");
      if (d.getElementsByTagName("parsererror").length) return null;
      try { return UblSchema.check(d.documentElement).map((x) => x.kind + " " + x.detail); } catch (e) { return ["CRASH " + e.message]; }
    }), texts);
    chunk.forEach((f, k) => {
      const mine = out[k], official = verdicts[f];
      if (!mine) return;
      const bad = mine.length > 0;
      mine.forEach((m) => { kinds[m.slice(0, 2)] = (kinds[m.slice(0, 2)] || 0) + 1; });
      if (!official[0] && !bad) miss.push([f, official[1][0], mine]);
      else if (official[0] && bad) extra.push([f, mine[0]]);
      else if (bad) both++; else bothOk++;
    });
  }
  await eng.close();
  console.log(files.length + " documents: invalid for both " + both + ", valid for both " + bothOk);
  console.log("kinds found by the viewer:", JSON.stringify(kinds));
  console.log("LIBXML2 ONLY (the viewer misses it): " + (miss.length || "none"));
  miss.slice(0, 12).forEach(([f, e]) => console.log("  " + f.split("/").slice(-2).join("/") + "\n    " + e));
  console.log("VIEWER ONLY (libxml2 accepts it): " + (extra.length || "none"));
  extra.slice(0, 12).forEach(([f, e]) => console.log("  " + f.split("/").slice(-2).join("/") + "\n    " + e));
  process.exit(miss.length || extra.length ? 1 : 0);
})();
