// Checks in the viewer what the official stylesheets cannot show: the two rules whose context is an attribute (ibr-011-ae, ibr-013-ae),
// impossible dates, and the self-billing type codes.   usage: check-ae-viewer.js DIR-WITH-BILLING-EXAMPLES
"use strict";
const fs = require("fs");
const path = require("path");
const { open } = require("./lib/engine.js");

(async () => {
  const dir = process.argv[2];
  const name = fs.readdirSync(dir).find((f) => /Buyer-PAS/.test(f));
  const base = fs.readFileSync(path.join(dir, name), "utf8");
  const e = await open(1);
  const run = (t) => e.page.evaluate(([t]) => { const d = new DOMParser().parseFromString(t, "application/xml"); return EN16931.check(d.documentElement, d.documentElement.localName, ["ae"]).filter((x) => !x.ok).map((x) => x.id); }, [t]);
  const party = (who, v) => base.replace(new RegExp("(" + who + "[\\s\\S]*?CompanyID[^>]*schemeAgencyName=\")[^\"]*"), "$1" + v);
  const cases = [
    ["valid document", base, null, ["ibr-011-ae", "ibr-013-ae", "ibr-073", "ibr-cl-01"]],
    ["buyer passport country not a country", party("AccountingCustomerParty", "TIN"), "ibr-011-ae", []],
    ["buyer passport country valid", party("AccountingCustomerParty", "FR"), null, ["ibr-011-ae"]],
    ["impossible date", base.replace(/<cbc:IssueDate>[^<]*/, "<cbc:IssueDate>2026-02-30"), "ibr-073", []],
    ["leap day", base.replace(/<cbc:IssueDate>[^<]*/, "<cbc:IssueDate>2028-02-29"), null, ["ibr-073"]],
    ["self-billing with a billing type code", base.replace(/billing-1@ae-1/, "selfbilling-1@ae-1"), "ibr-cl-01", []],
  ];
  let bad = 0;
  for (const [label, xml, must, mustNot] of cases) {
    const got = await run(xml);
    const ok = (must ? got.includes(must) : true) && mustNot.every((i) => !got.includes(i) || (must === i));
    if (!ok) bad++;
    console.log((ok ? "ok   " : "FAIL ") + label + "  " + JSON.stringify(got.filter((i) => ["ibr-011-ae", "ibr-013-ae", "ibr-073", "ibr-cl-01"].includes(i))));
  }
  await e.close();
  process.exit(bad ? 1 : 0);
})();
