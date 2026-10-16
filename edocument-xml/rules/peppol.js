/*
 * PEPPOL BIS Billing 3.0 on top of EN 16931.
 *
 * The rules are the official ones (OpenPEPPOL/peppol-bis-invoice-3, rules/sch/PEPPOL-EN16931-UBL.sch): the PEPPOL-EN16931 rules, the PEPPOL-COMMON identifier
 * checks and the national rules the Peppol schematron carries (DE-R, DK-R, GR-R, IS-R, IT-R, NL-R, NO-R, SE-R). peppol-rules.js holds the asserts exactly as
 * published (tests/gen-en16931.py makes it) and lib/schematron.js runs them.
 */
(function () {
  "use strict";
  const { val } = EN16931.util;
  let runner = null;
  const ids = Array.from(new Set([].concat(...window.PEPPOL_RULES.patterns.map((p) => [].concat(...p.r.map((r) => r.a.map((a) => a[0])))))));
  window.PeppolRules = { ids, version: window.PEPPOL_RULES.version };
  EN16931.register("peppol", {
    label: "PEPPOL BIS 3.0",
    name: "PEPPOL BIS Billing 3.0",
    detect: (R) => /peppol\.eu:2017:poacc:billing/.test(val(R, "CustomizationID")),
    run(c) { for (const _ of this.steps(c)); },
    *steps(c) {
      if (!runner) runner = EdocSchematron.runner(window.PEPPOL_RULES);
      yield* runner.steps(c);
    }
  });
})();
