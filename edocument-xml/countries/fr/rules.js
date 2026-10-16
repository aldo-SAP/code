/*
 * France (CTC e-invoicing reform) checks on top of EN 16931.
 *
 * The BR-FR rules are the official FNFE-MPE schematron for AFNOR XP Z12-012, UBL syntax, version 1.4.0.04 (github.com/fnfempe/France_RFE,
 * FNFE_RFE_INVOICE/UBL/EN16931/schematron/BR-FR-Flux2-Schematron-UBL.sch), in br-fr-rules.js exactly as published, run by lib/schematron.js.
 * For the EXTENDED-CTC-FR profile the official stylesheet of that profile also replaces part of the EN 16931 rules: frext-rules.js has the rules only
 * it has (BR-FREXT-, UBL-FREXT-) and FR_EXT_OFF the EN 16931 rules it leaves out. The messages are French in the source; messages.js has English and Italian.
 *
 * FR-CHK- checks are this tool's own warnings (check digits, legal mentions); they have no BR-FR equivalent.
 * Needs, loaded before: rules/en16931.js, lib/schematron.js, br-fr-rules.js, frext-rules.js.
 */
(function () {
  "use strict";
  const { val, byPath, first } = EN16931.util;
  const FRAMEWORKS = new Set("B1 S1 M1 B2 S2 M2 S3 B4 S4 M4 S5 S6 B7 S7 B8 S8 M8 B9 S9 M9".split(" "));
  const raw = (el) => (el ? el.textContent : "");
  const norm = (s) => String(s).replace(/\s+/g, " ").trim();
  const noteValue = (all, code) => { const after = all.split("#" + code + "#").slice(1).join("#" + code + "#"); return after.split("#")[0]; };
  const isExtended = (R) => /extended-ctc-fr/i.test(val(R, "CustomizationID"));

  function luhn(s) {
    let sum = 0;
    s.split("").map(Number).reverse().forEach((n, i) => { if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; });
    return sum % 10 === 0;
  }
  // La Poste SIRETs (SIREN 356000000) use a digit-sum-mod-5 check instead of Luhn.
  const siretDigits = (s) => (s.startsWith("356000000") ? s.split("").reduce((t, d) => t + +d, 0) % 5 === 0 : luhn(s));
  // FR VAT number: FR + 2-character key + SIREN; a numeric key is (12 + 3 × (SIREN mod 97)) mod 97.
  function frVat(v) {
    const m = /^FR([0-9A-Z]{2})(\d{9})$/.exec(v);
    if (!m) return false;
    return !/^\d{2}$/.test(m[1]) || +m[1] === (12 + 3 * (Number(m[2]) % 97)) % 97;
  }

  const brFr = EdocSchematron.runner(window.FR_RULES);
  const brFrExt = EdocSchematron.runner(window.FR_EXT_RULES);

  EN16931.register("fr", {
    label: "France CTC",
    name: "France (CTC e-invoicing)",
    // The French profiles use the plain EN 16931 CustomizationID, so a French billing framework (BT-23) or a #BAR# note also counts.
    detect: (R) => /urn\.cpro\.gouv\.fr/.test(val(R, "CustomizationID")) || FRAMEWORKS.has(val(R, "ProfileID")) ||
      byPath(R, "Note").some((n) => raw(n).includes("#BAR#")),
    // the EN 16931 rules the EXTENDED-CTC-FR profile leaves out
    off: (R) => (isExtended(R) ? new Set(window.FR_EXT_OFF) : null),
    run(c) { for (const _ of this.steps(c)); },
    *steps(c) {
      const { R, rule, each, has, txt, seller, buyer, allEls } = c;
      yield* brFr.steps(c);
      if (isExtended(R)) yield* brFrExt.steps(c);
      const notes = byPath(R, "Note").map(raw), allNotes = notes.join("#");
      const bar = allNotes.includes("#BAR#") ? noteValue(allNotes, "BAR") : null;
      const sirenOf = (party, path) => byPath(party, path || "PartyLegalEntity/CompanyID").filter((e) => e.getAttribute("schemeID") === "0002");
      const at = (els, name) => els.map((el) => ({ el, name: name(el) }));
      const desc = (el) => el.localName + " " + norm(raw(el));

      // ---------- This tool's own checks (warnings, not in BR-FR) ----------
      each("FR-CHK-01", at(allEls.filter((e) => e.getAttribute("schemeID") === "0002" && /^\d{9}$/.test(txt(e))), desc), (el) => luhn(txt(el)),
        "SIREN numbers should have a valid check digit", true);
      each("FR-CHK-02", at(allEls.filter((e) => e.getAttribute("schemeID") === "0009" && /^\d{14}$/.test(txt(e))), desc), (el) => siretDigits(txt(el)),
        "SIRET numbers should have a valid check digit", true);
      const franchise = c.subs.some((s) => /VATEX-FR-FRANCHISE/i.test(val(s.el, "TaxCategory/TaxExemptionReasonCode")));
      if (!franchise) rule("FR-CHK-03", seller, c.taxIds(seller, true).length > 0, "Seller VAT ID (BT-31) should be given (except under the VAT franchise)", "", true);
      const frIds = [[seller, "seller"], [buyer, "buyer"]].flatMap(([p, who]) => c.taxIds(p, true).filter((v) => v.startsWith("FR")).map((v) => ({ el: p, name: who + " " + v, v })));
      each("FR-CHK-04", frIds, (el, o) => frVat(o.v), "French VAT IDs should be FR + a valid 2-character key + the 9-digit SIREN", true);
      const sellerSiren = sirenOf(seller)[0], sellerFrVat = c.taxIds(seller, true).find((v) => v.startsWith("FR"));
      if (sellerSiren && sellerFrVat) rule("FR-CHK-05", seller, sellerFrVat.slice(4) === txt(sellerSiren),
        "Seller VAT ID should contain the seller SIREN", sellerFrVat + " / " + txt(sellerSiren), true);
      const addressOk = (p) => has(p, "PostalAddress/StreetName") && has(p, "PostalAddress/CityName") && has(p, "PostalAddress/PostalZone");
      rule("FR-CHK-06", seller, addressOk(seller), "Seller address should have street, city and post code (legal mention)", "", true);
      if (bar !== "B2C") rule("FR-CHK-07", buyer, addressOk(buyer), "Buyer address should have street, city and post code (legal mention)", "", true);
      rule("FR-CHK-08", R, has(R, "Delivery/ActualDeliveryDate") || !!first(R, "InvoicePeriod"),
        "Delivery date (BT-72) or invoicing period (BG-14) should be given (date of the sale or service)", "", true);
    }
  });
  window.FranceRules = { ids: brFr.ids.concat(brFrExt.ids), version: window.FR_RULES.version };
})();
