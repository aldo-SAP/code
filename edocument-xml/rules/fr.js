/*
 * France (CTC e-invoicing reform) checks on top of EN 16931 (load after en16931-rules.js).
 *
 * BR-FR- checks follow the official FNFE-MPE validation artefacts for AFNOR XP Z12-012, UBL syntax, version 1.4.0.04
 * (github.com/fnfempe/France_RFE, FNFE_RFE_INVOICE/UBL/EN16931/schematron/BR-FR-Flux2-Schematron-UBL.sch): same IDs,
 * same element paths and the same tests, all fatal as in the source. Where the source repeats a test under two IDs
 * (BR-FR-01/02 format, BR-FR-15 L/M, BR-FR-DEC-01 BT-110/111) it is reported once.
 * Not covered: the multi-vendor and sub-line rules of frameworks S8/B8/M8/S9/B9/M9 (BR-FR-MV-, BR-FR-BD-), which need
 * EXTENDED-CTC-FR data, and two source rules whose paths never match a UBL document (BR-FR-27 and the line-level
 * BR-FR-09 on EXT-FR-FE-146).
 * FR-CHK- checks are this tool's own warnings (check digits, legal mentions); they have no BR-FR equivalent.
 */
(function () {
  "use strict";
  const { val, byPath, first } = EN16931.util;

  // Code lists of the source schematron.
  const FRAMEWORKS = new Set("B1 S1 M1 B2 S2 M2 S3 B4 S4 M4 S5 S6 B7 S7 B8 S8 M8 B9 S9 M9".split(" "));
  const DOC_TYPES = new Set("380 389 393 501 386 500 384 471 472 473 261 262 381 396 502 503".split(" "));
  const SELF_BILLING = new Set("389 501 500 471 473 261 502".split(" "));
  const BAR_VALUES = ["B2B", "B2BINT", "B2C", "B2CINT", "OUTOFSCOPE", "ARCHIVEONLY"];
  const VAT_CATS = new Set("S E AE K G O Z".split(" "));
  const VAT_RATES = new Set(("0 0.0 0.00 10 10.0 10.00 13 13.0 13.00 20 20.0 20.00 8.5 8.50 19.6 19.60 2.1 2.10 5.5 5.50 7 7.0 7.00 " +
    "20.6 20.60 1.05 0.9 0.90 1.75 9.2 9.20 9.6 9.60").split(" "));
  const ATTACHMENT_CODES = new Set(("RIB LISIBLE FEUILLE_DE_STYLE PJA BORDEREAU_SUIVI DOCUMENT_ANNEXE BON_LIVRAISON BON_COMMANDE " +
    "BORDEREAU_SUIVI_VALIDATION ETAT_ACOMPTE FACTURE_PAIEMENT_DIRECT RECAPITULATIF_COTRAITANCE").split(" "));
  // Parties the source checks, with their UBL paths (the EXT-FR-FE ones are agents, payer and service providers).
  const PARTIES = [
    ["AccountingSupplierParty/Party", "seller"], ["AccountingCustomerParty/Party", "buyer"], ["PayeeParty", "payee"],
    ["AccountingCustomerParty/Party/AgentParty", "buyer agent"], ["PaymentMeans/PaymentMandate/PayerParty", "payer"],
    ["AccountingSupplierParty/Party/AgentParty", "seller agent"],
    ["AccountingCustomerParty/Party/ServiceProviderParty/Party", "buyer service provider"],
    ["AccountingSupplierParty/Party/ServiceProviderParty/Party", "seller service provider"]
  ];

  // The source tests the raw text of most elements, so these helpers do not trim unless the source normalizes.
  const raw = (el) => (el ? el.textContent : "");
  const norm = (s) => String(s).replace(/\s+/g, " ").trim();
  const idFormat = (s) => /^[A-Za-z0-9+\-_/]+$/.test(norm(s)) && !/ /.test(s);
  const schemeFormat = (s) => /^[A-Za-z0-9+\-_.]+$/.test(s);
  function dateOk(s) {
    const m = /^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(s);
    if (!m) return false;
    const y = +m[1], mo = +m[2], leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return +m[3] <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  }
  const decimal = (s, decimals, signed) => new RegExp("^" + (signed ? "-?" : "") + "\\d{1,19}(\\.\\d{1," + decimals + "})?$").test(s) &&
    s.replace(/\./g, "").length <= 19;
  const percent = (s) => /^\d{1,4}(\.\d{1,2})?$/.test(s) && s.replace(/\./g, "").length <= 4;
  // Occurrences of a substring, as count(tokenize(…)) - 1 counts them.
  const occurrences = (s, part) => s.split(part).length - 1;
  // The text after #CODE# up to the next # in all notes joined with #, as the source reads BAR and TXD.
  const noteValue = (all, code) => { const after = all.split("#" + code + "#").slice(1).join("#" + code + "#"); return after.split("#")[0]; };

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

  EN16931.register("fr", {
    label: "France CTC",
    name: "France (CTC e-invoicing)",
    // The French profiles use the plain EN 16931 CustomizationID, so a French billing framework (BT-23) or a #BAR# note also counts.
    detect: (R) => /urn\.cpro\.gouv\.fr/.test(val(R, "CustomizationID")) || FRAMEWORKS.has(val(R, "ProfileID")) ||
      byPath(R, "Note").some((n) => raw(n).includes("#BAR#")),
    run(c) {
      const { R, cn, rule, each, has, txt, num, seller, buyer, lines, allEls } = c;
      const typeCode = raw(first(R, cn ? "CreditNoteTypeCode" : "InvoiceTypeCode"));
      const framework = raw(first(R, "ProfileID"));
      const notes = byPath(R, "Note").map(raw), allNotes = notes.join("#");
      const bar = allNotes.includes("#BAR#") ? noteValue(allNotes, "BAR") : null;
      const sirenOf = (party, path) => byPath(party, path || "PartyLegalEntity/CompanyID").filter((e) => e.getAttribute("schemeID") === "0002");
      const parties = PARTIES.flatMap(([path, who]) => byPath(R, path).map((el) => ({ el, who })));
      const at = (els, name) => els.map((el) => ({ el, name: name(el) }));
      const lineEls = (path) => lines.flatMap((o) => byPath(o.el, path).map((el) => ({ el, line: o.name })));
      const desc = (el) => el.localName + " " + norm(raw(el));
      const kids = (name, parent) => allEls.filter((e) => e.localName === name && e.parentElement && e.parentElement.localName === parent);

      // ---------- Identifiers and dates (BR-FR-01 … 04) ----------
      const refIds = at([first(R, "ID")].filter(Boolean), (el) => "BT-1 " + raw(el))
        .concat(at(byPath(R, "BillingReference/InvoiceDocumentReference/ID"), (el) => "BT-25 " + raw(el)))
        .concat(lineEls("BillingReference/InvoiceDocumentReference/ID").map((o) => ({ el: o.el, name: o.line + " " + raw(o.el) })));
      // the source schematron also lists the format test under BR-FR-01, so a bad format fails both rules
      each("BR-FR-01", refIds, (el) => raw(el).length <= 35 && idFormat(raw(el)), "Invoice numbers (BT-1, BT-25) must have at most 35 characters and may only use letters, digits and + - _ /");
      each("BR-FR-02", refIds, (el) => idFormat(raw(el)), "Invoice numbers (BT-1, BT-25) may only use letters, digits and + - _ / (no spaces)");

      const dates = [["IssueDate", "BT-2"], ["TaxPointDate", "BT-7"], ["DueDate", "BT-9"], ["BillingReference/InvoiceDocumentReference/IssueDate", "BT-26"],
        ["Delivery/ActualDeliveryDate", "BT-72"], ["InvoicePeriod/StartDate", "BT-73"], ["InvoicePeriod/EndDate", "BT-74"]]
        .flatMap(([path, bt]) => at(byPath(R, path), (el) => bt + " " + raw(el)))
        .concat([["BillingReference/InvoiceDocumentReference/IssueDate", "EXT-FR-FE-138"], ["Delivery/ActualDeliveryDate", "EXT-FR-FE-158"],
          ["InvoicePeriod/StartDate", "BT-134"], ["InvoicePeriod/EndDate", "BT-135"]]
          .flatMap(([path, bt]) => lineEls(path).map((o) => ({ el: o.el, name: o.line + " " + bt + " " + raw(o.el) }))));
      each("BR-FR-03", dates, (el) => dateOk(raw(el)), "Dates must be real dates from 2000 to 2099 written as YYYY-MM-DD");

      const typeEls = at([first(R, cn ? "CreditNoteTypeCode" : "InvoiceTypeCode")].filter(Boolean), (el) => "BT-3 " + raw(el))
        .concat(at(byPath(R, "BillingReference/InvoiceDocumentReference/DocumentTypeCode"), (el) => "EXT-FR-FE-02 " + raw(el)))
        .concat(lineEls("BillingReference/InvoiceDocumentReference/DocumentTypeCode").map((o) => ({ el: o.el, name: o.line + " " + raw(o.el) })));
      each("BR-FR-04", typeEls, (el) => DOC_TYPES.has(raw(el)), "Document type codes (BT-3) must be one the French reform accepts");

      // ---------- Notes (BR-FR-05, 06, 20, 31) ----------
      [["PMT", "fixed recovery fee of 40 € (indemnité forfaitaire)"], ["PMD", "late payment penalties"], ["AAB", "early payment discount (escompte)"]]
        .forEach(([code, what]) => rule("BR-FR-05", R, allNotes.includes("#" + code + "#"), "Note #" + code + "# must state the " + what));
      const repeated = ["PMT", "PMD", "AAB", "TXD"].filter((code) => occurrences(allNotes, "#" + code + "#") > 1);
      rule("BR-FR-06", R, !repeated.length, "Notes #PMT#, #PMD#, #AAB# and #TXD# may each appear only once",
        repeated.length ? "Repeated: " + repeated.map((code) => "#" + code + "#").join(", ") : "");
      if (bar !== null) {
        rule("BR-FR-20", R, bar === "" || BAR_VALUES.includes(bar), "Note #BAR# must be B2B, B2BINT, B2C, B2CINT, OUTOFSCOPE or ARCHIVEONLY", bar || "(empty)");
        const barNotes = notes.filter((n) => n.includes("#BAR#")).join("") + "#";
        const given = BAR_VALUES.filter((v) => barNotes.includes("BAR#" + v + "#"));
        const count = BAR_VALUES.reduce((s, v) => s + occurrences(barNotes, "BAR#" + v + "#"), 0);
        rule("BR-FR-31", R, count <= 1, "Only one #BAR# operation type may be given", given.join(", "));
      }

      // ---------- Billing framework and document type (BR-FR-08, CO-03 … CO-09) ----------
      rule("BR-FR-08", first(R, "ProfileID") || R, FRAMEWORKS.has(framework),
        "Billing framework (BT-23) must be a French code (B1, S1, M1, B2 … M9)", framework || "missing");
      const advance = ["386", "500", "503"].includes(typeCode), paidFramework = ["B2", "S2", "M2"].includes(framework);
      if (cn && typeCode === "262") rule("BR-FR-CO-03", R, !!(raw(first(R, "ContractDocumentReference/ID")) && raw(first(R, "InvoicePeriod/StartDate")) &&
        raw(first(R, "InvoicePeriod/EndDate"))), "A global discount credit note (262) must give the contract (BT-12) and the invoicing period start and end (BG-14)");
      if (!cn && ["384", "471", "472", "473"].includes(typeCode)) {
        const refs = byPath(R, "BillingReference").length;
        rule("BR-FR-CO-04", R, refs === 1, "A corrective invoice must reference exactly one preceding invoice (BT-25)", refs + " found");
      }
      if (cn && ["261", "381", "396", "502", "503"].includes(typeCode)) {
        const own = raw(first(R, "ID"));
        const refIdsOf = (ref) => byPath(ref, "InvoiceDocumentReference/ID").map(raw);
        const headerRefs = byPath(R, "BillingReference/InvoiceDocumentReference").filter((d) => first(d, "ID") && first(d, "IssueDate")).length;
        // Lines count unless they only point at this credit note itself (a DETAIL status keeps them in).
        const counted = lines.filter((o) => {
          const refs = byPath(o.el, "BillingReference");
          return !refs.some((b) => refIdsOf(b).includes(own)) ||
            refs.filter((b) => refIdsOf(b).includes(own)).some((b) => byPath(b, "InvoiceDocumentReference/DocumentStatusCode").map(raw).includes("DETAIL"));
        });
        const referenced = counted.filter((o) => byPath(o.el, "BillingReference").some((b) => refIdsOf(b).some((id) => id !== own) &&
          byPath(b, "InvoiceDocumentReference").some((d) => first(d, "ID") && first(d, "IssueDate"))));
        // point at the preceding invoice references when there are any, so their block and cells show the failure
        const headerEls = byPath(R, "BillingReference/InvoiceDocumentReference");
        rule("BR-FR-CO-05", headerEls.length ? headerEls : R, headerRefs >= 1 || referenced.length === counted.length,
          "A credit note must reference the credited invoice with its date (BT-25, BT-26), in the header or on every line",
          headerRefs ? "" : referenced.length + " / " + counted.length + " lines");
      }
      const issue = raw(first(R, "IssueDate"));
      const dueDates = byPath(R, "DueDate").concat(byPath(R, "PaymentMeans/PaymentDueDate"));
      if (dueDates.length && !advance && !paidFramework) each("BR-FR-CO-07", at(dueDates, (el) => "due date " + raw(el)), (el) => !(raw(el) < issue),
        "The due date (BT-9) must not be before the issue date (BT-2)");
      if (["B4", "S4", "M4"].includes(framework)) rule("BR-FR-CO-08", first(R, "ProfileID"), !advance,
        "With framework B4, S4 or M4 (final invoice after advances) the document must not be an advance invoice (386, 500, 503)", typeCode);
      if (paidFramework) {
        const lmt = first(R, "LegalMonetaryTotal"), amount = (p) => num(val(lmt, p));
        const paid = amount("PrepaidAmount"), total = amount("TaxInclusiveAmount"), due = amount("PayableAmount");
        rule("BR-FR-CO-09", lmt || R, paid !== null && paid === total, "With framework B2, S2 or M2 (already paid) the paid amount (BT-113) must equal the total with VAT (BT-112)",
          "paid " + (paid === null ? "missing" : paid) + ", total " + (total === null ? "missing" : total));
        rule("BR-FR-CO-09", lmt || R, due === 0, "With framework B2, S2 or M2 the amount due (BT-115) must be 0", due === null ? "missing" : String(due));
        rule("BR-FR-CO-09", R, !!raw(dueDates[0]), "With framework B2, S2 or M2 the due date (BT-9) must give the payment date");
      }

      // ---------- Parties: SIREN, SIRET, identifiers (BR-FR-09 … 13, 21 … 26, 32, CO-10, CO-14, CO-15) ----------
      const siret = parties.map((p) => {
        const s = byPath(p.el, "PartyIdentification/ID").find((e) => e.getAttribute("schemeID") === "0009");
        const sirens = sirenOf(p.el).map(raw);
        // Seller and buyer must carry the SIREN itself; for the other parties the source falls back to the SIRET's first 9 digits.
        return s && { el: s, name: p.who + " " + raw(s), sirens: sirens.length || p.who === "seller" || p.who === "buyer" ? sirens : [raw(s).slice(0, 9)] };
      }).filter(Boolean);
      const delivery = first(R, "Delivery");
      const delSiret = byPath(delivery, "DeliveryLocation/ID").find((e) => e.getAttribute("schemeID") === "0009");
      if (delSiret) {
        const sirens = sirenOf(delivery, "DeliveryParty/PartyLegalEntity/CompanyID").map(raw);
        siret.push({ el: delSiret, name: "deliver-to " + raw(delSiret), sirens: sirens.length ? sirens : [raw(delSiret).slice(0, 9)] });
      }
      each("BR-FR-09", siret, (el, o) => /^\d{14}$/.test(raw(el)) && o.sirens.includes(raw(el).slice(0, 9)),
        "SIRET numbers (scheme 0009) must have 14 digits and start with the party's SIREN");
      each("BR-FR-10", at(byPath(seller, "PartyLegalEntity"), () => "seller"), (el) => { const s = sirenOf(el, "CompanyID")[0]; return !!s && /^\d{9}$/.test(norm(raw(s))); },
        "Seller legal registration (BT-30) must be a 9-digit SIREN with scheme 0002");
      if (bar === "B2B") {
        const s = sirenOf(buyer)[0];
        rule("BR-FR-11", buyer, !!s && /^\d{9}$/.test(norm(raw(s))), "With #BAR# B2B the buyer legal registration (BT-47) must be a 9-digit SIREN with scheme 0002", s ? raw(s) : "missing");
      }
      rule("BR-FR-12", buyer, norm(raw(first(buyer, "EndpointID"))) !== "", "Buyer electronic address (BT-49) must be given");
      rule("BR-FR-13", seller, norm(raw(first(seller, "EndpointID"))) !== "", "Seller electronic address (BT-34) must be given");
      if (bar === "B2B") {
        // The buyer's address carries its SIREN, or the seller's on self-billing documents (who receives the invoice).
        const selfBilled = SELF_BILLING.has(typeCode), party = selfBilled ? seller : buyer, ep = first(party, "EndpointID");
        const ok = raw(ep).startsWith(raw(sirenOf(party)[0])) && !!ep && ep.getAttribute("schemeID") === "0225";
        rule(selfBilled ? "BR-FR-22" : "BR-FR-21", ep || party, ok, selfBilled
          ? "With #BAR# B2B on a self-billing document the seller electronic address (BT-34) must use address scheme 0225 and start with the seller SIREN"
          : "With #BAR# B2B the buyer electronic address (BT-49) must use address scheme 0225 and start with the buyer SIREN",
          ep ? raw(ep) + " (" + (ep.getAttribute("schemeID") || "no scheme") + ")" : "missing");
      }
      const endpoints = parties.flatMap((p) => at(byPath(p.el, "EndpointID"), (el) => p.who + " " + raw(el)));
      each("BR-FR-23", endpoints.filter((o) => o.el.getAttribute("schemeID") === "0225"), (el) => schemeFormat(raw(el)),
        "Electronic addresses with scheme 0225 may only use letters, digits and - _ .");
      each("BR-FR-25", endpoints, (el) => raw(el).length <= 125, "Electronic addresses (BT-34, BT-49 …) must have at most 125 characters");
      const privateIds = [[seller, "seller"], [buyer, "buyer"]].flatMap(([p, who]) => at(byPath(p, "PartyIdentification/ID")
        .filter((e) => e.getAttribute("schemeID") === "0224"), (el) => who + " " + raw(el)));
      each("BR-FR-24", privateIds, (el) => schemeFormat(raw(el)), "Private identifiers (BT-29, BT-46, scheme 0224) may only use letters, digits and - _ .");
      each("BR-FR-26", privateIds, (el) => raw(el).length <= 100, "Private identifiers (BT-29, BT-46, scheme 0224) must have at most 100 characters");
      each("BR-FR-32", at(kids("CompanyID", "PartyLegalEntity").filter((e) => e.getAttribute("schemeID") === "0002")
        .concat(kids("ID", "PartyIdentification").filter((e) => ["0002", "0231"].includes(e.getAttribute("schemeID")))), desc),
        (el) => /^\d{9}$/.test(norm(raw(el))), "SIREN numbers (scheme 0002 or 0231) must have 9 digits");

      const idGroups = parties.map((p) => ({ el: p.el, name: p.who, ids: byPath(p.el, "PartyIdentification/ID") }))
        .concat(at(byPath(R, "Delivery/DeliveryLocation"), () => "deliver-to location").map((o) => Object.assign(o, { ids: byPath(o.el, "ID") })))
        .concat(lineEls("Delivery/DeliveryLocation").map((o) => ({ el: o.el, name: o.line + " deliver-to location", ids: byPath(o.el, "ID") })))
        .filter((g) => g.ids.length);
      each("BR-FR-CO-10", idGroups, (el, g) => g.ids.every((e) => e.hasAttribute("schemeID")), "Party identifiers (BT-29, BT-46, BT-60, BT-71 …) must each give a scheme (schemeID)");
      each("BR-FR-CO-10", idGroups, (el, g) => { const s = g.ids.filter((e) => e.hasAttribute("schemeID")).map((e) => e.getAttribute("schemeID")); return new Set(s).size === s.length; },
        "A party must not repeat an identifier scheme");
      if (byPath(seller, "PartyIdentification/ID").some((e) => e.getAttribute("schemeID") === "0231")) {
        rule("BR-FR-CO-14", R, noteValue(allNotes, "TXD") === "MEMBRE_ASSUJETTI_UNIQUE",
          "A member of a single taxable person (seller scheme 0231) must add the note #TXD#MEMBRE_ASSUJETTI_UNIQUE");
        const repScheme = first(R, "TaxRepresentativeParty/PartyTaxScheme");
        rule("BR-FR-CO-15", first(R, "TaxRepresentativeParty") || R, !!repScheme && !!raw(first(repScheme, "CompanyID")),
          "A member of a single taxable person (seller scheme 0231) must give the single taxable person's VAT ID as tax representative (BT-63)");
      }

      // ---------- VAT (BR-FR-15, 16, CO-12) ----------
      const taxCats = kids("TaxCategory", "AllowanceCharge").concat(kids("TaxCategory", "TaxSubtotal"), kids("ClassifiedTaxCategory", "Item"));
      each("BR-FR-15", at(taxCats.filter((tc) => first(tc, "ID")), (el) => "category " + raw(first(el, "ID"))), (el) => VAT_CATS.has(raw(first(el, "ID"))),
        "VAT category codes must be S, E, AE, K, G, O or Z (L and M do not apply in France)");
      // The line rate is only checked on invoice lines, as in the source.
      const rateCats = kids("TaxCategory", "AllowanceCharge").concat(kids("TaxCategory", "TaxSubtotal"),
        kids("ClassifiedTaxCategory", "Item").filter((e) => e.parentElement.parentElement && e.parentElement.parentElement.localName === "InvoiceLine"));
      each("BR-FR-16", at(rateCats.filter((tc) => first(tc, "Percent")), (el) => raw(first(el, "Percent")) + " %"), (el) => VAT_RATES.has(raw(first(el, "Percent"))),
        "VAT rates must be French rates (20, 10, 5.5, 2.1 … with no % sign)");
      const docCur = raw(first(R, "DocumentCurrencyCode"));
      if (first(R, "DocumentCurrencyCode") && docCur !== "EUR") {
        const eurVat = byPath(R, "TaxTotal/TaxAmount").filter((e) => e.getAttribute("currencyID") === "EUR")[0];
        rule("BR-FR-CO-12", R, raw(first(R, "TaxCurrencyCode")) === "EUR" && !!raw(eurVat),
          "An invoice not in EUR must give EUR as VAT accounting currency (BT-6) and the VAT total in EUR (BT-111)", docCur);
      }

      // ---------- Attachments, object identifiers, item attributes (BR-FR-17, 18, 28 … 30) ----------
      each("BR-FR-17", at(allEls.filter((e) => e.localName === "AdditionalDocumentReference" && first(e, "DocumentDescription")), (el) => raw(first(el, "DocumentDescription"))),
        (el) => ATTACHMENT_CODES.has(raw(first(el, "DocumentDescription"))), "Attachment descriptions (BT-123) must be a French attachment code (RIB, LISIBLE, PJA …)");
      const lisible = byPath(R, "AdditionalDocumentReference").filter((d) => byPath(d, "DocumentDescription").some((e) => raw(e) === "LISIBLE"));
      if (lisible.length) rule("BR-FR-18", lisible, lisible.length <= 1, "Only one attachment may be described as LISIBLE", lisible.length + " found");
      each("BR-FR-28", lineEls("Item/AdditionalItemProperty").map((o) => ({ el: o.el, name: o.line + " " + (val(o.el, "Name") || "attribute") })),
        (el) => (!!first(el, "Value") && !first(el, "ValueQuantity")) ||
          (!first(el, "Value") && byPath(el, "ValueQuantity").some((q) => q.hasAttribute("unitCode") && q.getAttribute("unitCode") !== "")),
        "Item attributes must give either a value (BT-161) or a quantity with a unit, not both");
      const objectRefs = (refs, id) => {
        const scheme = (d, s) => byPath(d, "ID").filter((e) => e.getAttribute("schemeID") === s);
        each(id, refs.filter((o) => scheme(o.el, "AFL").length || scheme(o.el, "AVV").length),
          (el) => scheme(el, "AFL").length <= 1 && scheme(el, "AVV").length <= 1 && scheme(el, "AFL").concat(scheme(el, "AVV")).every((e) => norm(raw(e)) !== ""),
          "Object identifiers with scheme AFL or AVV must appear at most once each and not be empty");
      };
      objectRefs(at(byPath(R, "AdditionalDocumentReference"), (el) => "BT-18 " + raw(first(el, "ID"))), "BR-FR-29");
      objectRefs(lineEls("DocumentReference").map((o) => ({ el: o.el, name: o.line + " " + raw(first(o.el, "ID")) })), "BR-FR-30");

      // ---------- Number formats (BR-FR-DEC-01 … 04) ----------
      const lmtPaths = [["LineExtensionAmount", "BT-106"], ["AllowanceTotalAmount", "BT-107"], ["ChargeTotalAmount", "BT-108"], ["TaxExclusiveAmount", "BT-109"],
        ["TaxInclusiveAmount", "BT-112"], ["PrepaidAmount", "BT-113"], ["PayableRoundingAmount", "BT-114"], ["PayableAmount", "BT-115"]];
      const amounts = [["AllowanceCharge/Amount", "BT-92/99"], ["AllowanceCharge/BaseAmount", "BT-93/100"]]
        .flatMap(([path, bt]) => at(byPath(R, path), (el) => bt + " " + raw(el)))
        .concat(lmtPaths.flatMap(([path, bt]) => at(kids(path, "LegalMonetaryTotal"), (el) => bt + " " + raw(el))))
        .concat(at(kids("TaxAmount", "TaxTotal"), (el) => "BT-110/111 " + raw(el)))
        .concat(at(kids("TaxableAmount", "TaxSubtotal"), (el) => "BT-116 " + raw(el)), at(kids("TaxAmount", "TaxSubtotal"), (el) => "BT-117 " + raw(el)))
        .concat([["LineExtensionAmount", "BT-131"], ["AllowanceCharge/Amount", "BT-136/141"], ["AllowanceCharge/BaseAmount", "BT-137/142"]]
          .flatMap(([path, bt]) => lineEls(path).map((o) => ({ el: o.el, name: o.line + " " + bt + " " + raw(o.el) }))));
      each("BR-FR-DEC-01", amounts, (el) => decimal(norm(raw(el)), 2, true), "Amounts must have at most 2 decimals and 19 digits");
      const quantities = lineEls(cn ? "CreditedQuantity" : "InvoicedQuantity").map((o) => ({ el: o.el, name: o.line + " BT-129 " + raw(o.el) }))
        .concat(lineEls("Price/BaseQuantity").filter((o) => norm(raw(o.el))).map((o) => ({ el: o.el, name: o.line + " BT-149 " + raw(o.el) })));
      each("BR-FR-DEC-02", quantities, (el) => decimal(norm(raw(el)), 4, true), "Quantities (BT-129, BT-149) must have at most 4 decimals and 19 digits");
      // Prices may be negative only under frameworks S9, B9 and M9.
      const negPrices = ["S9", "B9", "M9"].includes(norm(framework));
      const prices = [["Price/PriceAmount", "BT-146"], ["Price/AllowanceCharge/Amount", "BT-147"], ["Price/AllowanceCharge/BaseAmount", "BT-148"]]
        .flatMap(([path, bt]) => lineEls(path).filter((o) => norm(raw(o.el))).map((o) => ({ el: o.el, name: o.line + " " + bt + " " + raw(o.el) })));
      each("BR-FR-DEC-03", prices, (el) => decimal(norm(raw(el)), 6, negPrices),
        negPrices ? "Prices (BT-146 … BT-148) must have at most 6 decimals and 19 digits" : "Prices (BT-146 … BT-148) must be positive with at most 6 decimals and 19 digits");
      const percents = taxCats.flatMap((tc) => at(byPath(tc, "Percent"), (el) => "rate " + raw(el)));
      each("BR-FR-DEC-04", percents, (el) => percent(norm(raw(el))), "VAT rates must be positive with at most 2 decimals and 4 digits");

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
})();
