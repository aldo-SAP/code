/*
 * Request → UBL for the SAP document request ({ "id": …, "document": [ { invNum, invIssueDate, … } ] }, the German and the UAE template).
 *
 * The placements below come from the field NAMES and from the official rules (EN 16931 business terms, the PINT AE rules for the UAE fields); there is no
 * mapping document yet. Every placement that is a reading of a name rather than something the rules state is a GUESS: it is listed in `assumptions` (when the
 * request has a value for it), so it can be found and replaced when the real mapping arrives. The table is `F` below, one line per field.
 *
 * Rules of the conversion (as in request-to-ubl.js):
 *  - Values go in as they are in the request: no trimming, no fixing. An empty field ("") is left out.
 *  - The empty form carries "2001-12-31" for a date and 0 for a number: a date of 2001-12-31 is left out, and so is a group (a payment means, an allowance …)
 *    in which nothing is filled. A 0 is left out where the field is optional (allowance totals, prepaid amount …) and written where it is a total.
 *  - Only the first entry of "document" is converted.
 *  - Every field that has a value but no place in the XML is listed in `notMapped`.
 *  - The children of every element are put in the order the UBL 2.1 schema gives (rules/ubl-schema-data.js).
 *
 * RequestDocument.convert(parsedInput) → { xml, kind, notMapped, assumptions, total, used, ruleSets: "detect" }
 */
