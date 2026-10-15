#!/usr/bin/env node
// Builds the Flux 10 report for every UBL invoice in a folder: ereport-gen.js INDIR OUTDIR
"use strict";
const fs = require("fs"), path = require("path");
const { open } = require("./lib/engine");

function inPage(text) {
  const d = new DOMParser().parseFromString(text, "application/xml"), r = d.documentElement;
  if (!["Invoice", "CreditNote"].includes(r.localName)) return null;
  try { return EReport.build(r, r.localName).xml; } catch (e) { return "ERROR " + e.message; }
}
(async () => {
  const [inDir, outDir] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const eng = await open();
  let n = 0;
  for (const f of fs.readdirSync(inDir).filter((x) => /\.xml$/i.test(x)).sort()) {
    const xml = await eng.page.evaluate(inPage, fs.readFileSync(path.join(inDir, f), "utf8"));
    if (xml) { fs.writeFileSync(path.join(outDir, f), xml); n++; }
  }
  await eng.close();
  console.log(n + " reports written to " + outDir + (eng.errors.length ? "; page errors: " + eng.errors.join(" | ") : ""));
})();
