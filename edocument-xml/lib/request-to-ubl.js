/*
 * Request → UBL. The requests SAP sends ({ "req": [ { InvoiceNumber, … } ] }) are turned into a UBL Invoice or CreditNote,
 * which then goes through the same rules as any XML.
 *
 * Rules of the conversion:
 *  - Values go in exactly as they are in the request: no trimming, no fixing, no defaults. An empty field ("") is left out.
 *  - Only the first entry of "req" is converted.
 *  - Every field that has a value but no place in the XML is listed in `notMapped`, so nothing disappears silently.
 *  - `assumptions` lists the placements that are a reading of the field name rather than something the request states.
 *
 * RequestToUbl.convert(parsedInput) → { xml, kind, notMapped: [{ path, value, reason }], assumptions: [string], total, used }
 */
(function () {
  "use strict";

  const NS_INVOICE = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
  const NS_CREDIT = "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2";
  const NS_CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
  const NS_CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
  // UNTDID 1001 codes that are credit notes
  const CREDIT_CODES = new Set(["81", "83", "261", "262", "296", "308", "381", "396", "532"]);

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const attrs = (a) => Object.keys(a || {}).filter((k) => a[k] !== "" && a[k] !== undefined).map((k) => " " + k + '="' + esc(a[k]) + '"').join("");

  function pretty(s) {
    const out = [], toks = s.match(/<[^>]+>[^<]*/g) || [];
    let ind = 0;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.startsWith("</")) { ind--; out.push("  ".repeat(Math.max(ind, 0)) + t); continue; }
      if (t.startsWith("<?")) { out.push(t); continue; }
      const text = t.slice(t.indexOf(">") + 1);
      if (text !== "" && toks[i + 1] && toks[i + 1].startsWith("</")) { out.push("  ".repeat(ind) + t + toks[i + 1]); i++; continue; }
      out.push("  ".repeat(ind) + t); ind++;
    }
    return out.join("\n");
  }

  function convert(input) {
    // the document request ({ id, document: [ … ] }) has its own converter (lib/request-document.js)
    if (input && !Array.isArray(input.req) && Array.isArray(input.document) && window.RequestDocument) return window.RequestDocument.convert(input);
    const list = input && Array.isArray(input.req) ? input.req : Array.isArray(input) ? input : [input];
    const inv = list[0];
    if (!inv || typeof inv !== "object") throw new Error("No invoice found in the request (expected { \"req\": [ { … } ] }).");

    const used = new WeakMap();
    // the path of every object of the request, to name the fields that are read (the same names as in the list of what was not placed)
    const where = new WeakMap();
    (function name(o, p) {
      if (Array.isArray(o)) { o.forEach((x, i) => name(x, p + "[" + (i + 1) + "]")); return; }
      if (!o || typeof o !== "object") return;
      where.set(o, p);
      Object.keys(o).forEach((k) => { if (o[k] && typeof o[k] === "object") name(o[k], p ? p + "." + k : k); });
    })(inv, "");
    FieldTrace.reset();
    // read a field and remember that it was used; "" when it is missing or empty
    const v = (o, k) => {
      if (!o || typeof o !== "object") return "";
      if (!used.has(o)) used.set(o, new Set());
      used.get(o).add(k);
      const x = o[k];
      if (x !== undefined && x !== null && typeof x !== "object") FieldTrace.read((where.get(o) ? where.get(o) + "." : "") + k, x);
      return x === undefined || x === null ? "" : String(x);
    };
    const has = (o, k) => o && o[k] !== undefined && o[k] !== null && String(o[k]) !== "";
    const num = (x) => { const n = parseFloat(String(x === undefined || x === null ? "" : x).replace(/,/g, "")); return isNaN(n) ? null : n; };
    const reasonFor = new WeakMap();   // object → why some of its fields are not written
    const reasonOf = new WeakMap();    // object → { field: why that field is not written }
    const whyNot = (o, k, why) => { if (!reasonOf.has(o)) reasonOf.set(o, {}); reasonOf.get(o)[k] = why; };

    const typeCode = v(inv, "InvoiceType");
    const credit = CREDIT_CODES.has(typeCode);
    const cur = v(inv, "InvoiceCurrencyCode");
    const taxCur = v(inv, "VATCurrencyCode");

    // element builders (cbc = text, cac = group); nothing is written when there is no content
    const B = (name, text, a) => {
      const m = FieldTrace.mark(text, a);
      return text === "" || text === undefined ? "" : "<cbc:" + name + attrs(a) + ">" + esc(text) + m + "</cbc:" + name + ">";
    };
    const C = (name, kids, a) => { const k = kids.filter(Boolean); return k.length ? "<cac:" + name + attrs(a) + ">" + k.join("") + "</cac:" + name + ">" : ""; };
    const M = (name, text, c) => B(name, text, { currencyID: c === undefined ? cur : c });

    const assumptions = [];
    const assume = (s) => { if (!assumptions.includes(s)) assumptions.push(s); };

    // ---------- parties ----------
    const address = (o, p) => C("PostalAddress", [
      B("StreetName", v(o, p + "Address1")), B("AdditionalStreetName", v(o, p + "Address2")), B("CityName", v(o, p + "City")),
      B("PostalZone", v(o, p + "Postcode")), B("CountrySubentity", v(o, p + "Subdivision")),
      C("AddressLine", [B("Line", v(o, p + "Address3"))]), C("Country", [B("IdentificationCode", v(o, p + "Country"))])
    ]);
    const idsOf = (rows, key) => rows.map((r) => [v(r, key), v(r, key + "_Scheme")]).filter(([id]) => id !== "");
    const partyId = (pairs) => pairs.map(([id, sch]) => C("PartyIdentification", [B("ID", id, { schemeID: sch })]));
    const items = Array.isArray(inv.InvoiceHeaderItemList) ? inv.InvoiceHeaderItemList : [];

    function party(p, o) {
      return C("Party", [
        B("EndpointID", v(o, p + "Endpoint"), { schemeID: v(o, p + "Endpoint_Scheme") }),
        ...(o.__ids || []).map(([id, sch]) => C("PartyIdentification", [B("ID", id, { schemeID: sch })])),
        C("PartyName", [B("Name", v(o, o.__nameKey || p + "TradingName"))]),
        address(o, p),
        C("PartyTaxScheme", [B("CompanyID", v(o, p + "VATID")), C("TaxScheme", [B("ID", v(o, p + "VATID_Scheme"))])]),
        has(o, p + "TaxID") ? C("PartyTaxScheme", [B("CompanyID", v(o, p + "TaxID")), C("TaxScheme", [B("ID", v(o, p + "TaxID_Scheme"))])]) : "",
        C("PartyLegalEntity", [B("RegistrationName", v(o, p + "LegalName")), B("CompanyID", v(o, p + "LegalID"), { schemeID: v(o, p + "LegalID_Scheme") }),
          B("CompanyLegalForm", p === "Seller" ? v(o, "SellerAdditionalLegalID") : "")]),
        C("Contact", [B("Name", v(o, p + "ContactName")), B("Telephone", v(o, p + "ContactNumber")), B("ElectronicMail", v(o, p + "Email"))])
      ]);
    }

    const sellerIds = idsOf(items, "SellerID");
    if (has(inv, "DirectBankIdentifier")) { sellerIds.push([v(inv, "DirectBankIdentifier"), "SEPA"]); assume("DirectBankIdentifier is the bank-assigned creditor identifier (BT-90) and goes into the seller's identifiers with scheme SEPA."); }
    const sellerXml = (() => {
      inv.__ids = sellerIds;
      const x = party("Seller", inv); delete inv.__ids; return C("AccountingSupplierParty", [x]);
    })();
    const buyerXml = (() => { inv.__ids = idsOf(items, "BuyerID"); const x = party("Buyer", inv); delete inv.__ids; return C("AccountingCustomerParty", [x]); })();

    // payee: only the fields the payee group has
    const payeeXml = (() => {
      const ids = idsOf(items, "PayeeID");
      return C("PayeeParty", [
        ...ids.map(([id, sch]) => C("PartyIdentification", [B("ID", id, { schemeID: sch })])),
        C("PartyName", [B("Name", v(inv, "PayeeName"))]),
        address(inv, "Payee"),
        C("PartyTaxScheme", [B("CompanyID", v(inv, "PayeeVATID")), C("TaxScheme", [B("ID", v(inv, "PayeeVATID_Scheme"))])]),
        C("PartyLegalEntity", [B("CompanyID", v(inv, "PayeeLegalID"), { schemeID: v(inv, "PayeeLegalID_Scheme") })]),
        C("Contact", [B("Name", v(inv, "PayeeContactName")), B("Telephone", v(inv, "PayeeContactNumber")), B("ElectronicMail", v(inv, "PayeeEmail"))])
      ]);
    })();
    const taxRepXml = C("TaxRepresentativeParty", [
      C("PartyName", [B("Name", v(inv, "TaxRepresentativeName"))]),
      address(inv, "TaxRepresentative"),
      C("PartyTaxScheme", [B("CompanyID", v(inv, "TaxRepresentativeVATID")), C("TaxScheme", [B("ID", v(inv, "TaxRepresentativeVATID_Scheme"))])])
    ]);

    // ---------- header lists ----------
    const notes = [], billing = [], docs = [], terms = [], docAc = [], subtotals = [];
    items.forEach((r) => {
      const text = v(r, "InvoiceNote"), code = v(r, "InvoiceNoteSubjectCode");
      if (text !== "" || code !== "") notes.push(B("Note", code !== "" ? "#" + code + "#" + text : text));
      if (has(r, "PreviousInvoiceIssueID") || has(r, "PreviousInvoiceIssueDate") || has(r, "PreviousInvoiceIssueType")) {
        billing.push(C("BillingReference", [C("InvoiceDocumentReference", [B("ID", v(r, "PreviousInvoiceIssueID")), B("IssueDate", v(r, "PreviousInvoiceIssueDate")), B("DocumentTypeCode", v(r, "PreviousInvoiceIssueType"))])]));
      }
      if (has(r, "InvoicedObjectID")) docs.push(C("AdditionalDocumentReference", [B("ID", v(r, "InvoicedObjectID"), { schemeID: v(r, "InvoicedObjectID_Scheme") }), B("DocumentTypeCode", "130")]));
      const embedded = has(r, "AdditionalDocEmbedded"), url = has(r, "AdditionalDocURL");
      // a file name or mime type without the file: the file is uploaded separately (the request cannot carry it)
      if (!embedded) ["AdditionalDocEmbedded_Filename", "AdditionalDocEmbedded_Mimecode"].forEach((k) => { if (has(r, k)) whyNot(r, k, "attachment uploaded separately"); });
      if (has(r, "InvoicedDocumentReference") || has(r, "AdditionalDocDescription") || embedded || url) {
        docs.push(C("AdditionalDocumentReference", [
          B("ID", v(r, "InvoicedDocumentReference")), B("DocumentDescription", v(r, "AdditionalDocDescription")),
          embedded || url ? C("Attachment", [
            embedded ? B("EmbeddedDocumentBinaryObject", v(r, "AdditionalDocEmbedded"), { mimeCode: v(r, "AdditionalDocEmbedded_Mimecode"), filename: v(r, "AdditionalDocEmbedded_Filename") }) : "",
            url ? C("ExternalReference", [B("URI", v(r, "AdditionalDocURL"))]) : ""
          ]) : ""
        ]));
      }
      if (has(r, "PaymentTerms")) terms.push(C("PaymentTerms", [B("Note", v(r, "PaymentTerms"))]));
      const tax = (k, rateKey, exK, exCodeK) => C("TaxCategory", [B("ID", v(r, k)), B("Percent", rateKey ? v(r, rateKey) : ""), B("TaxExemptionReasonCode", v(r, exCodeK)), B("TaxExemptionReason", v(r, exK)), C("TaxScheme", [B("ID", v(r, k + "_Scheme"))])]);
      if (["DocumentAllowanceReasonCode", "DocumentAllowanceReason", "DocumentAllowancePercentage", "DocumentAllowanceAmount", "DocumentAllowanceBaseAmount", "DocumentAllowanceTaxCategory"].some((k) => has(r, k))) {
        assume("InvoiceChargeVATRate (it sits in the allowance group of the header list) is read as the allowance's VAT rate.");
        docAc.push(C("AllowanceCharge", [B("ChargeIndicator", "false"), B("AllowanceChargeReasonCode", v(r, "DocumentAllowanceReasonCode")), B("AllowanceChargeReason", v(r, "DocumentAllowanceReason")),
          B("MultiplierFactorNumeric", v(r, "DocumentAllowancePercentage")), M("Amount", v(r, "DocumentAllowanceAmount")), M("BaseAmount", v(r, "DocumentAllowanceBaseAmount")),
          tax("DocumentAllowanceTaxCategory", "InvoiceChargeVATRate", "DocumentAllowanceVATExemption", "DocumentAllowanceVATExemptionCode")]));
      }
      if (["DocumentChargeReasonCode", "DocumentChargeReason", "DocumentChargePercentage", "DocumentChargeAmount", "DocumentChargeBaseAmount", "DocumentChargeTaxCategory"].some((k) => has(r, k))) {
        docAc.push(C("AllowanceCharge", [B("ChargeIndicator", "true"), B("AllowanceChargeReasonCode", v(r, "DocumentChargeReasonCode")), B("AllowanceChargeReason", v(r, "DocumentChargeReason")),
          B("MultiplierFactorNumeric", v(r, "DocumentChargePercentage")), M("Amount", v(r, "DocumentChargeAmount")), M("BaseAmount", v(r, "DocumentChargeBaseAmount")),
          tax("DocumentChargeTaxCategory", "DocumentChargeVATRate", "DocumentChargeVATExemption", "DocumentChargeVATExemptionCode")]));
      }
      if (["TaxableAmount", "TaxAmount", "TaxCategoryID"].some((k) => has(r, k))) {
        subtotals.push(C("TaxSubtotal", [M("TaxableAmount", v(r, "TaxableAmount")), M("TaxAmount", v(r, "TaxAmount")),
          C("TaxCategory", [B("ID", v(r, "TaxCategoryID")), B("Percent", v(r, "TaxRate")), B("TaxExemptionReasonCode", v(r, "TaxExemptionCode")), B("TaxExemptionReason", v(r, "TaxExemptionReason")),
            C("TaxScheme", [B("ID", v(r, "TaxCategory_Scheme"))])])]));
      }
    });

    // The price discount (BT-147) is the LineItemDiscount of an InvoiceLineItemList row, as sent (it is per unit). The gross price (BT-148) goes with it
    // as the base amount; a price AllowanceCharge with a base amount only is not valid, so without a discount the gross price is not written.
    const priceAllowance = (L, rows) => {
      const withDiscount = rows.filter((r) => has(r, "LineItemDiscount"));
      const d = withDiscount[0];
      withDiscount.slice(1).forEach((r) => whyNot(r, "LineItemDiscount", "several LineItemDiscount rows on one line: only the first is used"));
      if (has(L, "LineItemDiscount")) whyNot(L, "LineItemDiscount", "not used on the line, only inside InvoiceLineItemList");
      if (!d) {
        if (has(L, "LineItemGrossPrice")) whyNot(L, "LineItemGrossPrice", "the gross price is only written with a LineItemDiscount in InvoiceLineItemList");
        return "";
      }
      return C("AllowanceCharge", [B("ChargeIndicator", "false"), M("Amount", v(d, "LineItemDiscount")), M("BaseAmount", v(L, "LineItemGrossPrice"))]);
    };

    // ---------- lines ----------
    const lineTag = credit ? "CreditNoteLine" : "InvoiceLine", qtyTag = credit ? "CreditedQuantity" : "InvoicedQuantity";
    const lines = (Array.isArray(inv.InvoiceLineList) ? inv.InvoiceLineList : []).map((L) => {
      const rows = Array.isArray(L.InvoiceLineItemList) ? L.InvoiceLineItemList : [];
      const lineNotes = rows.filter((r) => has(r, "LineNote")).map((r) => B("Note", v(r, "LineNote")));
      const acs = [];
      // every allowance and charge row is written as a line AllowanceCharge, as sent: none is dropped or moved into the price
      rows.forEach((r) => {
        if (["LineAllowanceReasonCode", "LineAllowanceReason", "LineAllowancePercentage", "LineAllowanceAmount", "LineAllowanceBaseAmount"].some((k) => has(r, k))) {
          acs.push(C("AllowanceCharge", [B("ChargeIndicator", "false"), B("AllowanceChargeReasonCode", v(r, "LineAllowanceReasonCode")), B("AllowanceChargeReason", v(r, "LineAllowanceReason")),
            B("MultiplierFactorNumeric", v(r, "LineAllowancePercentage")), M("Amount", v(r, "LineAllowanceAmount")), M("BaseAmount", v(r, "LineAllowanceBaseAmount"))]));
        }
        if (["LineChargeReasonCode", "LineChargeReason", "LineChargePercentage", "LineChargeAmount", "LineChargeBaseAmount"].some((k) => has(r, k))) {
          acs.push(C("AllowanceCharge", [B("ChargeIndicator", "true"), B("AllowanceChargeReasonCode", v(r, "LineChargeReasonCode")), B("AllowanceChargeReason", v(r, "LineChargeReason")),
            B("MultiplierFactorNumeric", v(r, "LineChargePercentage")), M("Amount", v(r, "LineChargeAmount")), M("BaseAmount", v(r, "LineChargeBaseAmount"))]));
        }
      });
      const classes = rows.filter((r) => has(r, "LineItemClassification")).map((r) =>
        C("CommodityClassification", [B("ItemClassificationCode", v(r, "LineItemClassification"), { listID: v(r, "LineItemClassification_Scheme"), listVersionID: v(r, "LineItemClassification_VersionID") })]));
      const props = rows.filter((r) => has(r, "LineItemAttributeName") || has(r, "LineItemAttributeValue")).map((r) =>
        C("AdditionalItemProperty", [B("Name", v(r, "LineItemAttributeName")), B("Value", v(r, "LineItemAttributeValue"))]));
      const hasVat = has(L, "LineVATCategory");
      if (hasVat) assume("Line VAT category: the tax scheme (VAT) is written as a constant, the request has no field for it.");
      if (has(L, "LinePurchaseOrderReference")) assume("LinePurchaseOrderReference is the purchase order line reference (BT-132): it goes to OrderLineReference/LineID.");
      if (has(L, "BuyerOrderID")) assume("BuyerOrderID is the order the line belongs to: it goes to OrderLineReference/OrderReference/ID.");
      if (has(L, "InvoiceLineActualDeliveryDate") || has(L, "InvoiceLineDeliveryLocationID") || has(L, "LineDeliveryCity") || has(L, "InvoiceLineDeliveryPlaceName")) assume("Line delivery fields go to the line's Delivery group.");
      const lineDelivery = C("Delivery", [B("ActualDeliveryDate", v(L, "InvoiceLineActualDeliveryDate")),
        C("DeliveryLocation", [B("ID", v(L, "InvoiceLineDeliveryLocationID"), { schemeID: v(L, "InvoiceLineDeliveryLocation_Scheme") }), B("Name", v(L, "InvoiceLineDeliveryPlaceName")), address(L, "LineDelivery")])]);
      return C(lineTag, [
        B("ID", v(L, "InvoiceLineID")), ...lineNotes,
        B(qtyTag, v(L, "LineQuantity"), { unitCode: v(L, "LineUOMCode") }), M("LineExtensionAmount", v(L, "LineNetAmount")),
        B("AccountingCost", v(L, "LineBuyerAccountingReference")),
        C("InvoicePeriod", [B("StartDate", v(L, "LineStartDate")), B("EndDate", v(L, "LineEndDate")), B("DescriptionCode", v(L, "VATDueDateCode"))]),
        C("OrderLineReference", [B("LineID", v(L, "LinePurchaseOrderReference")), C("OrderReference", [B("ID", v(L, "BuyerOrderID"))])]),
        has(L, "InvoiceLineObjectID") ? C("DocumentReference", [B("ID", v(L, "InvoiceLineObjectID"), { schemeID: v(L, "InvoiceLineObjectID_Scheme") }), B("DocumentTypeCode", "130")]) : "",
        lineDelivery,
        ...acs,
        C("Item", [
          B("Description", v(L, "ItemDescription")), B("Name", v(L, "ItemName")),
          C("BuyersItemIdentification", [B("ID", v(L, "LineItemBuyerIdentifier"))]), C("SellersItemIdentification", [B("ID", v(L, "LineItemSellerIdentifier"))]),
          C("StandardItemIdentification", [B("ID", v(L, "LineItemStandardIdentifier"), { schemeID: v(L, "LineItemStandardIdentifier_Scheme") })]),
          C("OriginCountry", [B("IdentificationCode", v(L, "LineItemOriginCountry"))]),
          ...classes,
          hasVat ? C("ClassifiedTaxCategory", [B("ID", v(L, "LineVATCategory")), B("Percent", v(L, "LineVATRate")), B("TaxExemptionReasonCode", v(L, "LineVATExemptionReasonCode")), B("TaxExemptionReason", v(L, "LineVATExemptionReason")), C("TaxScheme", [B("ID", "VAT")])]) : "",
          ...props
        ]),
        C("Price", [M("PriceAmount", v(L, "LineItemNetPrice")), B("BaseQuantity", v(L, "LineItemBaseQuantity"), { unitCode: v(L, "LineItemUoM") }),
          priceAllowance(L, rows)])
      ]);
    });

    // ---------- payment ----------
    const payment = C("PaymentMeans", [
      B("PaymentMeansCode", v(inv, "PaymentMeansCode"), { name: v(inv, "PaymentMeansText") }),
      credit ? B("PaymentDueDate", v(inv, "DueDate")) : "",
      B("PaymentID", v(inv, "PaymentID")),
      C("CardAccount", [B("PrimaryAccountNumberID", v(inv, "CardPaymentAccountID")), B("HolderName", v(inv, "CardPaymentAccountName"))]),
      C("PayeeFinancialAccount", [B("ID", v(inv, "BankAccountID")), B("Name", v(inv, "PaymentAccountName")), C("FinancialInstitutionBranch", [B("ID", v(inv, "PaymentServiceProviderID"))])]),
      C("PaymentMandate", [B("ID", v(inv, "DirectDebitID")), C("PayerFinancialAccount", [B("ID", v(inv, "DirectDebitAccount"))])])
    ]);
    if (credit && has(inv, "DueDate")) assume("Credit note: the due date goes to PaymentMeans/PaymentDueDate (a UBL credit note has no document-level due date).");

    // ---------- header ----------
    const body = [
      B("CustomizationID", v(inv, "ProfileType")), B("ProfileID", v(inv, "BusinessProcessType")), B("ID", v(inv, "InvoiceNumber")), B("IssueDate", v(inv, "InvoiceDate")),
      credit ? "" : B("DueDate", v(inv, "DueDate")), B(credit ? "CreditNoteTypeCode" : "InvoiceTypeCode", typeCode),
      ...notes, B("TaxPointDate", v(inv, "VATPointDate")), B("DocumentCurrencyCode", cur), B("TaxCurrencyCode", taxCur),
      B("AccountingCost", v(inv, "BuyerAccountingReference")), B("BuyerReference", v(inv, "BuyerReference")),
      C("InvoicePeriod", [B("StartDate", v(inv, "InvoiceStartDate")), B("EndDate", v(inv, "InvoiceEndDate")), B("DescriptionCode", v(inv, "VATPointCode"))]),
      C("OrderReference", [B("ID", v(inv, "PurchaseOrderReference")), B("SalesOrderID", v(inv, "SalesOrderReference"))]),
      ...billing,
      C("DespatchDocumentReference", [B("ID", v(inv, "ShippingReference"))]), C("ReceiptDocumentReference", [B("ID", v(inv, "ReceptionReference"))]),
      C("ContractDocumentReference", [B("ID", v(inv, "ContractReference")), B("DocumentTypeCode", v(inv, "ContractType"))]),
      ...docs,
      C("ProjectReference", [B("ID", v(inv, "ProjectReference"))]),
      sellerXml, buyerXml, payeeXml, taxRepXml,
      C("Delivery", [B("ActualDeliveryDate", v(inv, "DeliveryDateEffective")),
        C("DeliveryLocation", [B("ID", v(inv, "DeliveryLocationID"), { schemeID: v(inv, "DeliveryLocation_Scheme") }), B("Name", v(inv, "NameDeliveryLocation")),
          C("Address", [B("StreetName", v(inv, "DeliveryAddress1")), B("AdditionalStreetName", v(inv, "DeliveryAddress2")), B("CityName", v(inv, "DeliveryCity")),
            B("PostalZone", v(inv, "DeliveryPostcode")), B("CountrySubentity", v(inv, "DeliverySubdivision")), C("AddressLine", [B("Line", v(inv, "DeliveryAddress3"))]),
            C("Country", [B("IdentificationCode", v(inv, "DeliveryCountry"))])])]),
        C("DeliveryParty", [C("PartyName", [B("Name", v(inv, "DeliveryPartyName"))])])]),
      payment, ...terms, ...docAc,
      C("TaxTotal", [M("TaxAmount", v(inv, "DocumentTotalTaxAmount")), ...subtotals]),
      has(inv, "DocumentTotalTaxAmount_TaxCurrency") ? C("TaxTotal", [M("TaxAmount", v(inv, "DocumentTotalTaxAmount_TaxCurrency"), taxCur)]) : "",
      C("LegalMonetaryTotal", [M("LineExtensionAmount", v(inv, "DocumentNetAmount")), M("TaxExclusiveAmount", v(inv, "DocumentTotalWithoutVAT")), M("TaxInclusiveAmount", v(inv, "DocumentTotalWithVAT")),
        M("AllowanceTotalAmount", v(inv, "DocumentTotalAllowance")), M("ChargeTotalAmount", v(inv, "DocumentTotalCharge")), M("PrepaidAmount", v(inv, "DocumentPaidAmount")),
        M("PayableRoundingAmount", v(inv, "DocumentRoundingAmount")), M("PayableAmount", v(inv, "DocumentDueAmount"))]),
      ...lines
    ].filter(Boolean);

    if (has(inv, "ContractType")) assume("ContractType goes to ContractDocumentReference/DocumentTypeCode.");
    if (credit) assume("Invoice type " + typeCode + " is a credit note, so the document is a UBL CreditNote.");
    assume("Header note: subject code and text are written as #CODE#text.");

    const root = credit ? "CreditNote" : "Invoice";
    const raw = '<?xml version="1.0" encoding="UTF-8"?><' + root + ' xmlns="' + (credit ? NS_CREDIT : NS_INVOICE) + '" xmlns:cac="' + NS_CAC + '" xmlns:cbc="' + NS_CBC + '">' +
      body.join("") + "</" + root + ">";

    // fields with a value that nothing above read
    const notMapped = [];
    const walk = (o, path) => {
      if (Array.isArray(o)) { o.forEach((x, i) => walk(x, path + "[" + (i + 1) + "]")); return; }
      if (!o || typeof o !== "object") return;
      const seen = used.get(o) || new Set();
      Object.keys(o).forEach((k) => {
        const x = o[k];
        if (k.startsWith("__")) return;
        if (x && typeof x === "object") walk(x, path ? path + "." + k : k);
        else if (x !== "" && x !== null && x !== undefined && !seen.has(k)) {
          const why = reasonFor.get(o), own = (reasonOf.get(o) || {})[k];
          notMapped.push({ path: path ? path + "." + k : k, value: String(x), reason: own || (why && /^Line(Allowance|Charge)/.test(k) ? why : "") });
        }
      });
    };
    walk(inv, "");

    const traced = FieldTrace.extract(raw);
    return { xml: pretty(traced.xml), kind: root, notMapped, assumptions, total: list.length, trace: traced.trace };
  }

  window.RequestToUbl = { convert };
})();
