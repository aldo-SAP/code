#!/usr/bin/env node
/* Checks the "how to fix" lines (lib/help.js + rules/help.js, countries/<id>/help.js): every line belongs to a rule that exists, has English and Italian
   text without placeholders left over, and lists the rules that have no line (they are the ones whose message already says everything). */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
global.window = {}; global.document = undefined;
const load = (f) => (0, eval)(fs.readFileSync(path.join(root, f), "utf8"));
load("lib/help.js"); global.EdocHelp = window.EdocHelp;
const helpFiles = ["rules/help.js", "countries/fr/help.js", "countries/de/help.js", "countries/ae/help.js", "countries/it/help.js"];
// read the maps by wrapping add()
const H = {}; const real = EdocHelp.add; EdocHelp.add = (m) => Object.assign(H, m);
helpFiles.forEach((f) => load(f)); EdocHelp.add = real;
const RULES = [["rules/en16931-rules.js", "EN16931_RULES"], ["rules/peppol-rules.js", "PEPPOL_RULES"], ["countries/fr/br-fr-rules.js", "FR_RULES"],
  ["countries/fr/frext-rules.js", "FR_EXT_RULES"], ["countries/de/xrechnung-rules.js", "XRECHNUNG_RULES"], ["countries/ae/pint-ae-rules.js", "PINT_AE_RULES"]];
const ids = new Set(); const without = [];
for (const [f, n] of RULES) { load(f); for (const p of window[n].patterns) for (const r of p.r) for (const a of r.a) ids.add(a[0]); }
load("rules/ubl-schema-data.js"); load("rules/ubl-schema.js"); window.UblSchema.rules.forEach((i) => ids.add(i));
load("rules/it-schema-data.js"); load("rules/it-schema.js"); load("rules/it-spec.js"); load("rules/it-sdi.js"); window.ItSchema.rules.concat(window.ItSpec.rules, window.ItSdi.rules).forEach((i) => ids.add(i));   // the FatturaPA structure rules   // the UBL 2.1 structure rules
let bad = 0;
for (const [id, h] of Object.entries(H)) {
  if (!ids.has(id)) { console.log("help for an unknown rule:", id); bad++; }
  if (!Array.isArray(h) || h.length !== 2 || !h[0] || !h[1]) { console.log("help needs English and Italian:", id); bad++; }
  else if (/\$|\{|REVIEW|\t/.test(h[0] + h[1])) { console.log("leftover in help:", id, h); bad++; }
}
for (const id of EdocHelp.linkIds()) if (!ids.has(id)) { console.log("official-list link for an unknown rule:", id); bad++; }
for (const id of ids) if (!H[id]) without.push(id);
console.log(Object.keys(H).length + " help lines for " + ids.size + " rules; " + without.length + " rules without one" + (without.length ? ": " + without.join(", ") : ""));
process.exit(bad ? 1 : 0);
