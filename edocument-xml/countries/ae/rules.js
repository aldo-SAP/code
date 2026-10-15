/*
 * PINT AE (UAE) rules: the official Peppol PINT AE schematron, version 1.0.4 (billing and self-billing, invoice and credit note).
 *
 * All 302 asserts (170 of the PINT layer, 132 of the UAE layer) are in pint-ae-rules.js (same folder) exactly as published; lib/schematron.js runs
 * them with fontoxpath the way the official validator does (the rule logic is shared with the other countries that publish a Schematron).
 *
 * PINT AE is not EN 16931: it has its own semantic model, code lists and rules. With this rule set on, the EN 16931 and PEPPOL rules
 * are not applied (EN16931.check runs a "standalone" set alone).
 *
 * Needs, loaded before: rules/en16931.js, lib/schematron.js, pint-ae-rules.js.
 */
(function () {
  "use strict";
  const DATA = window.PINT_AE_RULES;
  if (!DATA || !window.EdocSchematron || !window.EN16931) return;
  const { val } = EN16931.util;
  const isAE = (R) => /urn:peppol:pint:(?:self)?billing-1@ae-1/i.test(val(R, "CustomizationID"));
  // the self-billing variant differs from billing in the type codes only (ibr-cl-01)
  const runner = EdocSchematron.runner(DATA, { variant: (R) => (/urn:peppol:pint:selfbilling-1@ae-1/i.test(val(R, "CustomizationID")) ? DATA.selfBilling : null) });

  EN16931.register("ae", {
    label: "PINT AE",
    name: "PINT AE (UAE)",
    standalone: true,
    detect: isAE,
    run: runner.run
  });
  window.PintAE = { ids: runner.ids, version: DATA.version, detect: isAE };
})();
