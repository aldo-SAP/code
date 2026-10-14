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
  const LISTS = window.EN16931_LISTS || {};
  const listSet = (name) => new Set((LISTS[name] || "").split(" ").filter(Boolean));
  const INVOICE_TYPES = new Set("71 80 82 84 102 218 219 326 331 380 382 383 384 386 388 393 395 553 575 623 780 817 870 875 876 877".split(" "));
  const CREDIT_TYPES = new Set("81 83 381 396 532".split(" "));
  const MIME_CODES = listSet("peppolMime"), CHARGE_CODES = listSet("peppolCharge"), CURRENCIES = listSet("peppolCurrency"), EAS = listSet("peppolEas");
  const ALLOWANCE_CODES = listSet("allowance");
  const AMOUNT_ELEMENTS = "Amount BaseAmount PriceAmount TaxAmount TaxableAmount LineExtensionAmount TaxExclusiveAmount TaxInclusiveAmount AllowanceTotalAmount ChargeTotalAmount PrepaidAmount PayableRoundingAmount PayableAmount".split(" ");
  const VATEX_CATEGORY = { "VATEX-EU-G": "G", "VATEX-EU-O": "O", "VATEX-EU-IC": "K", "VATEX-EU-AE": "AE", "VATEX-EU-D": "E", "VATEX-EU-F": "E", "VATEX-EU-I": "E", "VATEX-EU-J": "E" };
  const VATEX_RULE = { "VATEX-EU-G": "P0104", "VATEX-EU-O": "P0105", "VATEX-EU-IC": "P0106", "VATEX-EU-AE": "P0107", "VATEX-EU-D": "P0108", "VATEX-EU-F": "P0109", "VATEX-EU-I": "P0110", "VATEX-EU-J": "P0111" };
  const DATE_ELEMENTS = new Set("IssueDate DueDate TaxPointDate StartDate EndDate ActualDeliveryDate".split(" "));

  // ---------- Identifier check digits ----------
  const digits = (s) => s.split("").map(Number);
  function gln(s) { // GS1 mod 10 over the digits before the check digit, weights 3,1,3,… from the right (the official rule accepts any length)
    if (!/^\d{2,}$/.test(s)) return false;
    const d = digits(s), data = d.slice(0, -1).reverse(), sum = data.reduce((t, n, i) => t + n * (i % 2 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10 === d[d.length - 1];
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
  const beEnterprise = (s) => /^\d{10}$/.test(s) && 97 - (Number(s.slice(0, 8)) % 97) === Number(s.slice(8));
  const mod11 = (s) => { // weights 2..7 from the right, over all but the check digit
    if (!/^\d{9}$/.test(s) || !Number(s)) return false;
    const d = digits(s).slice(0, 8).reverse(), sum = d.reduce((t, n, i) => t + n * ((i % 6) + 2), 0);
    return (11 - (sum % 11)) % 11 === Number(s[8]);
  };
  const abn = (s) => /^\d{11}$/.test(s) && ((s.charCodeAt(0) - 49) * 10 + [1, 3, 5, 7, 9, 11, 13, 15, 17, 19].reduce((t, w, i) => t + (s.charCodeAt(i + 1) - 48) * w, 0)) % 89 === 0;
  const codiceIpa = (s) => /^[A-Za-z0-9]{6}$/.test(s);
  const codiceFiscale = (s) => (s.length === 11 && /^\d+$/.test(s)) || (s.length === 16 && /^[A-Za-z]{6}\d\d[A-Za-z]\d\d.{3}\d[A-Za-z]$/.test(s));
  const partitaIva = (s) => { // Italian VAT numbers (IT + 11 digits with a check digit); other countries pass
    if (s.slice(0, 2).toUpperCase() !== "IT") return true;
    const c = s.slice(2);
    if (!/^\d{11}$/.test(c)) return false;
    const sum = digits(c).reduce((t, n, i) => t + (i % 2 ? (n * 2 > 9 ? n * 2 - 9 : n * 2) : n), 0);
    return sum % 10 === 0;
  };
  // [rule id, message, check, warning?]; each applies to endpoint ids, party identifiers and legal registrations with that scheme.
  const ID_FORMAT = {
    "0088": ["PEPPOL-COMMON-R040", "GLN identifiers must be digits with a valid GS1 check digit", gln],
    "0192": ["PEPPOL-COMMON-R041", "Norwegian organisation numbers must have 9 digits and a valid check digit", mod11],
    "0184": ["PEPPOL-COMMON-R042", "Danish CVR numbers must be 8 digits, optionally with the DK prefix", (s) => /^(DK\d{8}|\d{8})$/.test(s)],
    "0208": ["PEPPOL-COMMON-R043", "Belgian enterprise numbers must have 10 digits and a valid mod-97 check", beEnterprise],
    "0201": ["PEPPOL-COMMON-R044", "IPA codes (Codice Univoco Unità Organizzativa) must have 6 letters or digits", codiceIpa, true],
    "0210": ["PEPPOL-COMMON-R045", "Italian Codice Fiscale must be 11 digits or a 16-character code", codiceFiscale, true],
    "0211": ["PEPPOL-COMMON-R047", "Italian VAT numbers (Partita IVA) must have 11 digits and a valid check digit", partitaIva, true],
    "0007": ["PEPPOL-COMMON-R049", "Swedish organisation numbers must have 10 digits and a valid Luhn check", (s) => /^\d{10}$/.test(s) && luhn(s)],
    "0151": ["PEPPOL-COMMON-R050", "Australian Business Numbers must have 11 digits and a valid check", abn],
    "0096": ["PEPPOL-COMMON-R052", "Danish chamber of commerce numbers (P) must have 10 digits", (s) => /^\d{10}$/.test(s), true],
    "0198": ["PEPPOL-COMMON-R053", "Danish ERSTORG numbers (SE) must be DK followed by 8 digits", (s) => /^DK\d{8}$/.test(s), true]
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
      const profileId = val(R, "ProfileID").trim();
      const profile = /urn:fdc:peppol\.eu:2017:poacc:billing:([0-9]{2}):1\.0/.test(profileId) ? profileId.split(":")[6] : "Unknown";
      rule("PEPPOL-EN16931-R001", R, !!first(R, "ProfileID"), "Business process (BT-23) must be present");
      rule("PEPPOL-EN16931-R007", first(R, "ProfileID") || R, profile !== "Unknown",
        "Business process (BT-23) must have the form urn:fdc:peppol.eu:2017:poacc:billing:NN:1.0", profileId);
      rule("PEPPOL-EN16931-R004", first(R, "CustomizationID"), val(R, "CustomizationID").trim().startsWith(SPEC_ID),
        "Specification identifier (BT-24) must be the PEPPOL BIS Billing 3.0 one", val(R, "CustomizationID"));
      const notes = byPath(R, "Note");
      if (notes.length > 1) rule("PEPPOL-EN16931-R002", notes, sellerCountry === "DE" && buyerCountry === "DE",
        "Only one document note (BT-22) is allowed, unless seller and buyer are both German", notes.length + " notes");
      rule("PEPPOL-EN16931-R003", R, !!(first(R, "BuyerReference") || first(R, "OrderReference/ID")), "A buyer reference (BT-10) or purchase order reference (BT-13) must be present");
      if (first(R, "TaxCurrencyCode")) rule("PEPPOL-EN16931-R005", first(R, "TaxCurrencyCode"), val(R, "TaxCurrencyCode").trim() !== val(R, "DocumentCurrencyCode").trim(),
        "VAT accounting currency (BT-6) must differ from the invoice currency (BT-5)");
      if (cn) { const projects = byPath(R, "AdditionalDocumentReference").filter((d) => val(d, "DocumentTypeCode") === "50");
        if (projects.length) rule("PEPPOL-EN16931-R080", projects, projects.length === 1, "Only one project reference is allowed on a credit note"); }
      const empty = [R].concat(c.allEls).filter((e) => !e.children.length && !txt(e));
      rule("PEPPOL-EN16931-R008", empty.length ? empty : R, !empty.length, "The document must not have empty elements",
        empty.length ? "Empty: " + c.names(empty.map((e) => e.localName)) : "");
      const typeTag = cn ? "CreditNoteTypeCode" : "InvoiceTypeCode";
      if (first(R, typeTag)) {
        const code = val(R, typeTag).trim();
        if (cn) rule("PEPPOL-EN16931-P0101", first(R, typeTag), profile !== "01" || CREDIT_TYPES.has(code), "Credit note type code (BT-3) must be one PEPPOL allows for credit notes (81, 83, 381, 396, 532)", code);
        else {
          rule("PEPPOL-EN16931-P0100", first(R, typeTag), profile !== "01" || INVOICE_TYPES.has(code),
            "Invoice type code (BT-3) must be one PEPPOL allows for invoices" + (CREDIT_TYPES.has(code) ? " (a credit note must use the CreditNote document)" : ""), code);
          rule("PEPPOL-EN16931-P0112", first(R, typeTag), !(code === "326" || code === "384") || (sellerCountry === "DE" && buyerCountry === "DE"),
            "Invoice type code 326 or 384 is only allowed when both buyer and seller are German organisations", code);
        }
      }
      each("PEPPOL-EN16931-CL006", items(byPath(R, "InvoicePeriod/DescriptionCode"), txt), (el) => ["3", "35", "432"].includes(txt(el)),
        "VAT point date code (BT-8) must be 3, 35 or 432");
      // dates, code lists and currencies
      each("PEPPOL-EN16931-F001", items(c.allEls.filter((e) => DATE_ELEMENTS.has(e.localName)), (el) => el.localName + " " + txt(el)),
        (el) => txt(el).length === 10 && c.validDate(txt(el)), "A date must be written YYYY-MM-DD");
      each("PEPPOL-EN16931-CL001", items(c.allEls.filter((e) => e.localName === "EmbeddedDocumentBinaryObject" && e.hasAttribute("mimeCode")), (el) => el.getAttribute("mimeCode")),
        (el) => MIME_CODES.has(el.getAttribute("mimeCode")), "Attachment MIME codes must be on the PEPPOL subset of the IANA list");
      const acs = c.allEls.filter((e) => e.localName === "AllowanceCharge" && first(e, "AllowanceChargeReasonCode"));
      each("PEPPOL-EN16931-CL002", items(acs.filter((e) => val(e, "ChargeIndicator") === "false"), (el) => val(el, "AllowanceChargeReasonCode")),
        (el) => ALLOWANCE_CODES.has(val(el, "AllowanceChargeReasonCode").trim()), "Allowance reason codes must be on the UNCL 5189 subset");
      each("PEPPOL-EN16931-CL003", items(acs.filter((e) => val(e, "ChargeIndicator") === "true"), (el) => val(el, "AllowanceChargeReasonCode")),
        (el) => CHARGE_CODES.has(val(el, "AllowanceChargeReasonCode").trim()), "Charge reason codes must be UNCL 7161 codes");
      const amountEls = c.allEls.filter((e) => AMOUNT_ELEMENTS.includes(e.localName));
      each("PEPPOL-EN16931-CL007", items(amountEls, (el) => el.localName + " " + (el.getAttribute("currencyID") || "(none)")),
        (el) => CURRENCIES.has(el.getAttribute("currencyID") || ""), "Amount currencies must be ISO 4217 codes");
      // every amount carries the invoice currency, except the VAT total in the accounting currency
      const docCurrency = val(R, "DocumentCurrencyCode");
      const sameCurrency = amountEls.filter((e) => e.localName !== "TaxAmount" || (e.parentElement && (e.parentElement.localName === "TaxSubtotal" ||
        (e.parentElement.localName === "TaxTotal" && first(e.parentElement, "TaxSubtotal")))));
      each("PEPPOL-EN16931-R051", items(sameCurrency, (el) => el.localName + " " + (el.getAttribute("currencyID") || "(none)")),
        (el) => el.getAttribute("currencyID") === docCurrency, "All amounts must use the invoice currency (BT-5), except the VAT total in the accounting currency");

      // ---------- Parties ----------
      if (seller) rule("PEPPOL-EN16931-R020", seller, !!first(seller, "EndpointID"), "Seller electronic address (BT-34) must be present");
      if (buyer) rule("PEPPOL-EN16931-R010", buyer, !!first(buyer, "EndpointID"), "Buyer electronic address (BT-49) must be present");
      each("PEPPOL-EN16931-CL008", items(c.allEls.filter((e) => e.localName === "EndpointID" && e.hasAttribute("schemeID")), (el) => "scheme " + el.getAttribute("schemeID")),
        (el) => EAS.has(el.getAttribute("schemeID")), "Electronic address schemes must be on the EAS code list");
      // identifier formats: endpoints, party identifiers and legal registrations (the Italian Codice Fiscale 9907 only on endpoints)
      const schemed = c.allEls.filter((e) => e.hasAttribute("schemeID") && ID_FORMAT[e.getAttribute("schemeID")] && (e.localName === "EndpointID" ||
        e.localName === "CompanyID" || (e.localName === "ID" && e.parentElement && e.parentElement.localName === "PartyIdentification")));
      Object.keys(ID_FORMAT).forEach((scheme) => {
        const [id, text, test, warn] = ID_FORMAT[scheme];
        each(id, items(schemed.filter((e) => e.getAttribute("schemeID") === scheme), (el) => el.localName + " " + txt(el)), (el) => test(txt(el).trim()), text, warn);
      });
      each("PEPPOL-COMMON-R046", items(c.allEls.filter((e) => e.localName === "EndpointID" && e.getAttribute("schemeID") === "9907"), txt), (el) => codiceFiscale(txt(el).trim()),
        "Italian Codice Fiscale must be 11 digits or a 16-character code", true);

      // ---------- Allowances and charges ----------
      const acAll = c.allows.concat(c.charges, c.lineAllows, c.lineCharges);
      // As in the official schematron one rule applies per allowance/charge: R041, else R042, else R040 and R043.
      const hasMult = (o) => !!first(o.el, "MultiplierFactorNumeric"), hasBase = (o) => !!first(o.el, "BaseAmount");
      each("PEPPOL-EN16931-R041", acAll.filter((o) => hasMult(o) && !hasBase(o)), () => false, "Allowances/charges with a percentage must also give the base amount");
      each("PEPPOL-EN16931-R042", acAll.filter((o) => !hasMult(o) && hasBase(o)), () => false, "Allowances/charges with a base amount must also give the percentage");
      const plain = acAll.filter((o) => hasMult(o) === hasBase(o));
      each("PEPPOL-EN16931-R043", plain, (el) => /^(true|false)$/.test(val(el, "ChargeIndicator").trim()), "Allowance/charge indicator must be 'true' or 'false'");
      plain.filter((o) => hasMult(o) && hasBase(o)).forEach((o) => {
        const base = num(val(o.el, "BaseAmount")), pct = num(val(o.el, "MultiplierFactorNumeric"));
        if (base !== null && pct !== null) cmp("PEPPOL-EN16931-R040", o.el, base * pct / 100, num(val(o.el, "Amount")) || 0, o.name + ": amount must equal base × percentage", "amount", 0.02 + 1e-9,
          "base " + fmt(base) + " × " + val(o.el, "MultiplierFactorNumeric") + " %");
      });

      // ---------- Lines ----------
      const docStart = val(R, "InvoicePeriod/StartDate"), docEnd = val(R, "InvoicePeriod/EndDate");
      each("PEPPOL-EN16931-R044", c.lines.filter((o) => first(o.el, "Price/AllowanceCharge")), (el) => val(el, "Price/AllowanceCharge/ChargeIndicator") === "false",
        "Price adjustments must be allowances (indicator 'false'); price charges are not allowed");
      c.lines.filter((o) => has(o.el, "Price/AllowanceCharge/BaseAmount")).forEach((o) => {
        const gross = num(val(o.el, "Price/AllowanceCharge/BaseAmount")), disc = num(val(o.el, "Price/AllowanceCharge/Amount"));
        if (gross !== null) cmp("PEPPOL-EN16931-R046", o.el, disc === null ? null : gross - disc, num(val(o.el, "Price/PriceAmount")), o.name + ": net price must equal gross price − price discount", "BT-146", 0,
          "gross " + fmt(gross) + " − discount " + (disc === null ? "?" : fmt(disc)));
      });
      c.lines.forEach((o) => {
        // missing values count as the official rule counts them: quantity and base quantity 1, price and amount 0
        const dec = (path, dflt) => (has(o.el, path) && num(val(o.el, path)) !== null ? num(val(o.el, path)) : dflt);
        const qty = dec(c.qtyTag, 1), price = dec("Price/PriceAmount", 0), baseQty = dec("Price/BaseQuantity", 1), ext = dec("LineExtensionAmount", 0);
        if (!baseQty) return;
        const own = (charge) => byPath(o.el, "AllowanceCharge").filter((ac) => val(ac, "ChargeIndicator").trim() === String(charge)).reduce((s, ac) => s + (num(val(ac, "Amount")) || 0), 0);
        const ch = own(true), al = own(false), calc = qty * (price / baseQty) + ch - al;
        const ok = Math.abs(ext - calc) <= 0.02 + 1e-9;
        rule("PEPPOL-EN16931-R120", o.el, ok, o.name + ": net amount must equal quantity × net price / base quantity + charges − allowances",
          "qty " + fmt(qty) + " × price " + fmt(price) + " / base qty " + baseQty + " + charges " + fmt(ch) + " − allowances " + fmt(al) + " = " + fmt(calc) + (ok ? " = " : " ≠ ") + "BT-131 " + fmt(ext));
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
      rule("PEPPOL-EN16931-R054", c.taxTotals, withoutSubs.length === (first(R, "TaxCurrencyCode") ? 1 : 0),
        first(R, "TaxCurrencyCode") ? "There must be exactly one tax total without breakdown (the accounting currency one)" : "A tax total without breakdown is only allowed with a VAT accounting currency (BT-6)", withoutSubs.length + " found");
      if (first(R, "TaxCurrencyCode")) {
        const inCur = (cur) => c.taxTotals.map((t) => first(t, "TaxAmount")).filter((e) => e && e.getAttribute("currencyID") === cur).map((e) => num(txt(e)));
        const a1 = inCur(val(R, "TaxCurrencyCode").trim()), a2 = inCur(val(R, "DocumentCurrencyCode").trim());
        rule("PEPPOL-EN16931-R055", c.taxTotals, a1.some((x) => x <= 0) && a2.some((x) => x <= 0) || a1.some((x) => x >= 0) && a2.some((x) => x >= 0),
          "VAT total (BT-110) and VAT total in accounting currency (BT-111) must have the same sign");
      }
      // exemption reason codes name the category they belong to
      c.allEls.filter((e) => e.localName === "TaxCategory" && has(e, "TaxExemptionReasonCode") && VATEX_CATEGORY[val(e, "TaxExemptionReasonCode").trim().toUpperCase()]).forEach((e) => {
        const code = val(e, "TaxExemptionReasonCode").trim().toUpperCase(), want = VATEX_CATEGORY[code];
        rule("PEPPOL-EN16931-" + VATEX_RULE[code], e, val(e, "ID").trim() === want, "Exemption reason " + code + " requires VAT category " + want, val(e, "ID"));
      });

      // ---------- Payment ----------
      each("PEPPOL-EN16931-R061", items(byPath(R, "PaymentMeans").filter((p) => ["49", "59"].includes(val(p, "PaymentMeansCode"))), () => "direct debit"),
        (el) => !!first(el, "PaymentMandate/ID"), "Direct debits (code 49 or 59) must give the mandate reference (BT-89)");

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
