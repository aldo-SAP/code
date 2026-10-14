/*
 * PEPPOL BIS Billing 3.0 rules on top of EN 16931 (load after en16931-rules.js).
 *
 * Covers the PEPPOL-EN16931-R/P/CL rules, the PEPPOL-COMMON identifier checks and the national rules PEPPOL runs
 * for sellers in the Netherlands (NL-R-), Norway (NO-R-), Denmark (DK-R-) and Sweden (SE-R-).
 * Not covered: Greek, Icelandic, Italian and German national rules, and the PEPPOL rules that repeat EN 16931 ones
 * already checked (dates, MIME and reason code lists).
 */
(function () {
  "use strict";
  const { val } = EN16931.util;

  const SPEC_ID = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
  const INVOICE_TYPES = new Set("71 80 82 84 102 218 219 326 331 380 382 383 386 388 393 395 553 575 623 780 817 870 875 876 877".split(" "));
  const CREDIT_TYPES = new Set("81 83 381 396 532".split(" "));
  // Electronic address schemes (EAS).
  const EAS = new Set(("0002 0007 0009 0037 0060 0088 0096 0097 0106 0130 0135 0142 0147 0151 0154 0158 0170 0183 0184 0188 0190 0191 " +
    "0192 0193 0194 0195 0196 0198 0199 0200 0201 0202 0203 0204 0205 0208 0209 0210 0211 0212 0213 0215 0216 0218 0221 0225 0230 0235 0240 " +
    "9901 9910 9913 9914 9915 9918 9919 9920 9922 9923 9924 9925 9926 9927 9928 9929 9930 9931 9932 9933 9934 9935 9936 9937 9938 9939 " +
    "9940 9941 9942 9943 9944 9945 9946 9947 9948 9949 9950 9951 9952 9953 9957 9959 AN AQ AS AU EM").split(" "));

  // ---------- Identifier check digits ----------
  const digits = (s) => s.split("").map(Number);
  function gln(s) { // GS1 mod 10
    if (!/^\d{13}$/.test(s)) return false;
    const d = digits(s), sum = d.slice(0, 12).reduce((t, n, i) => t + n * (i % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === d[12];
  }
  function noOrg(s) { // mod 11, weights 3 2 7 6 5 4 3 2
    if (!/^\d{9}$/.test(s)) return false;
    const w = [3, 2, 7, 6, 5, 4, 3, 2], d = digits(s);
    const r = 11 - (w.reduce((t, x, i) => t + x * d[i], 0) % 11);
    return (r === 11 ? 0 : r) === d[8];
  }
  function luhn(s) {
    let sum = 0;
    digits(s).reverse().forEach((n, i) => { if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; });
    return sum % 10 === 0;
  }
  const beEnterprise = (s) => /^[01]\d{9}$/.test(s) && 97 - (Number(s.slice(0, 8)) % 97) === Number(s.slice(8));
  const ID_FORMAT = {
    "0088": ["PEPPOL-COMMON-R040", "GLN identifiers must have 13 digits and a valid GS1 check digit", gln],
    "0192": ["PEPPOL-COMMON-R041", "Norwegian organisation numbers must have 9 digits and a valid check digit", noOrg],
    "0184": ["PEPPOL-COMMON-R042", "Danish CVR numbers must have 8 digits (or 10 for a P-number)", (s) => /^(\d{8}|\d{10})$/.test(s)],
    "0208": ["PEPPOL-COMMON-R043", "Belgian enterprise numbers must have 10 digits and a valid mod-97 check", beEnterprise],
    "0007": ["PEPPOL-COMMON-R049", "Swedish organisation numbers must have 10 digits and a valid Luhn check", (s) => /^\d{10}$/.test(s) && luhn(s)]
  };

  EN16931.register("peppol", {
    label: "PEPPOL BIS 3.0",
    name: "PEPPOL BIS Billing 3.0",
    detect: (R) => /peppol\.eu:2017:poacc:billing/.test(val(R, "CustomizationID")),
    run(c) {
      const { R, cn, rule, cmp, each, items, has, first, byPath, txt, num, round, fmt, seller, buyer } = c;
      const country = (p) => val(p, "PostalAddress/Country/IdentificationCode");
      const sellerCountry = country(seller), buyerCountry = country(buyer);

      // ---------- Document ----------
      rule("PEPPOL-EN16931-R001", R, c.has(R, "ProfileID"), "Business process (BT-23) must be present");
      if (has(R, "ProfileID")) rule("PEPPOL-EN16931-R007", first(R, "ProfileID"), /^urn:fdc:peppol\.eu:2017:poacc:billing:\d{2}:1\.0$/.test(val(R, "ProfileID")),
        "Business process (BT-23) must have the form urn:fdc:peppol.eu:2017:poacc:billing:NN:1.0", val(R, "ProfileID"));
      rule("PEPPOL-EN16931-R004", first(R, "CustomizationID"), val(R, "CustomizationID").startsWith(SPEC_ID),
        "Specification identifier (BT-24) must be the PEPPOL BIS Billing 3.0 one", val(R, "CustomizationID"));
      const notes = byPath(R, "Note");
      if (notes.length > 1) rule("PEPPOL-EN16931-R002", notes, sellerCountry === "DE" && buyerCountry === "DE",
        "Only one document note (BT-22) is allowed, unless seller and buyer are both German", notes.length + " notes");
      rule("PEPPOL-EN16931-R003", R, has(R, "BuyerReference") || has(R, "OrderReference/ID"), "A buyer reference (BT-10) or purchase order reference (BT-13) must be present");
      if (c.taxCur) rule("PEPPOL-EN16931-R005", first(R, "TaxCurrencyCode"), c.taxCur !== c.docCur, "VAT accounting currency (BT-6) must differ from the invoice currency (BT-5)");
      const objects = byPath(R, "AdditionalDocumentReference").filter((d) => val(d, "DocumentTypeCode") === "130");
      if (objects.length) rule("PEPPOL-EN16931-R006", objects, objects.length === 1, "Only one invoiced object identifier (BT-18) is allowed on document level");
      const projects = byPath(R, "ProjectReference");
      if (projects.length) rule("PEPPOL-EN16931-R080", projects, projects.length === 1, "Only one project reference (BT-11) is allowed");
      const empty = c.allEls.filter((e) => !e.children.length && !txt(e));
      rule("PEPPOL-EN16931-R008", empty.length ? empty : R, !empty.length, "The document must not have empty elements",
        empty.length ? "Empty: " + c.names(empty.map((e) => e.localName)) : "");
      const typeTag = cn ? "CreditNoteTypeCode" : "InvoiceTypeCode";
      if (c.typeCode) {
        if (cn) rule("PEPPOL-EN16931-P0101", first(R, typeTag), CREDIT_TYPES.has(c.typeCode), "Credit note type code (BT-3) must be one PEPPOL allows for credit notes (81, 83, 381, 396, 532)", c.typeCode);
        else rule("PEPPOL-EN16931-P0100", first(R, typeTag), INVOICE_TYPES.has(c.typeCode),
          "Invoice type code (BT-3) must be one PEPPOL allows for invoices" + (CREDIT_TYPES.has(c.typeCode) ? " (a credit note must use the CreditNote document)" : ""), c.typeCode);
      }
      if (has(R, "InvoicePeriod/DescriptionCode")) rule("PEPPOL-EN16931-CL006", first(R, "InvoicePeriod/DescriptionCode"),
        ["3", "35", "432"].includes(val(R, "InvoicePeriod/DescriptionCode")), "VAT point date code (BT-8) must be 3, 35 or 432");

      // ---------- Parties ----------
      rule("PEPPOL-EN16931-R020", seller, !!first(seller, "EndpointID"), "Seller electronic address (BT-34) must be present");
      rule("PEPPOL-EN16931-R010", buyer, !!first(buyer, "EndpointID"), "Buyer electronic address (BT-49) must be present");
      each("PEPPOL-EN16931-CL008", items([first(seller, "EndpointID"), first(buyer, "EndpointID")].filter(Boolean), (el) => "scheme " + (el.getAttribute("schemeID") || "(none)")),
        (el) => EAS.has(el.getAttribute("schemeID")), "Electronic address schemes must be on the EAS code list");
      const schemed = c.allEls.filter((e) => ID_FORMAT[e.getAttribute("schemeID")]);
      Object.keys(ID_FORMAT).forEach((scheme) => {
        const [id, text, test] = ID_FORMAT[scheme];
        each(id, items(schemed.filter((e) => e.getAttribute("schemeID") === scheme), (el) => el.localName + " " + txt(el)), (el) => test(txt(el)), text);
      });

      // ---------- Allowances and charges ----------
      const acAll = c.allows.concat(c.charges, c.lineAllows, c.lineCharges);
      each("PEPPOL-EN16931-R043", acAll, (el) => /^(true|false)$/.test(val(el, "ChargeIndicator")), "Allowance/charge indicator must be 'true' or 'false'");
      each("PEPPOL-EN16931-R041", acAll.filter((o) => has(o.el, "MultiplierFactorNumeric")), (el) => has(el, "BaseAmount"),
        "Allowances/charges with a percentage must also give the base amount");
      each("PEPPOL-EN16931-R042", acAll.filter((o) => has(o.el, "BaseAmount")), (el) => has(el, "MultiplierFactorNumeric"),
        "Allowances/charges with a base amount must also give the percentage");
      acAll.filter((o) => has(o.el, "BaseAmount") && has(o.el, "MultiplierFactorNumeric")).forEach((o) => {
        const base = num(val(o.el, "BaseAmount")), pct = num(val(o.el, "MultiplierFactorNumeric"));
        if (base !== null && pct !== null) cmp("PEPPOL-EN16931-R040", o.el, base * pct / 100, num(val(o.el, "Amount")), o.name + ": amount must equal base × percentage", "amount", 0.02,
          "base " + fmt(base) + " × " + val(o.el, "MultiplierFactorNumeric") + " %");
      });

      // ---------- Lines ----------
      const docStart = val(R, "InvoicePeriod/StartDate"), docEnd = val(R, "InvoicePeriod/EndDate");
      each("PEPPOL-EN16931-R044", c.lines.filter((o) => first(o.el, "Price/AllowanceCharge")), (el) => val(el, "Price/AllowanceCharge/ChargeIndicator") === "false",
        "Price adjustments must be allowances (indicator 'false'); price charges are not allowed");
      c.lines.filter((o) => has(o.el, "Price/AllowanceCharge/BaseAmount")).forEach((o) => {
        const gross = num(val(o.el, "Price/AllowanceCharge/BaseAmount")), disc = num(val(o.el, "Price/AllowanceCharge/Amount")) || 0;
        if (gross !== null) cmp("PEPPOL-EN16931-R046", o.el, gross - disc, num(val(o.el, "Price/PriceAmount")), o.name + ": net price must equal gross price − price discount", "BT-146", 0,
          "gross " + fmt(gross) + " − discount " + fmt(disc));
      });
      c.lines.forEach((o) => {
        const qty = num(val(o.el, c.qtyTag)), price = num(val(o.el, "Price/PriceAmount"));
        const baseQty = has(o.el, "Price/BaseQuantity") ? num(val(o.el, "Price/BaseQuantity")) : 1;
        if (qty === null || price === null || !baseQty) return;
        const own = (charge) => byPath(o.el, "AllowanceCharge").filter((ac) => c.isCharge(ac) === charge).reduce((s, ac) => s + (num(val(ac, "Amount")) || 0), 0);
        const ch = own(true), al = own(false);
        cmp("PEPPOL-EN16931-R120", o.el, round(qty * (price / baseQty)) + ch - al, o.amt,
          o.name + ": net amount must equal quantity × net price / base quantity + charges − allowances", "BT-131", 0.02,
          "qty " + val(o.el, c.qtyTag) + " × price " + fmt(price) + " / base qty " + baseQty + " + charges " + fmt(ch) + " − allowances " + fmt(al));
      });
      each("PEPPOL-EN16931-R121", c.lines.filter((o) => has(o.el, "Price/BaseQuantity")), (el) => num(val(el, "Price/BaseQuantity")) > 0,
        "Price base quantity (BT-149) must be above zero");
      each("PEPPOL-EN16931-R130", c.lines.filter((o) => { const b = first(o.el, "Price/BaseQuantity"); return b && b.getAttribute("unitCode"); }),
        (el) => first(el, "Price/BaseQuantity").getAttribute("unitCode") === (first(el, c.qtyTag) || { getAttribute: () => "" }).getAttribute("unitCode"),
        "Price base quantity unit (BT-150) must match the invoiced quantity unit (BT-130)");
      each("PEPPOL-EN16931-R100", c.lines.filter((o) => first(o.el, "DocumentReference")), (el) => byPath(el, "DocumentReference").length === 1,
        "Only one invoiced object identifier (BT-128) is allowed per line");
      each("PEPPOL-EN16931-R101", c.lines.filter((o) => first(o.el, "DocumentReference")), (el) => val(el, "DocumentReference/DocumentTypeCode") === "130",
        "Line document references may only be used for the invoiced object (type code 130)");
      if (docStart) each("PEPPOL-EN16931-R110", c.lines.filter((o) => has(o.el, "InvoicePeriod/StartDate")), (el) => val(el, "InvoicePeriod/StartDate") >= docStart,
        "Line period start dates (BT-134) must be within the invoicing period");
      if (docEnd) each("PEPPOL-EN16931-R111", c.lines.filter((o) => has(o.el, "InvoicePeriod/EndDate")), (el) => val(el, "InvoicePeriod/EndDate") <= docEnd,
        "Line period end dates (BT-135) must be within the invoicing period");

      // ---------- VAT ----------
      const withSubs = c.taxTotals.filter((t) => first(t, "TaxSubtotal")), withoutSubs = c.taxTotals.filter((t) => !first(t, "TaxSubtotal"));
      rule("PEPPOL-EN16931-R053", c.taxTotals, withSubs.length === 1, "There must be exactly one tax total with a VAT breakdown", withSubs.length + " found");
      if (c.taxCur) {
        rule("PEPPOL-EN16931-R054", c.taxTotals, withoutSubs.length === 1, "There must be exactly one tax total without breakdown (the accounting currency one)", withoutSubs.length + " found");
        const inTax = withoutSubs.map((t) => num(val(t, "TaxAmount")))[0];
        if (c.vat !== null && inTax != null) rule("PEPPOL-EN16931-R055", c.taxTotals, Math.sign(c.vat) === Math.sign(inTax) || !c.vat || !inTax,
          "VAT total (BT-110) and VAT total in accounting currency (BT-111) must have the same sign");
      }

      // ---------- Payment ----------
      each("PEPPOL-EN16931-R061", items(byPath(R, "PaymentMeans").filter((p) => ["49", "59"].includes(val(p, "PaymentMeansCode"))), () => "direct debit"),
        (el) => has(el, "PaymentMandate/ID"), "Direct debits (code 49 or 59) must give the mandate reference (BT-89)");

      // ---------- National rules (by seller country) ----------
      const addressOk = (p) => has(p, "PostalAddress/StreetName") && has(p, "PostalAddress/CityName") && has(p, "PostalAddress/PostalZone");
      const kvkOrOin = (p) => ["0106", "0190"].includes((first(p, "PartyLegalEntity/CompanyID") || { getAttribute: () => "" }).getAttribute("schemeID"));
      const precedingRef = has(R, "BillingReference/InvoiceDocumentReference/ID");
      if (sellerCountry === "NL") {
        if (cn || c.typeCode === "381") rule("NL-R-001", R, precedingRef, "Dutch seller: a credit note must reference the invoice it corrects (BT-25)");
        rule("NL-R-002", seller, addressOk(seller), "Dutch seller: street (BT-35), city (BT-37) and post code (BT-38) must be given");
        rule("NL-R-003", seller, kvkOrOin(seller), "Dutch seller: legal registration (BT-30) must be a KvK (0106) or OIN (0190) number");
        if (buyerCountry === "NL") {
          rule("NL-R-004", buyer, addressOk(buyer), "Dutch buyer: street (BT-50), city (BT-52) and post code (BT-53) must be given");
          rule("NL-R-005", buyer, kvkOrOin(buyer), "Dutch buyer: legal registration (BT-47) must be a KvK (0106) or OIN (0190) number");
        }
        if (c.typeCode === "384") rule("NL-R-006", R, precedingRef, "Dutch seller: a corrective invoice (384) must reference the invoice it corrects (BT-25)");
        if (num(val(c.lmt, "PayableAmount")) > 0) rule("NL-R-007", R, !!first(R, "PaymentMeans"), "Dutch seller: payment instructions (BG-16) must be given when an amount is due");
        each("NL-R-008", items(byPath(R, "PaymentMeans/PaymentMeansCode"), txt), (el) => ["30", "48", "49", "57", "58", "59"].includes(txt(el)),
          "Dutch seller: payment means code must be 30, 48, 49, 57, 58 or 59");
        if (c.lines.some((o) => has(o.el, "OrderLineReference/LineID"))) rule("NL-R-009", R, has(R, "OrderReference/ID"),
          "Dutch seller: line order references need a purchase order reference (BT-13)");
      }
      if (sellerCountry === "NO") {
        const no = c.taxIds(seller, true);
        if (no.length) rule("NO-R-001", seller, no.every((v) => /^NO\d{9}MVA$/.test(v) && noOrg(v.slice(2, 11))),
          "Norwegian seller: VAT ID must be NO + a valid 9-digit organisation number + MVA", no.join(", "));
        rule("NO-R-002", seller, byPath(seller, "PartyTaxScheme").some((s) => val(s, "TaxScheme/ID") === "TAX" && /^Foretaksregisteret$/i.test(val(s, "CompanyID"))),
          "Norwegian seller: “Foretaksregisteret” should be stated (tax scheme TAX)", "", true);
      }
      if (sellerCountry === "DK") rule("DK-R-002", seller, has(seller, "PartyLegalEntity/CompanyID"), "Danish seller: legal registration (CVR, BT-30) must be given");
      if (sellerCountry === "SE") {
        const se = c.taxIds(seller, true).filter((v) => v.startsWith("SE"));
        if (se.length) {
          rule("SE-R-001", seller, se.every((v) => v.length === 14), "Swedish seller: VAT ID must have 14 characters", se.join(", "));
          rule("SE-R-002", seller, se.every((v) => /^\d{12}$/.test(v.slice(2))), "Swedish seller: VAT ID must end with 12 digits", se.join(", "));
        }
      }
    }
  });
})();
