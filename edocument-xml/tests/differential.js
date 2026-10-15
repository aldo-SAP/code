#!/usr/bin/env node
// Differential test: the rule engine against the official compiled schematron (SVRL output) on the same documents.
// usage: differential.js --docs=DIR --svrl=DIR[,DIR…] --ids=FILE [--sets=peppol,fr] [--ignore=PREFIX,…] [--log=mutlog.json] [--show=N] [--workers=N]
//   DIR holds the XML documents; each --svrl DIR holds one SVRL file per document (same name), one directory per official stylesheet.
//   FILE lists the rule IDs of the official rule sets; only those are compared (our own CHK-/FR-CHK- checks are not).
// Documents the official stylesheet could not process (no/invalid SVRL) are skipped.
"use strict";
const fs = require("fs"), path = require("path");
const { open, checkInPage } = require("./lib/engine");

const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith("--" + n + "=")); return a ? a.slice(n.length + 3) : d; };
const docsDir = arg("docs"), svrls = (arg("svrl") || "").split(",").filter(Boolean), idsFile = arg("ids");
const sets = arg("sets") ? arg("sets").split(",") : null, ignore = (arg("ignore") || "").split(",").filter(Boolean);
const logFile = arg("log"), show = +arg("show", 3), workers = +arg("workers", 1);
if (!docsDir || !svrls.length || !idsFile) { console.error("usage: see the header of differential.js"); process.exit(2); }

const universe = new Set(fs.readFileSync(idsFile, "utf8").split(/\s+/).filter(Boolean));
const ignored = (id) => ignore.some((p) => id.startsWith(p));

// failed-assert ids of one SVRL file
function official(file) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes("</svrl:schematron-output>")) return null;
  const out = new Set();
  for (const m of text.matchAll(/<svrl:failed-assert\b([^>]*)>/g)) {
    const id = (/\bid="([^"]*)"/.exec(m[1]) || [])[1];
    if (id) out.add(id);
  }
  return out;
}

(async () => {
  const eng = await open(workers);
  const log = logFile && fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf8")) : {};
  const miss = {}, extra = {};
  let compared = 0, skipped = 0;
  const queue = fs.readdirSync(docsDir).filter((x) => /\.xml$/i.test(x)).sort();
  const work = async (page) => {
    for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
      const sv = svrls.map((d) => path.join(d, f));
      const offs = sv.map((p) => (fs.existsSync(p) ? official(p) : null));
      if (offs.some((o) => !o)) { skipped++; continue; }
      const mine = await page.evaluate(checkInPage, [fs.readFileSync(path.join(docsDir, f), "utf8"), sets]);
      if (mine.err) { skipped++; continue; }
      compared++;
      const off = new Set(offs.flatMap((o) => Array.from(o)).filter((i) => universe.has(i) && !ignored(i)));
      const my = new Set(mine.fails.concat(mine.warns).filter((i) => universe.has(i) && !ignored(i)));
      off.forEach((i) => { if (!my.has(i)) (miss[i] = miss[i] || []).push(f); });
      my.forEach((i) => { if (!off.has(i)) (extra[i] = extra[i] || []).push(f); });
    }
  };
  await Promise.all(eng.pages.map(work));
  await eng.close();
  console.log(`${compared} documents compared, ${skipped} skipped`);
  const report = (title, m) => {
    console.log(title + (Object.keys(m).length ? "" : " none"));
    Object.entries(m).sort((a, b) => b[1].length - a[1].length).forEach(([id, files]) => {
      console.log(`  ${id} ×${files.length}  ${files[0]}`);
      files.slice(0, show).forEach((f) => { if (log[f]) console.log("      " + log[f].join(" ; ").slice(0, 260)); });
    });
  };
  report("OFFICIAL ONLY (the engine misses it):", miss);
  report("ENGINE ONLY (the official rules do not report it):", extra);
  if (!compared) console.log("nothing was compared: no document had official output");
  process.exit(!compared || Object.keys(miss).length + Object.keys(extra).length ? 1 : 0);
})();
