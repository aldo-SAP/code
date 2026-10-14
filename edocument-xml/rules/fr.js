/*
 * France (CTC e-invoicing reform) checks on top of EN 16931 (load after en16931-rules.js).
 *
 * These follow the French requirements as understood from the reform (mandatory legal mentions, SIREN/SIRET,
 * electronic addresses, billing framework, document types). The IDs (FR-01 …) are this tool's own, not the
 * official BR-FR- numbers: verify against the current French external specifications before relying on them.
 * Rules where the requirement is less certain are reported as warnings.
 */
(function () {
  "use strict";
  const { val } = EN16931.util;

  // Billing framework / "cadre de facturation" (BT-23).
  const FRAMEWORKS = new Set("B1 S1 M1 B2 S2 M2 S3 B4 S4 M4 S5 S6 B7 S7 B8 S8 M8".split(" "));
  const DOC_TYPES = new Set("380 389 393 501 386 500 384 471 472 473 261 262 381 396 502 503".split(" "));
  const CORRECTIVE = new Set(["384", "471", "472", "473"]);
  const CREDIT = new Set(["381", "261", "262", "396", "502", "503"]);
  const OPERATIONS = new Set(["B2B", "B2BINT", "B2C", "OUTOFSCOPE", "ARCHIVEONLY"]);

  function luhn(s) {
    let sum = 0;
    s.split("").map(Number).reverse().forEach((n, i) => { if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; });
    return sum % 10 === 0;
  }
  const siren = (s) => /^\d{9}$/.test(s) && luhn(s);
  // La Poste SIRETs (SIREN 356000000) use a digit-sum-mod-5 check instead of Luhn.
  const siret = (s) => /^\d{14}$/.test(s) && (s.startsWith("356000000") ? s.split("").reduce((t, d) => t + +d, 0) % 5 === 0 : luhn(s));
  // FR VAT number: FR + 2-character key + SIREN; a numeric key is (12 + 3 × (SIREN mod 97)) mod 97.
  function frVat(v) {
    const m = /^FR([0-9A-Z]{2})(\d{9})$/.exec(v);
    if (!m) return false;
    return !/^\d{2}$/.test(m[1]) || +m[1] === (12 + 3 * (Number(m[2]) % 97)) % 97;
  }

  EN16931.register("fr", {
    label: "France CTC",
    name: "France (CTC e-invoicing)",
    detect: (R) => /urn\.cpro\.gouv\.fr/.test(val(R, "CustomizationID")),
    run(c) {
      const { R, rule, each, items, has, first, byPath, txt, num, seller, buyer } = c;
      const country = (p) => val(p, "PostalAddress/Country/IdentificationCode");
      const notes = byPath(R, "Note").map((n) => ({ el: n, code: (/^#([A-Z0-9]{2,4})#/.exec(txt(n)) || [])[1], text: txt(n).replace(/^#[A-Z0-9]{2,4}#/, "").trim() }));
      const noteOf = (code) => notes.find((n) => n.code === code);
      const operation = noteOf("BAR") ? noteOf("BAR").text.toUpperCase() : "";
      const b2c = operation === "B2C";
      const legalId = (p, scheme) => byPath(p, "PartyLegalEntity/CompanyID").find((e) => e.getAttribute("schemeID") === scheme);
      const addressOk = (p) => has(p, "PostalAddress/StreetName") && has(p, "PostalAddress/CityName") && has(p, "PostalAddress/PostalZone");
      const franchise = c.subs.some((s) => /VATEX-FR-FRANCHISE/i.test(val(s.el, "TaxCategory/TaxExemptionReasonCode")));

      // ---------- Seller and buyer identity ----------
      const sellerSiren = legalId(seller, "0002");
      rule("FR-01", seller, !!sellerSiren, "Seller legal registration (BT-30) must be a SIREN (scheme 0002)");
      each("FR-02", items(c.allEls.filter((e) => e.getAttribute("schemeID") === "0002"), (el) => el.localName + " " + txt(el)), (el) => siren(txt(el)),
        "SIREN numbers must have 9 digits and a valid check digit");
      each("FR-03", items(c.allEls.filter((e) => e.getAttribute("schemeID") === "0009"), (el) => el.localName + " " + txt(el)), (el) => siret(txt(el)),
        "SIRET numbers must have 14 digits and a valid check digit");
      if (!franchise) rule("FR-04", seller, c.taxIds(seller, true).length > 0, "Seller VAT ID (BT-31) must be given (except under the VAT franchise)");
      const frIds = [[seller, "seller"], [buyer, "buyer"]].flatMap(([p, who]) => c.taxIds(p, true).filter((v) => v.startsWith("FR")).map((v) => ({ el: p, name: who + " " + v, v })));
      each("FR-05", frIds, (el, o) => frVat(o.v), "French VAT IDs must be FR + a valid 2-character key + the 9-digit SIREN");
      const sellerFrVat = c.taxIds(seller, true).find((v) => v.startsWith("FR"));
      if (sellerSiren && sellerFrVat) rule("FR-06", seller, sellerFrVat.slice(4) === txt(sellerSiren),
        "Seller VAT ID should contain the seller SIREN", sellerFrVat + " / " + txt(sellerSiren), true);
      if (country(buyer) === "FR" && !b2c) {
        const buyerSiren = legalId(buyer, "0002");
        rule("FR-07", buyer, !!buyerSiren, "French business buyer: legal registration (BT-47) must be a SIREN (scheme 0002)");
      }
      rule("FR-08", [seller, buyer], !!first(seller, "EndpointID") && !!first(buyer, "EndpointID"),
        "Seller and buyer electronic addresses (BT-34, BT-49) must be given for routing");
      rule("FR-17", seller, addressOk(seller), "Seller address must have street, city and post code (legal mention)");
      if (!b2c) rule("FR-18", buyer, addressOk(buyer), "Buyer address must have street, city and post code (legal mention)");

      // ---------- Document ----------
      rule("FR-11", first(R, "ProfileID") || R, FRAMEWORKS.has(val(R, "ProfileID")),
        "Business process (BT-23) must be a French billing framework code (B1, S1, M1, B2 …)", val(R, "ProfileID") || "missing");
      if (c.typeCode) rule("FR-12", first(R, c.cn ? "CreditNoteTypeCode" : "InvoiceTypeCode"), DOC_TYPES.has(c.typeCode),
        "Document type (BT-3) must be one the French reform accepts", c.typeCode);
      const precedingRef = has(R, "BillingReference/InvoiceDocumentReference/ID");
      if (CORRECTIVE.has(c.typeCode)) rule("FR-13", R, precedingRef, "A corrective invoice must reference the invoice it corrects (BT-25)", c.typeCode);
      if (CREDIT.has(c.typeCode)) rule("FR-14", R, precedingRef, "A credit note should reference the invoice it credits (BT-25)", c.typeCode, true);
      const id = val(R, "ID");
      if (id) rule("FR-16", first(R, "ID"), id.length <= 35 && /^[A-Za-z0-9+\-_/]+$/.test(id),
        "Invoice number (BT-1) should have at most 35 characters: letters, digits, + - _ /", id, true);
      if (num(val(c.lmt, "PayableAmount")) > 0) rule("FR-15", R, has(R, "DueDate") || has(R, "PaymentMeans/PaymentDueDate"),
        "A payment due date (BT-9) must be given (legal mention)");
      rule("FR-19", R, has(R, "Delivery/ActualDeliveryDate") || !!first(R, "InvoicePeriod"),
        "Delivery date (BT-72) or invoicing period (BG-14) should be given (date of the sale or service)", "", true);

      // ---------- Mandatory notes ----------
      [["PMT", "fixed recovery fee of 40 € (indemnité forfaitaire)"], ["PMD", "late payment penalties"], ["AAB", "early payment discount (escompte)"]]
        .forEach(([code, what]) => rule("FR-09", noteOf(code) ? noteOf(code).el : R, !!noteOf(code), "Note #" + code + "# must state the " + what));
      rule("FR-10", noteOf("BAR") ? noteOf("BAR").el : R, OPERATIONS.has(operation),
        "Note #BAR# should give the operation type (B2B, B2BINT, B2C, OUTOFSCOPE or ARCHIVEONLY)", operation || "missing", true);
    }
  });
})();
