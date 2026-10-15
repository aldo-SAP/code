#!/usr/bin/env node
// E-reporting: the rule engine's checks on a UBL invoice against the official Flux 10 schematron run on the report built from it.
// usage: ereport-differential.js UBLDIR SVRLDIR    (SVRLDIR: output of Flux10.xslt on the reports from ereport-gen.js)
"use strict";
const fs = require("fs"), path = require("path");
const { open, checkInPage } = require("./lib/engine");

const [dir, svrl] = process.argv.slice(2);
(async () => {
  const eng = await open();
  let n = 0;
  const miss = {}, extra = {};
  for (const f of fs.readdirSync(dir).filter((x) => /\.xml$/i.test(x)).sort()) {
    const p = path.join(svrl, f);
    if (!fs.existsSync(p)) continue;
    const t = fs.readFileSync(p, "utf8");
    if (!t.includes("</svrl:schematron-output>")) continue;   // the stylesheet could not process this report
    // the rule code is the start of the message, e.g. "[G1.16] …"
    const off = new Set(Array.from(t.matchAll(/<svrl:failed-assert[\s\S]*?<svrl:text>\s*\[([A-Z]\d+\.\d+)\]/g)).map((m) => m[1]));
    const mine = await eng.page.evaluate(checkInPage, [fs.readFileSync(path.join(dir, f), "utf8"), ["ereport"]]);
    const my = new Set(mine.fails.concat(mine.warns).filter((i) => /^[A-Z]\d+\.\d+$/.test(i)));
    n++;
    off.forEach((i) => { if (!my.has(i) && i !== "G6.22") (miss[i] = miss[i] || []).push(f); });   // G6.22: the platform id of the envelope placeholder
    my.forEach((i) => { if (!off.has(i)) (extra[i] = extra[i] || []).push(f); });
  }
  await eng.close();
  console.log(n + " documents compared");
  const show = (t, m) => { console.log(t + (Object.keys(m).length ? "" : " none")); Object.entries(m).forEach(([k, v]) => console.log("  " + k + " ×" + v.length + "  " + v[0])); };
  show("OFFICIAL ONLY (the engine misses it):", miss);
  show("ENGINE ONLY (the official rules do not report it):", extra);
  process.exit(n && !Object.keys(miss).length && !Object.keys(extra).length ? 0 : 1);
})();