(function () {
  "use strict";

  const NS = {
    inv: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2", cn: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
    cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2", cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  };
  const CREDIT_CODES = new Set(["81", "83", "261", "262", "296", "308", "381", "396", "532"]);
  const EMPTY_DATE = "2001-12-31";
  const LOCAL = "AED";   // GUESS: the "local currency" fields of the UAE template are dirhams

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // an element: { name: "cbc:ID", a: {attributes}, t: text, k: [children] }
  const isNode = (x) => x && typeof x === "object" && "name" in x;

  function convert(input) {
    const docs = input && Array.isArray(input.document) ? input.document : [];
    const d = docs[0];
    if (!d || typeof d !== "object") throw new Error("No invoice found in the request (expected { \"document\": [ { … } ] }).");

    FieldTrace.reset();
    const used = new Set();    // "path" of every field that was read
    const path = (o, k) => (o.__path || "document[0]") + "." + k;
    const assumptions = [];
    const guess = (field, text) => { const s = "GUESS · " + field + ": " + text; if (!assumptions.includes(s)) assumptions.push(s); };

    // ---- reading fields: s = text, dt = date, n = number (zero: keep a 0), b = true only
    const tag = (o, p) => { if (o && typeof o === "object" && !o.__path) Object.defineProperty(o, "__path", { value: p, enumerable: false }); return o; };
    const raw = (o, k) => { if (!o || typeof o !== "object") return undefined; used.add(path(o, k)); if (o[k] !== undefined && o[k] !== null && typeof o[k] !== "object") FieldTrace.read(path(o, k), o[k]); return o[k]; };
    const s = (o, k) => { const x = raw(o, k); return x === undefined || x === null ? "" : String(x); };
    const dt = (o, k) => { const x = s(o, k); return x === EMPTY_DATE ? "" : x; };
    const n = (o, k, zero) => { const x = raw(o, k); if (x === undefined || x === null || x === "") return ""; if (!zero && Number(x) === 0) return ""; return String(x); };
    const flag = (o, k) => raw(o, k) === true || raw(o, k) === "true";
    const blank = (x) => x === "" || x === null || x === undefined || x === 0 || x === false || x === EMPTY_DATE ||
      (Array.isArray(x) ? x.every(blank) : typeof x === "object" ? Object.values(x).every(blank) : false);
    const list = (o, k) => (Array.isArray(raw(o, k)) ? o[k] : []).map((e, i) => tag(e, path(o, k) + "[" + i + "]")).filter((e) => !blank(e));

    // ---- element builders; nothing is written when there is no content
    const B = (name, text, a) => { const m = FieldTrace.mark(text, a); return text === "" || text === undefined ? null : { name: "cbc:" + name, a: Object.assign({}, a), t: text, m }; };
    const C = (name, kids, a) => { const k = (kids || []).filter(Boolean); return k.length ? { name: "cac:" + name, a: Object.assign({}, a), k } : null; };
    const scheme = (v, a) => (v === "" ? {} : a);

    const typeCode = s(d, "invTypeCode");
    const credit = CREDIT_CODES.has(typeCode);
    const cur = s(d, "invCurrCode"), taxCur = s(d, "taxAccCurr");
    const uae = ["invTransTypeCode", "lineTaxInfos", "invTerms", "freqBilling"].some((k) => k in d || (Array.isArray(d.lines) && d.lines[0] && k in d.lines[0]));
    const M = (name, v, c) => (v === "" ? null : B(name, v, { currencyID: c === undefined ? cur : c }));
    const vatScheme = () => C("TaxScheme", [B("ID", "VAT")]);
    const taxCat = (id, rate, exCode, exText, name) => {
      if (id === "" && rate === "" && exCode === "" && exText === "") return null;
      return C(name || "TaxCategory", [B("ID", id), B("Percent", id === "O" ? "" : rate), B("TaxExemptionReasonCode", exCode), B("TaxExemptionReason", exText), vatScheme()]);
    };
    const rateOf = (o, k, id) => (id === "O" ? "" : n(o, k, true));

    // ---------- parties ----------
    const address = (o, p) => C("PostalAddress", [
      B("StreetName", s(o, p + "Addr1")), B("AdditionalStreetName", s(o, p + "Addr2")), B("CityName", s(o, p + "City")), B("PostalZone", s(o, p + "PostCode")),
      B("CountrySubentity", s(o, p + "CountrySub")), C("AddressLine", [B("Line", s(o, p + "Addr3"))]), C("Country", [B("IdentificationCode", s(o, p + "CountryCode"))])
    ]);
    // the legal registration id: scheme, and for the UAE the type (schemeAgencyID) and the authority or passport country (schemeAgencyName)
    const legalId = (o, p) => {
      const id = s(o, p + "LegalRegID"), sch = s(o, p + "LegalScheme"), type = s(o, p + "LegalRegIDType"), auth = s(o, p + "AuthName"), pass = s(o, p + "PassCountryCode");
      const agencyName = auth || pass;
      if (type || agencyName) guess(p + "LegalRegIDType / " + p + "AuthName / " + p + "PassCountryCode", "written as schemeAgencyID (type) and schemeAgencyName (authority name, or the passport country) of the legal registration id, as the PINT AE rules read them (BTAE-11/12, 15/16, 18/19).");
      return B("CompanyID", id, Object.assign({}, scheme(id, { schemeID: sch, schemeAgencyID: type, schemeAgencyName: agencyName })));
    };
    const contact = (o, p) => C("Contact", [B("Name", s(o, p + "Contact")), B("Telephone", s(o, p + "ContactTel")), B("ElectronicMail", s(o, p + "ContactEmail"))]);

    const sellerIds = list(d, "sellerPartyIDs").map((e) => C("PartyIdentification", [B("ID", s(e, "sellerID"), scheme(s(e, "sellerID"), { schemeID: s(e, "sellerIDScheme") }))]));
    if (s(d, "bankCreditorID")) { sellerIds.push(C("PartyIdentification", [B("ID", s(d, "bankCreditorID"), { schemeID: "SEPA" })])); guess("bankCreditorID", "the bank-assigned creditor identifier (BT-90) goes into the seller's identifiers with scheme SEPA."); }
    const seller = C("AccountingSupplierParty", [C("Party", [
      B("EndpointID", s(d, "sellerEndPointID"), scheme(s(d, "sellerEndPointID"), { schemeID: s(d, "sellerEndPointIDScheme") })),
      ...sellerIds, C("PartyName", [B("Name", s(d, "sellerTradeName"))]), address(d, "seller"),
      ...list(d, "taxIDs").map((e) => C("PartyTaxScheme", [B("CompanyID", s(e, "sellerTaxID")), C("TaxScheme", [B("ID", s(e, "sellerTaxScheme"))])])),
      C("PartyLegalEntity", [B("RegistrationName", s(d, "sellerName")), legalId(d, "seller"), B("CompanyLegalForm", s(d, "sellerAddLegalInfo"))]), contact(d, "seller")
    ])]);
    if (s(d, "buyerTaxID")) guess("buyerTaxID", "the template has no tax scheme for the buyer's tax id: it is written with the scheme VAT.");
    const buyer = C("AccountingCustomerParty", [C("Party", [
      B("EndpointID", s(d, "buyerEndpointId"), scheme(s(d, "buyerEndpointId"), { schemeID: s(d, "buyerEndpointIdScheme") })),
      C("PartyIdentification", [B("ID", s(d, "buyerID"), scheme(s(d, "buyerID"), { schemeID: s(d, "buyerIDScheme") }))]),
      C("PartyName", [B("Name", s(d, "buyerTradeName"))]), address(d, "buyer"),
      C("PartyTaxScheme", [B("CompanyID", s(d, "buyerTaxID")), s(d, "buyerTaxID") ? vatScheme() : null]),
      C("PartyLegalEntity", [B("RegistrationName", s(d, "buyerName")), legalId(d, "buyer")]), contact(d, "buyer")
    ])]);
    const payee = C("PayeeParty", [
      C("PartyIdentification", [B("ID", s(d, "payeeID"), scheme(s(d, "payeeID"), { schemeID: s(d, "payeeIDScheme") }))]), C("PartyName", [B("Name", s(d, "payeeName"))]),
      C("PartyLegalEntity", [B("CompanyID", s(d, "payeeLegalRegID"), scheme(s(d, "payeeLegalRegID"), { schemeID: s(d, "payeeLegalScheme") }))])
    ]);
    if (s(d, "buyerBenefID")) guess("buyerBenefID", "the beneficiary id (BTAE-01) goes into BuyerCustomerParty/Party/PartyIdentification, as rule ibr-007-ae reads it.");
    if (s(d, "sellerPrincipleID")) guess("sellerPrincipleID", "the principal id (BTAE-14) goes into SellerSupplierParty/Party/PartyIdentification, as rule ibr-137-ae reads it.");
    const buyerCustomer = C("BuyerCustomerParty", [C("Party", [C("PartyIdentification", [B("ID", s(d, "buyerBenefID"))])])]);
    const sellerSupplier = C("SellerSupplierParty", [C("Party", [C("PartyIdentification", [B("ID", s(d, "sellerPrincipleID"))])])]);
    const taxRep = C("TaxRepresentativeParty", [
      C("PartyName", [B("Name", s(d, "sellerTaxRepName"))]), address(d, "taxRep"),
      C("PartyTaxScheme", [B("CompanyID", s(d, "taxRepTaxID")), s(d, "taxRepTaxID") ? vatScheme() : null])
    ]);

    // ---------- delivery ----------
    if (s(d, "delivPartyID")) guess("delivPartyID", "the deliver-to party's id goes into Delivery/DeliveryParty/PartyIdentification.");
    const delivery = C("Delivery", [
      B("ActualDeliveryDate", dt(d, "actDelivDate")),
      C("DeliveryLocation", [B("ID", s(d, "delivLocID"), scheme(s(d, "delivLocID"), { schemeID: s(d, "delivLocIDScheme") })), address(d, "deliv")]),
      C("DeliveryParty", [C("PartyIdentification", [B("ID", s(d, "delivPartyID"))]), C("PartyName", [B("Name", s(d, "delivPartyName"))])])
    ]);
    if (s(d, "incoterms")) guess("incoterms", "the Incoterms (BTAE-22) go into DeliveryTerms/ID, as rule ibr-196-ae reads it.");
    const deliveryTerms = C("DeliveryTerms", [B("ID", s(d, "incoterms"))]);

    // ---------- payment ----------
    if (list(d, "payMeans").some((e) => dt(e, "payMeansDueDate"))) guess("payMeans[].payMeansDueDate", "written as PaymentMeans/PaymentDueDate (EN 16931 has no such field; rule UBL-CR-412 warns).");
    const payMeans = list(d, "payMeans").map((e) => {
      const acc = s(e, "payAccID");
      const branch = C("FinancialInstitutionBranch", [B("ID", s(e, "payServiceProvID")), address(e, "payServiceProv")]);
      const mandate = C("PaymentMandate", [B("ID", s(e, "mandateRefID")), C("PayerFinancialAccount", [B("ID", s(e, "debitedAccID"))])]);
      return C("PaymentMeans", [
        B("ID", s(e, "payInstrID")),
        B("PaymentMeansCode", s(e, "payMeansTypeCode"), scheme(s(e, "payMeansText"), { name: s(e, "payMeansText") })),
        B("PaymentDueDate", dt(e, "payMeansDueDate")),
        B("PaymentID", s(e, "remitInfo"), scheme(s(e, "remitInfo"), { schemeID: s(e, "remitIDScheme") })),
        C("CardAccount", [B("PrimaryAccountNumberID", s(e, "payCardPAN")), B("NetworkID", s(e, "networkID")), B("HolderName", s(e, "payCardHolderName"))]),
        C("PayeeFinancialAccount", [B("ID", acc, scheme(acc, { schemeID: s(e, "payAccIDScheme") })), B("Name", s(e, "payAccName")), branch]),
        mandate
      ]);
    });
    if (list(d, "payMeans").some((e) => s(e, "payInstrID") || s(e, "remitIDScheme") || s(e, "payAccIDScheme")))
      guess("payMeans[].payInstrID / remitIDScheme / payAccIDScheme", "the payment instruction id is PaymentMeans/ID (IBT-187); the two schemes are the schemeID of PaymentID and of the account id.");
    if (list(d, "payMeans").some((e) => s(e, "payServiceProvAddrL1") || s(e, "payServiceProvCity")))
      guess("payMeans[].payServiceProv…", "the address of the payment service provider goes into FinancialInstitutionBranch/Address.");
    const payTerms = [];
    if (s(d, "payTerms")) payTerms.push(C("PaymentTerms", [B("Note", s(d, "payTerms"))]));
    list(d, "invTerms").forEach((e) => {
      guess("invTerms[]", "each payment term is a PaymentTerms group: payTerms = Note, termPayInstrID = PaymentMeansID, termsAmt = Amount (in payTermsCCYCode), termInstDueDate = InstallmentDueDate.");
      payTerms.push(C("PaymentTerms", [B("PaymentMeansID", s(e, "termPayInstrID")), B("Note", s(e, "payTerms")),
        B("Amount", n(e, "termsAmt", true), { currencyID: s(e, "payTermsCCYCode") || cur }), B("InstallmentDueDate", dt(e, "termInstDueDate"))]));
    });

    // ---------- allowances and charges (document level) ----------
    const acDoc = (arr, pre, isCharge) => list(d, arr).map((e) => {
      const catId = s(e, pre + "TaxCatCode");
      return C("AllowanceCharge", [
        B("ChargeIndicator", isCharge ? "true" : "false"), B("AllowanceChargeReasonCode", s(e, pre + "ReasonCode")), B("AllowanceChargeReason", s(e, pre + "Reason")),
        B("MultiplierFactorNumeric", n(e, pre + "Pct")), M("Amount", n(e, pre + "Amt", true)), M("BaseAmount", n(e, pre + "BaseAmt")),
        taxCat(catId, rateOf(e, pre + "TaxRate", catId), s(e, pre + "TaxExemptReasonCode"), s(e, pre + "TaxExemptReasonText"))
      ]);
    });
    if (list(d, "allows").concat(list(d, "charges")).some((e) => Object.keys(e).some((k) => /TaxExemptReason/.test(k) && e[k])))
      guess("allows[] / charges[] …TaxExemptReason…", "written as the TaxExemptionReasonCode and TaxExemptionReason of the allowance's or charge's tax category.");

    // ---------- tax and totals ----------
    if (flag(d, "invTotalTaxIncludedInd")) guess("invTotalTaxIncludedInd", "written as TaxTotal/TaxIncludedIndicator (rules ibr-co-13 and ibr-co-15 read it there); only when true.");
    const taxTotals = [];
    const subtotals = list(d, "subtotals").map((e) => {
      const id = s(e, "taxCatCode");
      return C("TaxSubtotal", [M("TaxableAmount", n(e, "taxCatTaxableAmt", true)), M("TaxAmount", n(e, "taxCatTaxAmt", true)),
        taxCat(id, rateOf(e, "taxCatRate", id), s(e, "taxExemptReasonCode"), s(e, "taxExemptReasonText"))]);
    });
    const taxAmt = n(d, "invTotalTaxAmt", true);
    if (taxAmt !== "" || subtotals.length) taxTotals.push(C("TaxTotal", [M("TaxAmount", taxAmt), flag(d, "invTotalTaxIncludedInd") ? B("TaxIncludedIndicator", "true") : null, ...subtotals]));
    if (taxCur && n(d, "invTotalTaxAmtAccCurr", true) !== "") taxTotals.push(C("TaxTotal", [M("TaxAmount", n(d, "invTotalTaxAmtAccCurr", true), taxCur)]));
    else n(d, "invTotalTaxAmtAccCurr", true);
    if (s(d, "localCrcyTotalInclTax")) guess("localCrcyTotalInclTax", "the total in the local currency (AED) goes into LegalMonetaryTotal/PayableAlternativeAmount.");
    const monetary = C("LegalMonetaryTotal", [
      M("LineExtensionAmount", n(d, "sumInvLineNetAmt", true)), M("TaxExclusiveAmount", n(d, "invTotalAmtNoTax", true)), M("TaxInclusiveAmount", n(d, "invTotalAmtWithTax", true)),
      M("AllowanceTotalAmount", n(d, "sumAllowancesDocLevel")), M("ChargeTotalAmount", n(d, "sumChargesDocLevel")), M("PrepaidAmount", n(d, "paidAmt")),
      M("PayableRoundingAmount", n(d, "roundingAmt")), M("PayableAmount", n(d, "amtDueForPay", true)),
      M("PayableAlternativeAmount", s(d, "localCrcyTotalInclTax"), LOCAL)
    ]);
    const exch = n(d, "exchRateCalcRate");
    if (exch) guess("exchRateCalcRate", "written as TaxExchangeRate/CalculationRate, from the invoice currency to the VAT accounting currency (rule ibr-153-ae).");
    const taxExchange = C("TaxExchangeRate", [B("SourceCurrencyCode", exch ? cur : ""), B("TargetCurrencyCode", exch ? taxCur : ""), B("CalculationRate", exch)]);

    // ---------- lines ----------
    const lineTag = credit ? "CreditNoteLine" : "InvoiceLine";
    const acLine = (e, arr, pre, isCharge) => list(e, arr).map((a) => C("AllowanceCharge", [
      B("ChargeIndicator", isCharge ? "true" : "false"), B("AllowanceChargeReasonCode", s(a, pre + "ReasonCode")), B("AllowanceChargeReason", s(a, pre + "Reason")),
      B("MultiplierFactorNumeric", n(a, pre + "Pct")), M("Amount", n(a, pre + "Amt", true)), M("BaseAmount", n(a, pre + "BaseAmt"))
    ]));
    const lines = list(d, "lines").map((L) => {
      const qtyName = credit ? "CreditedQuantity" : "InvoicedQuantity";
      const price = (() => {
        // DE: the price discount is a list, UAE: two fields of the line
        const disc = [];
        list(L, "lineItemAllows").forEach((a) => disc.push([n(a, "itemPriceDiscount"), n(a, "itemGrossPrice")]));
        disc.push([n(L, "itemPriceDiscount"), n(L, "itemGrossPrice")]);
        return C("Price", [
          M("PriceAmount", n(L, "itemNetPrice", true)), B("BaseQuantity", n(L, "itemPriceBaseQty"), scheme(s(L, "itemPriceBaseQtyUOM"), { unitCode: s(L, "itemPriceBaseQtyUOM") })),
          ...disc.filter(([a, b]) => a || b).map(([a, b]) => C("AllowanceCharge", [B("ChargeIndicator", "false"), M("Amount", a), M("BaseAmount", b)]))
        ]);
      })();
      const taxInfos = list(L, "lineTaxInfos").map((t) => {
        const id = s(t, "invItemTaxCatCode");
        return taxCat(id, rateOf(t, "invItemTaxRate", id), s(t, "taxExempReasonCode"), s(t, "taxExempReasonTxt"), "ClassifiedTaxCategory");
      });
      if (s(L, "invItemTaxCatCode") || n(L, "invItemTaxRate", true) !== "") { const id = s(L, "invItemTaxCatCode"); taxInfos.push(taxCat(id, rateOf(L, "invItemTaxRate", id), "", "", "ClassifiedTaxCategory")); }
      const classifs = list(L, "classifs").map((c) => C("CommodityClassification", [
        B("NatureCode", s(c, "typeGoodsServ")), B("CommodityCode", s(c, "itemType")),
        B("ItemClassificationCode", s(c, "itemClassId"), scheme(s(c, "itemClassId"), { listID: s(c, "itemClassScheme"), listVersionID: s(c, "itemClassSchemeVer") }))
      ]));
      if (list(L, "classifs").some((c) => s(c, "typeGoodsServ") || s(c, "itemType")))
        guess("lines[].classifs[].typeGoodsServ / itemType", "itemType is the Item type (BTAE-13, CommodityClassification/CommodityCode: G, S or B) and typeGoodsServ the Type of goods (NatureCode), as the PINT AE rules ibr-184 to ibr-186 and ibr-006-ae read them.");
      const addIds = list(L, "addItemsIdent").map((a) => C("AdditionalItemIdentification", [B("ID", s(a, "servAccCode"), scheme(s(a, "servAccCode"), { schemeID: s(a, "servAccCodeSchemeID"), schemeVersionID: s(a, "servAccCodeSchemeVerID") }))]));
      if (addIds.length) guess("lines[].addItemsIdent[]", "the service accounting code (BTAE-17) is Item/AdditionalItemIdentification/ID (scheme SAC), with its version as schemeVersionID.");
      if (s(L, "batchNum")) guess("lines[].batchNum", "the batch number goes into Item/ItemInstance/LotIdentification/LotNumberID.");
      const ext = C("ItemPriceExtension", [M("Amount", n(L, "lineAmountLocalCrcy", true), LOCAL), C("TaxTotal", [M("TaxAmount", n(L, "lineTaxAmountLocalCrcy", true), LOCAL)])]);
      if (ext) guess("lines[].lineAmountLocalCrcy / lineTaxAmountLocalCrcy", "the line amount and the line VAT in AED are ItemPriceExtension/Amount (BTAE-10) and ItemPriceExtension/TaxTotal/TaxAmount (BTAE-08), as rules ibr-104-ae and ibr-194-ae read them.");
      const lineDoc = s(L, "invLineObjID") ? C("DocumentReference", [B("ID", s(L, "invLineObjID"), scheme(s(L, "invLineObjID"), { schemeID: s(L, "invLineObjScheme") })), B("DocumentTypeCode", "130")]) : null;
      if (s(L, "refPORef") || s(L, "despAdvLine") || s(L, "despAdvRef")) guess("lines[].refPORef / despAdvLine / despAdvRef", "the order reference of the line is OrderLineReference/OrderReference/ID; the despatch advice line and reference are DespatchLineReference/LineID and DocumentReference/ID.");
      return C(lineTag, [
        B("ID", s(L, "invLineID")), B("Note", s(L, "invLineNote")),
        B(qtyName, n(L, "invoicedQty", true), scheme(s(L, "invoicedQtyUOM"), { unitCode: s(L, "invoicedQtyUOM") })), M("LineExtensionAmount", n(L, "invLineNetAmt", true)),
        B("AccountingCost", s(L, "invLineBuyerAccRef")),
        C("InvoicePeriod", [B("StartDate", dt(L, "invLinePeriodStartDate")), B("EndDate", dt(L, "invLinePeriodEndDate"))]),
        C("OrderLineReference", [B("LineID", s(L, "refPOLineRef")), C("OrderReference", [B("ID", s(L, "refPORef"))])]),
        C("DespatchLineReference", [B("LineID", s(L, "despAdvLine")), C("DocumentReference", [B("ID", s(L, "despAdvRef"))])]),
        lineDoc,
        ...acLine(L, "lineAllows", "invLineAllow", false), ...acLine(L, "lineCharges", "invLineCharge", true),
        C("Item", [
          B("Description", s(L, "itemDesc")), B("Name", s(L, "itemName")),
          C("BuyersItemIdentification", [B("ID", s(L, "itemBuyerID"))]), C("SellersItemIdentification", [B("ID", s(L, "sellerItemID"))]),
          C("StandardItemIdentification", [B("ID", s(L, "itemStdID"), scheme(s(L, "itemStdID"), { schemeID: s(L, "schemeID") }))]), ...addIds,
          C("OriginCountry", [B("IdentificationCode", s(L, "itemCountryOrigin"))]), ...classifs, ...taxInfos,
          ...list(L, "props").map((p) => C("AdditionalItemProperty", [B("Name", s(p, "itemAttrName")), B("Value", s(p, "itemAttrValue"))])),
          C("ItemInstance", [C("LotIdentification", [B("LotNumberID", s(L, "batchNum"))])])
        ]),
        price, ext
      ]);
    });

    // ---------- the document ----------
    const profile = uae
      ? { customization: "urn:peppol:pint:billing-1@ae-1", profileId: "urn:peppol:bis:billing" }
      : { customization: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0", profileId: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0" };
    guess("CustomizationID / ProfileID", "the request carries neither: " + (uae ? "the PINT AE" : "the XRechnung 3.0") + " identifiers are written as constants.");
    if (s(d, "invTransTypeCode")) guess("invTransTypeCode", "the transaction type flags (BTAE-02) go into ProfileExecutionID, as the PINT AE rules ibr-007-ae and ibr-154-ae read them.");
    if (s(d, "freqBilling")) guess("freqBilling", "the billing frequency (BTAE-06) goes into InvoicePeriod/DescriptionCode, as rules ibr-005-ae and ibr-160-ae read it.");
    if (s(d, "taxDateCode")) guess("taxDateCode", "the VAT point date code (BT-8) goes into InvoicePeriod/DescriptionCode.");
    if (s(d, "CNReasonCode")) guess("CNReasonCode", "the credit note reason (BTAE-03) goes into DiscrepancyResponse/ResponseCode (credit notes only).");
    if (s(d, "cusRefNum")) guess("cusRefNum", "the customer reference number goes into OrderReference/CustomerReference (the name is the only hint).");
    if (s(d, "ctrValue")) guess("ctrValue", "the contract value goes into ContractDocumentReference/DocumentDescription (the name is the only hint).");
    if (s(d, "invIssueTime")) guess("invIssueTime", "the issue time goes into IssueTime.");
    if (list(d, "addDocRefs").some((e) => s(e, "addDocRefAttId"))) guess("addDocRefs[].addDocRefAttId", "taken for the identifier of the attached file and written as the document reference's UUID (the file itself cannot be in the request).");
    if (credit && dt(d, "payDueDate")) guess("payDueDate", "credit note: the due date goes to PaymentMeans/PaymentDueDate (a UBL credit note has no document-level due date).");

    const periodCode = s(d, "taxDateCode") || s(d, "freqBilling");
    const docRefs = [];
    if (s(d, "invObjID")) docRefs.push(C("AdditionalDocumentReference", [B("ID", s(d, "invObjID"), scheme(s(d, "invObjID"), { schemeID: s(d, "invObjIDScheme") })), B("DocumentTypeCode", "130")]));
    list(d, "addDocRefs").forEach((e) => docRefs.push(C("AdditionalDocumentReference", [
      B("ID", s(e, "suppDocRef")), B("UUID", s(e, "addDocRefAttId")), B("DocumentDescription", s(e, "suppDocDesc")), C("Attachment", [C("ExternalReference", [B("URI", s(e, "extDocLoc"))])])])));
    const dueInMeans = credit && dt(d, "payDueDate");
    const root = {
      name: (credit ? "cn:" : "ubl:") + (credit ? "CreditNote" : "Invoice"), a: {}, k: [
        B("CustomizationID", profile.customization), B("ProfileID", profile.profileId), B("ProfileExecutionID", s(d, "invTransTypeCode")),
        B("ID", s(d, "invNum")), B("IssueDate", dt(d, "invIssueDate")), B("IssueTime", s(d, "invIssueTime")),
        credit ? null : B("DueDate", dt(d, "payDueDate")), B(credit ? "CreditNoteTypeCode" : "InvoiceTypeCode", typeCode),
        B("Note", s(d, "invNote")), B("TaxPointDate", dt(d, "taxPntDate")), B("DocumentCurrencyCode", cur), B("TaxCurrencyCode", taxCur),
        B("AccountingCost", s(d, "buyAccRef")), B("BuyerReference", s(d, "buyRef")),
        C("InvoicePeriod", [B("StartDate", dt(d, "invPerSDate")), B("EndDate", dt(d, "invPerEDate")), B("DescriptionCode", periodCode)]),
        credit ? C("DiscrepancyResponse", [B("ResponseCode", s(d, "CNReasonCode"))]) : null,
        C("OrderReference", [B("ID", s(d, "purOrdRef")), B("SalesOrderID", s(d, "saleOrdRef")), B("CustomerReference", s(d, "cusRefNum"))]),
        ...list(d, "precInvs").map((e) => C("BillingReference", [C("InvoiceDocumentReference", [B("ID", s(e, "preInvRef")), B("IssueDate", dt(e, "preInvIssRef"))])])),
        C("DespatchDocumentReference", [B("ID", s(d, "desAdvRef"))]), C("ReceiptDocumentReference", [B("ID", s(d, "recvAdvRef"))]),
        C("OriginatorDocumentReference", [B("ID", s(d, "tenLotRef"))]), C("ContractDocumentReference", [B("ID", s(d, "ctrRef")), B("DocumentDescription", s(d, "ctrValue"))]),
        ...docRefs, C("ProjectReference", [B("ID", s(d, "projRef"))]),
        seller, buyer, payee, buyerCustomer, sellerSupplier, taxRep, delivery, deliveryTerms,
        ...payMeans, ...payTerms, ...acDoc("allows", "docAllow", false), ...acDoc("charges", "docCharge", true), taxExchange,
        ...taxTotals, monetary, ...lines
      ].filter(Boolean)
    };
    if (dueInMeans) {
      let m = root.k.find((x) => x.name === "cac:PaymentMeans");
      if (!m) { m = C("PaymentMeans", [B("PaymentDueDate", dueInMeans)]); root.k.push(m); }
      else if (!m.k.some((x) => x.name === "cbc:PaymentDueDate")) m.k.push(B("PaymentDueDate", dueInMeans));
    }

    // ---- the order of the children, from the UBL 2.1 schema
    const S = window.UBL_SCHEMA;
    const keyOfNode = (x) => (x.name.startsWith("ubl:") || x.name.startsWith("cn:") ? NS[credit ? "cn" : "inv"] : NS[x.name.split(":")[0]]) + "|" + x.name.split(":")[1];
    const unplaced = [];
    function order(x) {
      if (!x.k) return;
      const t = S && S.types[S.elems[keyOfNode(x)]];
      if (t && t.c) {
        const idx = (c) => { const i = t.c.findIndex((p) => p[0] === keyOfNode(c)); return i < 0 ? 999 : i; };
        x.k.forEach((c) => { if (idx(c) === 999) unplaced.push(x.name + " → " + c.name); });
        x.k = x.k.map((c, i) => [c, i]).sort((a, b) => idx(a[0]) - idx(b[0]) || a[1] - b[1]).map((a) => a[0]);
      }
      x.k.forEach(order);
    }
    order(root);
    unplaced.forEach((u) => assumptions.push("NOT IN THE SCHEMA · " + u + ": UBL 2.1 has no such element at that place; it stays where it was written."));

    // ---- text
    const attrText = (a) => Object.keys(a || {}).filter((k) => a[k] !== "" && a[k] !== undefined).map((k) => " " + k + '="' + esc(a[k]) + '"').join("");
    const out = [];
    (function w(x, ind) {
      const pad = "  ".repeat(ind), nsAttrs = ind === 0
        ? ' xmlns:' + (credit ? "cn" : "ubl") + '="' + (credit ? NS.cn : NS.inv) + '" xmlns:cac="' + NS.cac + '" xmlns:cbc="' + NS.cbc + '"' : "";
      if (x.k) { out.push(pad + "<" + x.name + nsAttrs + attrText(x.a) + ">"); x.k.forEach((c) => w(c, ind + 1)); out.push(pad + "</" + x.name + ">"); }
      else out.push(pad + "<" + x.name + attrText(x.a) + ">" + esc(x.t) + (x.m || "") + "</" + x.name + ">");
    })(root, 0);
    const traced = FieldTrace.extract('<?xml version="1.0" encoding="UTF-8"?>\n' + out.join("\n") + "\n");
    const xml = traced.xml;

    // ---- what was not placed: every field with a value that was never read
    const notMapped = [];
    let total = 0, usedCount = 0;
    (function scan(o, p) {
      if (Array.isArray(o)) { o.forEach((e, i) => scan(e, p + "[" + i + "]")); return; }
      if (o && typeof o === "object") { Object.keys(o).forEach((k) => scan(o[k], p + "." + k)); return; }
      if (blank(o)) return;
      total++;
      if (used.has(p)) usedCount++;
      else notMapped.push({ path: p, value: String(o), reason: "no place in the XML for this field yet" });
    })(d, "document[0]");
    return { xml, kind: credit ? "CreditNote" : "Invoice", notMapped, assumptions, total: docs.length, used: usedCount, fields: total, ruleSets: "detect", trace: traced.trace.map((t) => Object.assign(t, { field: t.field.replace(/^document\[0\]\./, "") })) };
  }

  window.RequestDocument = { convert };
})();
