/*
 * EN 16931 business rules for UBL invoices and credit notes.
 *
 * Follows the CEN EN 16931 UBL validation artefacts: core rules (BR-), conditions (BR-CO-), decimals (BR-DEC-),
 * the rules per VAT category (BR-S-, BR-Z-, BR-E-, BR-AE-, BR-IC-, BR-G-, BR-O-, BR-IG-, BR-IP-, BR-B-) and the
 * code lists that can be checked without the full UN/ECE tables (BR-CL-).
 * From the UBL schema it also checks date and number formats (XSD-DATE, XSD-DEC), which EN 16931 leaves to the XSD.
 * Not covered: PEPPOL BIS / national CIUS rules, UBL-CR/UBL-SR structure rules, the rest of XSD validation,
 * unit codes (Rec 20) and identifier scheme lists (ICD/EAS).
 *
 * Usage: EN16931.check(rootElement, "Invoice" | "CreditNote") → [{ id, ok, warn, text, detail, at }]
 * `at` lists the elements the rule is about (the failing ones when it fails).
 * Only rules whose condition the document triggers are returned.
 */
(function () {
  "use strict";

  // ---------- XML helpers (namespace-agnostic, direct children only) ----------
  const txt = (el) => (el ? el.textContent.trim() : "");
  function byPath(ctx, path) {
    if (!ctx) return [];
    let cur = [ctx];
    for (const seg of path.split("/")) {
      const next = [];
      for (const c of cur) for (const k of c.children) if (k.localName === seg) next.push(k);
      cur = next;
      if (!cur.length) break;
    }
    return cur;
  }
  const first = (ctx, path) => byPath(ctx, path)[0] || null;
  const val = (ctx, path) => txt(first(ctx, path));
  const has = (ctx, path) => !!val(ctx, path);
  function num(raw) { const s = String(raw).trim(); const n = Number(s); return s !== "" && isFinite(n) ? n : null; }
  const round = (x) => Math.round(x * 100) / 100;
  const fmt = (x) => round(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ---------- Code lists ----------
  const VAT_CAT = {
    S: "Standard rate", Z: "Zero rated", E: "Exempt from tax", AE: "VAT reverse charge",
    K: "Intra-community supply", G: "Export outside the EU", O: "Not subject to VAT",
    L: "Canary Islands (IGIC)", M: "Ceuta and Melilla (IPSI)", B: "Split payment (Italy)"
  };
  // UNTDID 1001 subset allowed by EN 16931.
  const DOC_TYPE_CODES = new Set(("71 80 81 82 83 84 102 130 202 203 204 211 218 219 261 262 295 296 308 325 326 331 380 381 " +
    "382 383 384 385 386 387 388 389 390 393 394 395 396 420 456 457 458 527 532 553 575 623 633 751 780 817 870 875 876 877 935").split(" "));
  // UNTDID 5189 (allowance reasons).
  const ALLOWANCE_CODES = new Set("41 42 60 62 63 64 65 66 67 68 70 71 88 95 100 102 103 104 105".split(" "));
  // CEF VATEX (VAT exemption reasons).
  const VATEX = new Set(["79-C", "132", "143", "148", "151", "309", "AE", "D", "F", "G", "I", "IC", "O", "J"].map((c) => "VATEX-EU-" + c)
    .concat("1A 1B 1C 1D 1E 1F 1FA 1G 1H 1I 1J 1K 1L 1M 1N 1O 1P 1Q".split(" ").map((c) => "VATEX-EU-132-" + c))
    .concat("1A 1B 1C 1D 1E 1F 1FA 1G 1H 1I 1J 1K 1L".split(" ").map((c) => "VATEX-EU-143-" + c))
    .concat("A B C D E F G H I".split(" ").map((c) => "VATEX-EU-148-" + c))
    .concat("1A 1AA 1B 1C 1D 1E".split(" ").map((c) => "VATEX-EU-151-" + c))
    .concat(["VATEX-FR-FRANCHISE", "VATEX-FR-CNWVAT"]));
  const MIME_CODES = new Set(["application/pdf", "image/png", "image/jpeg", "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.spreadsheet"]);

  let regionNames = null, currencyNames = null, currencySet = null;
  try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) {}
  try { currencyNames = new Intl.DisplayNames(["en"], { type: "currency" }); } catch (e) {}
  try { currencySet = new Set(Intl.supportedValuesOf("currency")); } catch (e) {}
  // Without Intl support only the format is checked.
  const validCurrency = (c) => /^[A-Z]{3}$/.test(c) && (!currencyNames || (currencySet && currencySet.has(c)) || currencyNames.of(c) !== c);
  // xs:date: YYYY-MM-DD that exists on the calendar, optionally followed by a time zone.
  function validDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/.exec(s);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  const validCountry =(c) => c === "XI" || c === "1A" || (/^[A-Z]{2}$/.test(c) && c !== "ZZ" && (!regionNames || regionNames.of(c) !== c));

  // ---------- VAT category rules ----------
  // Each category has the same rule set (-01 … -10); these settings are what differs between them.
  //   party:  which VAT identifiers must (or must not) be present
  //   rate:   the rate allowed on lines, allowances and charges
  //   reason: whether the breakdown needs (true) or must not have (false) an exemption reason
  //   single: exactly one breakdown in the category (taxable amount checked in total, not per rate)
  //   calc:   VAT is taxable × rate (otherwise it must be 0)
  const VAT_RULES = [
    { cat: "S", prefix: "S", party: "seller", rate: "pos", reason: false, single: false, calc: true },
    { cat: "Z", prefix: "Z", party: "seller", rate: "zero", reason: false, single: true, calc: false },
    { cat: "E", prefix: "E", party: "seller", rate: "zero", reason: true, single: true, calc: false },
    { cat: "AE", prefix: "AE", party: "reverse", rate: "zero", reason: true, single: true, calc: false },
    { cat: "K", prefix: "IC", party: "intra", rate: "zero", reason: true, single: true, calc: false },
    { cat: "G", prefix: "G", party: "export", rate: "zero", reason: true, single: true, calc: false },
    { cat: "O", prefix: "O", party: "none", rate: "absent", reason: true, single: true, calc: false },
    { cat: "L", prefix: "IG", party: "seller", rate: "nonneg", reason: false, single: false, calc: true },
    { cat: "M", prefix: "IP", party: "seller", rate: "nonneg", reason: false, single: false, calc: true }
  ];
  const PARTY_TEXT = {
    seller: "the seller VAT identifier (BT-31), tax registration (BT-32) or tax representative VAT identifier (BT-63) is present",
    reverse: "seller VAT ID (BT-31), tax registration (BT-32) or representative VAT ID (BT-63), and buyer VAT ID (BT-48) or legal registration (BT-47), are present",
    intra: "seller VAT ID (BT-31) or representative VAT ID (BT-63), and buyer VAT ID (BT-48), are present",
    export: "the seller VAT identifier (BT-31) or tax representative VAT identifier (BT-63) is present",
    none: "no seller, tax representative or buyer VAT identifier (BT-31, BT-63, BT-48) is present"
  };
  const RATE_TEXT = { pos: "the VAT rate is greater than 0", zero: "the VAT rate is 0", absent: "no VAT rate is given", nonneg: "the VAT rate is 0 or greater" };
  const RATE_OK = {
    pos: (o) => o.rate !== null && o.rate > 0,
    zero: (o) => o.rate === 0,
    absent: (o) => !o.rateRaw,
    nonneg: (o) => o.rate !== null && o.rate >= 0
  };

  // EN 16931 applies the rounding amount (BT-114) only to the amount due (BR-CO-16).
  // Older UBL 2.1 samples fold it into the total incl. VAT instead; detect that so the checks follow the file.
  function roundingInInclusive(R) {
    const lmt = first(R, "LegalMonetaryTotal");
    if (!lmt) return false;
    const g = (p) => num(val(lmt, p));
    const docCur = val(R, "DocumentCurrencyCode");
    const vatEl = byPath(R, "TaxTotal/TaxAmount").find((e) => !docCur || e.getAttribute("currencyID") === docCur);
    const vat = vatEl ? num(txt(vatEl)) : null, b109 = g("TaxExclusiveAmount"), b112 = g("TaxInclusiveAmount"), b114 = g("PayableRoundingAmount");
    if (!b114 || vat === null || b109 === null || b112 === null) return false;
    const same = (a, b) => Math.abs(Math.round(a * 100) - Math.round(b * 100)) < 1;
    return !same(b109 + vat, b112) && same(b109 + vat + b114, b112);
  }

  // Extra rule sets (PEPPOL, national CIUS) register here from their own files; see register().
  const SETS = {};
  function register(id, set) { SETS[id] = set; }
  // Rule sets whose detect() says they apply to this document (e.g. by CustomizationID).
  const detect = (R) => Object.keys(SETS).filter((id) => SETS[id].detect && SETS[id].detect(R));

  // Runs EN 16931 plus the given extra rule sets (ids passed to register()).
  function check(R, kind, extraSets) {
    const cn = kind === "CreditNote";
    const out = [];
    let setLabel = "EN 16931";

    // ---------- Reporting helpers ----------
    // `at` is the element (or elements) the rule is about, so the page can point at the block or line.
    const rule = (id, at, ok, text, detail, warn) =>
      out.push({ id, set: setLabel, ok: !!ok, text, detail: detail || "", at: [].concat(at || R).filter(Boolean), warn: !!warn });
    // Amount comparison; tol is the allowed difference (the schematron allows ±1 on VAT calculations).
    const cmp = (id, at, exp, actual, text, bt, tol) => {
      const ok = actual !== null && Math.abs(round(exp) - round(actual)) < (tol || 0.005);
      rule(id, at, ok, text, fmt(exp) + (ok ? " = " : " ≠ ") + bt + " " + (actual === null ? "missing" : fmt(actual)));
    };
    const names = (list) => list.slice(0, 6).join(", ") + (list.length > 6 ? " and " + (list.length - 6) + " more" : "");
    // Every item must pass the test; the failing ones are named in the detail.
    const each = (id, items, test, text, warn) => {
      if (!items.length) return;
      const bad = items.filter((o) => !test(o.el, o));
      rule(id, bad.length ? bad.map((o) => o.el) : items.map((o) => o.el), !bad.length, text, bad.length ? "Fails on " + names(bad.map((o) => o.name)) : "", warn);
    };
    const req = (id, ctx, path, text) => rule(id, ctx, has(ctx, path), text);

    // ---------- Document model ----------
    // Items are { el, name } plus, for anything that carries VAT, { cat, rate, rateRaw, amt }.
    const items = (els, name) => els.map((el, i) => ({ el, name: name(el, i) }));
    const taxed = (o, taxPath, amtPath) => Object.assign(o, {
      cat: val(o.el, taxPath + "/ID"), rateRaw: val(o.el, taxPath + "/Percent"),
      rate: num(val(o.el, taxPath + "/Percent")), amt: num(val(o.el, amtPath))
    });
    const sum = (list, key) => list.reduce((s, o) => s + (o[key] || 0), 0);
    const nonNeg = (raw) => { const n = num(raw); return n !== null && n >= 0; };

    const qtyTag = cn ? "CreditedQuantity" : "InvoicedQuantity";
    const lines = items(byPath(R, cn ? "CreditNoteLine" : "InvoiceLine"), (el, i) => "line " + (val(el, "ID") || i + 1))
      .map((o) => taxed(o, "Item/ClassifiedTaxCategory", "LineExtensionAmount"));
    const isCharge = (ac) => /^(true|1)$/.test(val(ac, "ChargeIndicator"));
    const allowCharges = (ctx, charge, prefix) =>
      items(byPath(ctx, "AllowanceCharge").filter((ac) => isCharge(ac) === charge),
        (el, i) => (prefix || "") + (charge ? "charge " : "allowance ") + (val(el, "AllowanceChargeReason") || val(el, "AllowanceChargeReasonCode") || i + 1))
        .map((o) => taxed(o, "TaxCategory", "Amount"));
    const allows = allowCharges(R, false), charges = allowCharges(R, true);
    const lineAllows = [].concat(...lines.map((l) => allowCharges(l.el, false, l.name + " ")));
    const lineCharges = [].concat(...lines.map((l) => allowCharges(l.el, true, l.name + " ")));

    const seller = first(R, "AccountingSupplierParty/Party"), buyer = first(R, "AccountingCustomerParty/Party");
    const payee = first(R, "PayeeParty"), rep = first(R, "TaxRepresentativeParty");
    const taxIds = (party, vat) => byPath(party, "PartyTaxScheme")
      .filter((s) => (val(s, "TaxScheme/ID") === "VAT") === vat).map((s) => val(s, "CompanyID")).filter(Boolean);

    const docCur = val(R, "DocumentCurrencyCode"), taxCur = val(R, "TaxCurrencyCode");
    const taxTotals = byPath(R, "TaxTotal");
    const vatTotal = taxTotals.find((t) => first(t, "TaxSubtotal")) ||
      taxTotals.find((t) => { const a = first(t, "TaxAmount"); return a && (!docCur || a.getAttribute("currencyID") === docCur); }) || null;
    const vatEl = first(vatTotal, "TaxAmount"), vat = vatEl ? num(txt(vatEl)) : null;
    const subs = items(byPath(vatTotal, "TaxSubtotal"),
      (el) => "VAT breakdown " + [val(el, "TaxCategory/ID"), val(el, "TaxCategory/Percent") ? val(el, "TaxCategory/Percent") + " %" : ""].filter(Boolean).join(" "))
      .map((o) => Object.assign(taxed(o, "TaxCategory", "TaxableAmount"), { tax: num(val(o.el, "TaxAmount")) }));
    const lmt = first(R, "LegalMonetaryTotal");

    // ---------- Mandatory content ----------
    req("BR-01", R, "CustomizationID", "Specification identifier (BT-24) is present");
    req("BR-02", R, "ID", "Invoice number (BT-1) is present");
    req("BR-03", R, "IssueDate", "Issue date (BT-2) is present");
    req("BR-04", R, cn ? "CreditNoteTypeCode" : "InvoiceTypeCode", "Invoice type code (BT-3) is present");
    req("BR-05", R, "DocumentCurrencyCode", "Invoice currency code (BT-5) is present");
    req("BR-06", seller, "PartyLegalEntity/RegistrationName", "Seller name (BT-27) is present");
    req("BR-07", buyer, "PartyLegalEntity/RegistrationName", "Buyer name (BT-44) is present");
    rule("BR-08", seller, !!first(seller, "PostalAddress"), "Seller postal address (BG-5) is present");
    req("BR-09", seller, "PostalAddress/Country/IdentificationCode", "Seller country code (BT-40) is present");
    rule("BR-10", buyer, !!first(buyer, "PostalAddress"), "Buyer postal address (BG-8) is present");
    req("BR-11", buyer, "PostalAddress/Country/IdentificationCode", "Buyer country code (BT-55) is present");
    req("BR-12", lmt, "LineExtensionAmount", "Sum of line net amounts (BT-106) is present");
    req("BR-13", lmt, "TaxExclusiveAmount", "Total without VAT (BT-109) is present");
    req("BR-14", lmt, "TaxInclusiveAmount", "Total with VAT (BT-112) is present");
    req("BR-15", lmt, "PayableAmount", "Amount due for payment (BT-115) is present");
    rule("BR-16", R, lines.length > 0, "The document has at least one line (BG-25)");
    if (payee) req("BR-17", payee, "PartyName/Name", "Payee name (BT-59) is present");
    if (rep) {
      req("BR-18", rep, "PartyName/Name", "Tax representative name (BT-62) is present");
      rule("BR-19", rep, !!first(rep, "PostalAddress"), "Tax representative postal address (BG-12) is present");
      req("BR-20", rep, "PostalAddress/Country/IdentificationCode", "Tax representative country code (BT-69) is present");
      rule("BR-56", rep, taxIds(rep, true).length > 0, "Tax representative VAT identifier (BT-63) is present");
    }

    // ---------- Lines ----------
    each("BR-21", lines, (el) => has(el, "ID"), "Every line has a line identifier (BT-126)");
    each("BR-22", lines, (el) => has(el, qtyTag), "Every line has an invoiced quantity (BT-129)");
    each("BR-23", lines, (el) => { const q = first(el, qtyTag); return !!(q && q.getAttribute("unitCode")); }, "Every line has a quantity unit of measure (BT-130)");
    each("BR-24", lines, (el) => has(el, "LineExtensionAmount"), "Every line has a line net amount (BT-131)");
    each("BR-25", lines, (el) => has(el, "Item/Name"), "Every line has an item name (BT-153)");
    each("BR-26", lines, (el) => has(el, "Price/PriceAmount"), "Every line has an item net price (BT-146)");
    each("BR-27", lines.filter((o) => has(o.el, "Price/PriceAmount")), (el) => nonNeg(val(el, "Price/PriceAmount")),
      "Item net price (BT-146) is not negative");
    each("BR-28", lines.filter((o) => has(o.el, "Price/AllowanceCharge/BaseAmount")), (el) => nonNeg(val(el, "Price/AllowanceCharge/BaseAmount")),
      "Item gross price (BT-148) is not negative");
    each("BR-CO-04", lines, (el, o) => !!o.cat, "Every line has a VAT category code (BT-151)");
    const fromLines = (path) => [].concat(...lines.map((l) => byPath(l.el, path)));
    each("BR-54", items(fromLines("Item/AdditionalItemProperty"), (el, i) => "item attribute " + (val(el, "Name") || i + 1)),
      (el) => has(el, "Name") && has(el, "Value"), "Every item attribute (BG-32) has a name (BT-160) and a value (BT-161)");
    each("BR-64", items(fromLines("Item/StandardItemIdentification/ID"), txt),
      (el) => !!el.getAttribute("schemeID"), "Item standard identifiers (BT-157) have a scheme (schemeID)");
    each("BR-65", items(fromLines("Item/CommodityClassification/ItemClassificationCode"), txt),
      (el) => !!el.getAttribute("listID"), "Item classification codes (BT-158) have a scheme (listID)");

    // ---------- Periods ----------
    const period = first(R, "InvoicePeriod");
    if (period) {
      rule("BR-CO-19", period, has(period, "StartDate") || has(period, "EndDate") || has(period, "DescriptionCode"),
        "Invoicing period (BG-14) has a start date, an end date or a description code");
      if (has(period, "StartDate") && has(period, "EndDate"))
        rule("BR-29", period, val(period, "EndDate") >= val(period, "StartDate"), "Invoicing period end date (BT-74) is not before its start date (BT-73)",
          val(period, "StartDate") + " → " + val(period, "EndDate"));
    }
    const linePeriods = lines.filter((o) => first(o.el, "InvoicePeriod"));
    each("BR-CO-20", linePeriods, (el) => has(el, "InvoicePeriod/StartDate") || has(el, "InvoicePeriod/EndDate"),
      "Line periods (BG-26) have a start or end date");
    each("BR-30", linePeriods.filter((o) => has(o.el, "InvoicePeriod/StartDate") && has(o.el, "InvoicePeriod/EndDate")),
      (el) => val(el, "InvoicePeriod/EndDate") >= val(el, "InvoicePeriod/StartDate"), "Line period end date (BT-135) is not before its start date (BT-134)");
    if (has(R, "TaxPointDate") || has(R, "InvoicePeriod/DescriptionCode"))
      rule("BR-CO-03", R, !(has(R, "TaxPointDate") && has(R, "InvoicePeriod/DescriptionCode")),
        "VAT point date (BT-7) and VAT point date code (BT-8) are not both used");

    // ---------- Allowances and charges ----------
    const hasReason = (el) => has(el, "AllowanceChargeReason") || has(el, "AllowanceChargeReasonCode");
    each("BR-31", allows, (el) => has(el, "Amount"), "Document level allowances have an amount (BT-92)");
    each("BR-32", allows, (el, o) => !!o.cat, "Document level allowances have a VAT category code (BT-95)");
    each("BR-CO-21", allows, hasReason, "Document level allowances have a reason (BT-97) or reason code (BT-98)");
    each("BR-36", charges, (el) => has(el, "Amount"), "Document level charges have an amount (BT-99)");
    each("BR-37", charges, (el, o) => !!o.cat, "Document level charges have a VAT category code (BT-102)");
    each("BR-CO-22", charges, hasReason, "Document level charges have a reason (BT-104) or reason code (BT-105)");
    each("BR-41", lineAllows, (el) => has(el, "Amount"), "Line allowances have an amount (BT-136)");
    each("BR-CO-23", lineAllows, hasReason, "Line allowances have a reason (BT-139) or reason code (BT-140)");
    each("BR-43", lineCharges, (el) => has(el, "Amount"), "Line charges have an amount (BT-141)");
    each("BR-CO-24", lineCharges, hasReason, "Line charges have a reason (BT-144) or reason code (BT-145)");

    // ---------- VAT breakdown ----------
    rule("BR-CO-18", vatTotal, subs.length > 0, "The document has at least one VAT breakdown (BG-23)");
    each("BR-45", subs, (el) => has(el, "TaxableAmount"), "Every VAT breakdown has a taxable amount (BT-116)");
    each("BR-46", subs, (el) => has(el, "TaxAmount"), "Every VAT breakdown has a VAT amount (BT-117)");
    each("BR-47", subs, (el, o) => !!o.cat, "Every VAT breakdown has a VAT category code (BT-118)");
    each("BR-48", subs, (el, o) => o.cat === "O" || !!o.rateRaw, "Every VAT breakdown, except “not subject to VAT”, has a VAT rate (BT-119)");
    subs.forEach((s) => {
      if (s.amt === null || s.tax === null) return;
      if (s.rate === null || round(s.rate) === 0) cmp("BR-CO-17", s.el, 0, s.tax, s.name + ": VAT amount is 0 at a 0 % rate", "BT-117");
      else cmp("BR-CO-17", s.el, round(s.amt * s.rate / 100), s.tax, s.name + ": VAT amount = taxable amount × rate", "BT-117", 1);
    });
    if (taxCur) rule("BR-53", vatTotal, taxTotals.some((t) => { const a = first(t, "TaxAmount"); return a && a.getAttribute("currencyID") === taxCur; }),
      "VAT total in accounting currency (BT-111) is present because an accounting currency (BT-6) is given");

    // ---------- Totals ----------
    if (lmt) {
      const g = (p) => num(val(lmt, p));
      const b106 = g("LineExtensionAmount"), b107 = g("AllowanceTotalAmount") || 0, b108 = g("ChargeTotalAmount") || 0;
      const b109 = g("TaxExclusiveAmount"), b112 = g("TaxInclusiveAmount"), b113 = g("PrepaidAmount") || 0;
      const b114 = g("PayableRoundingAmount") || 0, b115 = g("PayableAmount");
      const inIncl = roundingInInclusive(R);
      if (lines.length) cmp("BR-CO-10", lmt, sum(lines, "amt"), b106, "Sum of line net amounts", "BT-106");
      if (allows.length || has(lmt, "AllowanceTotalAmount")) cmp("BR-CO-11", lmt, sum(allows, "amt"), g("AllowanceTotalAmount"), "Sum of document level allowances", "BT-107");
      if (charges.length || has(lmt, "ChargeTotalAmount")) cmp("BR-CO-12", lmt, sum(charges, "amt"), g("ChargeTotalAmount"), "Sum of document level charges", "BT-108");
      if (b106 !== null && b109 !== null) cmp("BR-CO-13", lmt, b106 - b107 + b108, b109, "Lines − allowances + charges", "BT-109");
      if (b109 !== null && b112 !== null) {
        if (inIncl) cmp("BR-CO-15", lmt, b109 + (vat || 0) + b114, b112, "Total excl. VAT + VAT + rounding (rounding folded in, as older UBL samples do)", "BT-112");
        else cmp("BR-CO-15", lmt, b109 + (vat || 0), b112, "Total excl. VAT + VAT", "BT-112");
      }
      if (b112 !== null && b115 !== null) {
        if (inIncl) cmp("BR-CO-16", lmt, b112 - b113, b115, "Total incl. VAT − paid (rounding already included)", "BT-115");
        else cmp("BR-CO-16", lmt, b112 - b113 + b114, b115, b114 ? "Total incl. VAT − paid + rounding" : "Total incl. VAT − paid", "BT-115");
      }
      if (b115 !== null && b115 > 0)
        rule("BR-CO-25", R, has(R, "DueDate") || has(R, "PaymentMeans/PaymentDueDate") || has(R, "PaymentTerms/Note"),
          "A positive amount due has a payment due date (BT-9) or payment terms (BT-20)");
    }
    if (vat !== null && subs.length) cmp("BR-CO-14", vatTotal, sum(subs, "tax"), vat, "Sum of VAT breakdown amounts", "BT-110");

    // ---------- Decimals: amounts carry at most two ----------
    const decimals = (id, els, label) => {
      els = els.filter(Boolean);
      if (!els.length) return;
      const bad = els.filter((e) => (txt(e).split(".")[1] || "").length > 2);
      rule(id, bad.length ? bad : els, !bad.length, label + " has at most 2 decimals", bad.length ? "Found " + names(bad.map(txt)) : "");
    };
    const at = (list, path) => list.map((o) => first(o.el, path));
    decimals("BR-DEC-01", at(allows, "Amount"), "Document allowance amount (BT-92)");
    decimals("BR-DEC-02", at(allows, "BaseAmount"), "Document allowance base amount (BT-93)");
    decimals("BR-DEC-05", at(charges, "Amount"), "Document charge amount (BT-99)");
    decimals("BR-DEC-06", at(charges, "BaseAmount"), "Document charge base amount (BT-100)");
    [["09", "LineExtensionAmount", "Sum of line net amounts (BT-106)"], ["10", "AllowanceTotalAmount", "Sum of allowances (BT-107)"],
      ["11", "ChargeTotalAmount", "Sum of charges (BT-108)"], ["12", "TaxExclusiveAmount", "Total without VAT (BT-109)"],
      ["14", "TaxInclusiveAmount", "Total with VAT (BT-112)"], ["16", "PrepaidAmount", "Paid amount (BT-113)"],
      ["17", "PayableRoundingAmount", "Rounding amount (BT-114)"], ["18", "PayableAmount", "Amount due (BT-115)"]]
      .forEach(([n, path, label]) => decimals("BR-DEC-" + n, [first(lmt, path)], label));
    decimals("BR-DEC-13", [vatEl], "VAT total (BT-110)");
    if (taxCur) decimals("BR-DEC-15", taxTotals.map((t) => first(t, "TaxAmount")).filter((a) => a && a.getAttribute("currencyID") === taxCur),
      "VAT total in accounting currency (BT-111)");
    decimals("BR-DEC-19", at(subs, "TaxableAmount"), "VAT category taxable amount (BT-116)");
    decimals("BR-DEC-20", at(subs, "TaxAmount"), "VAT category tax amount (BT-117)");
    decimals("BR-DEC-23", at(lines, "LineExtensionAmount"), "Line net amount (BT-131)");
    decimals("BR-DEC-24", at(lineAllows, "Amount"), "Line allowance amount (BT-136)");
    decimals("BR-DEC-25", at(lineAllows, "BaseAmount"), "Line allowance base amount (BT-137)");
    decimals("BR-DEC-27", at(lineCharges, "Amount"), "Line charge amount (BT-141)");
    decimals("BR-DEC-28", at(lineCharges, "BaseAmount"), "Line charge base amount (BT-142)");

    // ---------- VAT categories ----------
    // A line charge or allowance has no VAT category of its own: it is taxed with its line (BT-151/BT-152).
    const sellerVat = taxIds(seller, true).length > 0, sellerReg = taxIds(seller, false).length > 0, repVat = taxIds(rep, true).length > 0;
    const buyerVat = taxIds(buyer, true).length > 0, buyerLegal = has(buyer, "PartyLegalEntity/CompanyID");
    const partyOk = {
      seller: sellerVat || sellerReg || repVat,
      reverse: (sellerVat || sellerReg || repVat) && (buyerVat || buyerLegal),
      intra: (sellerVat || repVat) && buyerVat,
      export: sellerVat || repVat,
      none: !sellerVat && !repVat && !buyerVat
    };
    const hasExemption = (el) => has(el, "TaxCategory/TaxExemptionReason") || has(el, "TaxCategory/TaxExemptionReasonCode");

    VAT_RULES.forEach((v) => {
      const id = (n) => "BR-" + v.prefix + "-" + n, nm = VAT_CAT[v.cat] + " (" + v.cat + ")";
      const inCat = (o) => o.cat === v.cat;
      const L = lines.filter(inCat), A = allows.filter(inCat), C = charges.filter(inCat), B = subs.filter(inCat);

      if (L.length || A.length || C.length) {
        rule(id("01"), B.length ? B.map((b) => b.el) : vatTotal, v.single ? B.length === 1 : B.length > 0,
          "Using " + nm + " needs " + (v.single ? "exactly one" : "a") + " VAT breakdown in that category", B.length + " found");
        [["02", L, "lines"], ["03", A, "document allowances"], ["04", C, "document charges"]].forEach(([n, list, what]) => {
          if (list.length) rule(id(n), seller, partyOk[v.party], "With " + what + " in " + nm + ", " + PARTY_TEXT[v.party]);
        });
      }

      const rateOk = (el, o) => RATE_OK[v.rate](o);
      each(id("05"), L, rateOk, "Lines in " + nm + ": " + RATE_TEXT[v.rate]);
      each(id("06"), A, rateOk, "Document allowances in " + nm + ": " + RATE_TEXT[v.rate]);
      each(id("07"), C, rateOk, "Document charges in " + nm + ": " + RATE_TEXT[v.rate]);

      // Taxable amount = lines + charges − allowances in the category (per rate where several rates are allowed).
      const basis = (match) => sum(L.filter(match), "amt") + sum(C.filter(match), "amt") - sum(A.filter(match), "amt");
      if (v.single) {
        if (B.length) cmp(id("08"), B.map((b) => b.el), basis(() => true), sum(B, "amt"), "Taxable amount in " + nm + " = its lines + charges − allowances", "BT-116");
      } else {
        B.forEach((b) => {
          const match = (o) => o.rate !== null && b.rate !== null && round(o.rate) === round(b.rate);
          const text = "Taxable amount in " + nm + " at " + (b.rateRaw || "?") + " % = lines + charges − allowances at that rate";
          if (L.concat(A, C).some(match)) cmp(id("08"), b.el, basis(match), b.amt, text, "BT-116", 1);
          else rule(id("08"), b.el, false, text, "No line, allowance or charge is in " + v.cat + " at " + (b.rateRaw || "?") +
            " %, yet the breakdown taxes " + (b.amt === null ? "?" : fmt(b.amt)));
        });
      }

      B.forEach((b) => {
        if (b.tax === null) return;
        if (!v.calc) cmp(id("09"), b.el, 0, b.tax, "VAT amount in " + nm + " is 0", "BT-117");
        else if (b.amt !== null && b.rate !== null)
          cmp(id("09"), b.el, round(b.amt * b.rate / 100), b.tax, "VAT amount in " + nm + " at " + b.rateRaw + " % = taxable amount × rate", "BT-117", 1);
      });
      each(id("10"), B, (el) => (v.reason ? hasExemption(el) : !hasExemption(el)),
        "VAT breakdown in " + nm + (v.reason ? " has an exemption reason (BT-120) or code (BT-121)" : " has no exemption reason (BT-120/BT-121)"));

      if (v.cat === "K" && B.length) {
        rule("BR-IC-11", first(R, "Delivery"), has(R, "Delivery/ActualDeliveryDate") || !!first(R, "InvoicePeriod"),
          "Intra-community supply gives an actual delivery date (BT-72) or an invoicing period (BG-14)");
        rule("BR-IC-12", first(R, "Delivery"), has(R, "Delivery/DeliveryLocation/Address/Country/IdentificationCode"),
          "Intra-community supply gives the deliver-to country code (BT-80)");
      }
      if (v.cat === "O" && B.length) {
        rule("BR-O-11", vatTotal, subs.length === B.length, "With “not subject to VAT” there is no VAT breakdown in another category");
        each("BR-O-12", lines, (el, o) => o.cat === "O", "With “not subject to VAT” every line is in category O");
        each("BR-O-13", allows, (el, o) => o.cat === "O", "With “not subject to VAT” every document allowance is in category O");
        each("BR-O-14", charges, (el, o) => o.cat === "O", "With “not subject to VAT” every document charge is in category O");
      }
    });
    const taxedItems = lines.concat(allows, charges);
    if (taxedItems.some((o) => o.cat === "B")) {
      rule("BR-B-01", seller, val(seller, "PostalAddress/Country/IdentificationCode") === "IT", "Split payment (B) is only used on a domestic Italian invoice");
      rule("BR-B-02", vatTotal, !taxedItems.some((o) => o.cat === "S"), "Split payment (B) is not combined with standard rated (S) lines, allowances or charges");
    }

    // ---------- Parties and payment ----------
    const vatIds = [[seller, "seller"], [buyer, "buyer"], [rep, "tax representative"]]
      .flatMap(([party, who]) => taxIds(party, true).map((id) => ({ el: party, name: who + " " + id, id })));
    each("BR-CO-09", vatIds, (el, o) => o.id.slice(0, 2) === "EL" || validCountry(o.id.slice(0, 2)),
      "VAT identifiers (BT-31, BT-48, BT-63) start with a country prefix");
    rule("BR-CO-26", seller, has(seller, "PartyIdentification/ID") || has(seller, "PartyLegalEntity/CompanyID") || sellerVat,
      "The seller has an identifier (BT-29), legal registration (BT-30) or VAT identifier (BT-31)");
    const endpoint = (id, party, text) => { const e = first(party, "EndpointID"); if (e) rule(id, e, !!e.getAttribute("schemeID"), text); };
    endpoint("BR-62", seller, "Seller electronic address (BT-34) has a scheme (schemeID)");
    endpoint("BR-63", buyer, "Buyer electronic address (BT-49) has a scheme (schemeID)");

    const payMeans = items(byPath(R, "PaymentMeans"), (el, i) => "payment means " + (val(el, "PaymentMeansCode") || i + 1));
    each("BR-49", payMeans, (el) => has(el, "PaymentMeansCode"), "Every payment instruction has a payment means code (BT-81)");
    each("BR-50", payMeans.filter((o) => first(o.el, "PayeeFinancialAccount")), (el) => has(el, "PayeeFinancialAccount/ID"),
      "Credit transfer details (BG-17) include the account identifier (BT-84)");
    each("BR-61", payMeans.filter((o) => ["30", "58"].includes(val(o.el, "PaymentMeansCode"))), (el) => has(el, "PayeeFinancialAccount/ID"),
      "Credit transfers (code 30 or 58) give the payment account identifier (BT-84)");
    const cards = byPath(R, "PaymentMeans/CardAccount"), mandates = byPath(R, "PaymentMeans/PaymentMandate");
    if (cards.length) rule("BR-66", cards, cards.length === 1, "At most one payment card (BG-18)", cards.length + " found");
    if (mandates.length) rule("BR-67", mandates, mandates.length === 1, "At most one direct debit mandate (BG-19)", mandates.length + " found");
    each("BR-51", items(cards, (el) => "card " + val(el, "PrimaryAccountNumberID")),
      (el) => (val(el, "PrimaryAccountNumberID").match(/\d/g) || []).length <= 10,
      "Card number (BT-87) shows no more than the first 6 and last 4 digits", true);

    // ---------- References ----------
    each("BR-52", items(byPath(R, "AdditionalDocumentReference"), (el, i) => "supporting document " + (i + 1)), (el) => has(el, "ID"),
      "Every supporting document (BG-24) has a reference (BT-122)");
    each("BR-55", items(byPath(R, "BillingReference/InvoiceDocumentReference"), (el, i) => "preceding invoice " + (i + 1)), (el) => has(el, "ID"),
      "Every preceding invoice reference (BG-3) has an invoice number (BT-25)");
    each("BR-57", items(byPath(R, "Delivery/DeliveryLocation/Address"), (el, i) => "deliver-to address " + (i + 1)), (el) => has(el, "Country/IdentificationCode"),
      "Every deliver-to address (BG-15) has a country code (BT-80)");

    // ---------- Data types (UBL schema) ----------
    // EN 16931 leaves these to XSD validation, so its schematron never reports them.
    const allEls = Array.from(R.getElementsByTagName("*"));
    const named = (el) => el.localName + " “" + txt(el) + "”";
    each("XSD-DATE", items(allEls.filter((e) => /Date$/.test(e.localName) && !e.children.length), named), (el) => validDate(txt(el)),
      "Dates are real calendar dates written as YYYY-MM-DD");
    each("XSD-DEC", items(allEls.filter((e) => !e.children.length &&
      (e.hasAttribute("currencyID") || /(Quantity|Percent|MultiplierFactorNumeric)$/.test(e.localName))), named),
      (el) => /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(txt(el)), "Amounts, quantities and percentages are plain decimal numbers");

    // ---------- Code lists ----------
    const typeCode = val(R, cn ? "CreditNoteTypeCode" : "InvoiceTypeCode");
    if (typeCode) rule("BR-CL-01", first(R, cn ? "CreditNoteTypeCode" : "InvoiceTypeCode"), DOC_TYPE_CODES.has(typeCode), "Invoice type code (BT-3) is in the EN 16931 subset of UNTDID 1001", typeCode);
    each("BR-CL-03", items(allEls.filter((e) => e.hasAttribute("currencyID")), (el) => el.localName + " " + el.getAttribute("currencyID")),
      (el) => validCurrency(el.getAttribute("currencyID")), "Amount currencies (currencyID) are ISO 4217 codes");
    if (docCur) rule("BR-CL-04", first(R, "DocumentCurrencyCode"), validCurrency(docCur), "Invoice currency code (BT-5) is an ISO 4217 code", docCur);
    if (taxCur) rule("BR-CL-05", first(R, "TaxCurrencyCode"), validCurrency(taxCur), "VAT accounting currency code (BT-6) is an ISO 4217 code", taxCur);
    each("BR-CL-14", items(allEls.filter((e) => e.localName === "IdentificationCode" && e.parentElement && e.parentElement.localName === "Country"),
      (el) => txt(el) || "(empty)"), (el) => validCountry(txt(el)), "Country codes are ISO 3166-1 alpha-2 codes");
    each("BR-CL-16", items(byPath(R, "PaymentMeans/PaymentMeansCode"), txt),
      (el) => txt(el) === "ZZZ" || (/^[1-9]\d?$/.test(txt(el)) && +txt(el) <= 97), "Payment means codes (BT-81) are UNTDID 4461 codes");
    each("BR-CL-17", lines.filter((o) => o.cat), (el, o) => !!VAT_CAT[o.cat], "Line VAT category codes (BT-151) are UNTDID 5305 codes");
    each("BR-CL-18", subs.concat(allows, charges).filter((o) => o.cat), (el, o) => !!VAT_CAT[o.cat],
      "VAT category codes (BT-95, BT-102, BT-118) are UNTDID 5305 codes");
    each("BR-CL-19", allows.concat(lineAllows).filter((o) => has(o.el, "AllowanceChargeReasonCode")),
      (el) => ALLOWANCE_CODES.has(val(el, "AllowanceChargeReasonCode")), "Allowance reason codes (BT-98, BT-140) are UNTDID 5189 codes");
    each("BR-CL-20", charges.concat(lineCharges).filter((o) => has(o.el, "AllowanceChargeReasonCode")),
      (el) => /^[A-Z]{2,3}$/.test(val(el, "AllowanceChargeReasonCode")), "Charge reason codes (BT-105, BT-145) are UNTDID 7161 codes");
    each("BR-CL-22", subs.filter((o) => has(o.el, "TaxCategory/TaxExemptionReasonCode")),
      (el) => VATEX.has(val(el, "TaxCategory/TaxExemptionReasonCode").toUpperCase()), "VAT exemption reason codes (BT-121) are on the CEF VATEX list");
    each("BR-CL-24", items(byPath(R, "AdditionalDocumentReference/Attachment/EmbeddedDocumentBinaryObject"),
      (el) => el.getAttribute("filename") || el.getAttribute("mimeCode") || "attachment"),
      (el) => MIME_CODES.has(el.getAttribute("mimeCode")), "Attachments use an allowed MIME code (PDF, PNG, JPEG, CSV, XLSX or ODS)");

    // ---------- Extra rule sets ----------
    // They get the same document model and reporting helpers as the rules above.
    const ctx = {
      R, cn, rule, cmp, each, req, items, names, sum, has, val, first, byPath, txt, num, round, fmt, validDate, validCountry,
      lines, allows, charges, lineAllows, lineCharges, seller, buyer, payee, rep, taxIds, docCur, taxCur, taxTotals, vatTotal, vat, subs, lmt,
      allEls, typeCode, qtyTag, isCharge
    };
    (extraSets || []).forEach((id) => {
      if (!SETS[id]) return;
      setLabel = SETS[id].label;
      SETS[id].run(ctx);
    });
    return out;
  }

  window.EN16931 = { check, roundingInInclusive, register, detect, sets: SETS, util: { byPath, first, val, has, txt, num } };
})();
