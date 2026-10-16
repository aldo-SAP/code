/*
 * XRechnung (Germany): the official KoSIT schematron of the CIUS XRechnung 3.0 for UBL, with the Peppol rules it integrates
 * (xrechnung-schematron 2.6.0, Peppol BIS Billing 3.0.21), in xrechnung-rules.js exactly as published; lib/schematron.js runs them.
 * Covers the three profiles: CIUS XRechnung (BR-DE-), Extension (BR-DEX-) and CVD (BR-DE-CVD-). The messages are German in the official rules;
 * messages.js has the English and Italian text.
 *
 * XRechnung is a CIUS of EN 16931, so this set is added on top of the EN 16931 rules (as the official validation does).
 * Needs, loaded before: rules/en16931.js, lib/schematron.js, xrechnung-rules.js.
 */
(function () {
  "use strict";
  const DATA = window.XRECHNUNG_RULES;
  if (!DATA || !window.EdocSchematron || !window.EN16931) return;
  const { val } = EN16931.util;
  // BT-24 of the three profiles: the CIUS, the Extension and the CVD (any 3.x version number)
  const ID = /^urn:cen\.eu:en16931:2017#(?:compliant#urn:xeinkauf\.de:kosit:xrechnung(?:_|:cvd_)|conformant#urn:xeinkauf\.de:kosit:extension:xrechnung_)\d/;
  const isDE = (R) => ID.test(val(R, "CustomizationID"));

  // The IBAN check of the schematron: structure and check digits (mod 97)
  EdocSchematron.registerFunction("xr", "checkIBAN", ["xs:string"], "xs:boolean", (iban) => {
    const n = iban.replace(/\s/g, "").trim();
    if (!/^[A-Z]{2}[0-9]{2}[a-zA-Z0-9]{0,30}$/.test(n)) return false;
    const digits = (n.substring(4) + n.substring(0, 2).toUpperCase() + n.substring(2, 4)).split("").map((ch) => { const c = ch.charCodeAt(0); return String(c > 64 ? c - 55 : c - 48); }).join("");
    let rest = 0;
    for (let i = 0; i < digits.length; i += 7) rest = parseInt(String(rest) + digits.substr(i, 7), 10) % 97;
    return rest === 1;
  });

  const runner = EdocSchematron.runner(DATA, { skip: (id, ctx) => ctx.reported && ctx.reported(id) });
  EN16931.register("de", { label: "XRechnung", name: "XRechnung (Germany)", detect: isDE, run: runner.run, steps: runner.steps });
  window.XRechnung = { ids: runner.ids, version: DATA.version, detect: isDE };
})();
