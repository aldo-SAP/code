(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  // ---------- Code lists ----------
  const DOC_TYPES = {
    "71": "Request for payment", "80": "Debit note related to goods or services", "82": "Metered services invoice",
    "84": "Debit note related to financial adjustments", "261": "Self-billed credit note", "262": "Consolidated credit note",
    "296": "Credit note for price variation", "308": "Delcredere credit note", "325": "Proforma invoice", "326": "Partial invoice",
    "380": "Commercial invoice", "381": "Credit note", "383": "Debit note", "384": "Corrected invoice", "385": "Consolidated invoice",
    "386": "Prepayment invoice", "387": "Hire invoice", "388": "Tax invoice", "389": "Self-billed invoice", "390": "Delcredere invoice",
    "393": "Factored invoice", "394": "Lease invoice", "395": "Consignment invoice", "396": "Factored credit note",
    "527": "Self-billed debit note", "532": "Forwarder's credit note", "575": "Insurer's invoice", "623": "Forwarder's invoice",
    "633": "Port charges document", "751": "Invoice information for accounting purposes", "780": "Freight invoice",
    "870": "Consular invoice", "875": "Partial construction invoice", "876": "Partial final construction invoice",
    "877": "Final construction invoice", "935": "Customs invoice"
  };
  const PAY_MEANS = {
    "1": "Instrument not defined", "10": "In cash", "20": "Cheque", "30": "Credit transfer", "31": "Debit transfer",
    "42": "Payment to bank account", "48": "Bank card", "49": "Direct debit", "54": "Credit card", "55": "Debit card",
    "57": "Standing agreement", "58": "SEPA credit transfer", "59": "SEPA direct debit", "68": "Online payment service",
    "97": "Clearing between partners", "ZZZ": "Mutually defined"
  };
  const VAT_CAT = {
    S: "Standard rate", Z: "Zero rated", E: "Exempt from tax", AE: "VAT reverse charge",
    K: "Intra-community supply (VAT exempt)", G: "Export outside the EU (tax not charged)",
    O: "Outside the scope of VAT", L: "Canary Islands (IGIC)", M: "Ceuta and Melilla (IPSI)", B: "Transferred VAT (Italy)"
  };
  const DATE_CODE = { "3": "Invoice issue date", "35": "Actual delivery date", "432": "Paid to date" };
  const AC_REASON = {
    "41": "Bonus for works ahead of schedule", "42": "Other bonus", "60": "Manufacturer's consumer discount",
    "62": "Due to military status", "63": "Due to work accident", "64": "Special agreement", "65": "Production error discount",
    "66": "New outlet discount", "67": "Sample discount", "68": "End-of-range discount", "70": "Incoterm discount",
    "71": "Point of sales threshold allowance", "88": "Material surcharge/deduction", "95": "Discount", "100": "Special rebate",
    "102": "Fixed long term", "103": "Temporary", "104": "Standard", "105": "Yearly turnover",
    AA: "Advertising", ABL: "Additional packaging", ADR: "Other services", FC: "Freight service", FI: "Financing",
    LA: "Labelling", PC: "Packing", ZZZ: "Mutually defined"
  };
  const NOTE_SUBJECT = {
    AAI: "General information", AAB: "Terms of payments", PMT: "Payment information", PMD: "Payment detail / remittance information",
    SUR: "Supplier remarks", REG: "Regulatory information", ABL: "Government information", TXD: "Tax declaration",
    CUS: "Customs declaration information", AAK: "Price conditions"
  };
  const SCHEMES = {
    "0002": "SIREN", "0007": "SE organisation number", "0009": "SIRET", "0037": "FI LY-tunnus", "0060": "DUNS",
    "0088": "GLN", "0096": "DK P-number", "0106": "NL KvK", "0130": "EU Commission directorates", "0151": "AU ABN",
    "0183": "CH UID", "0184": "DK CVR", "0188": "JP Corporate number", "0190": "NL OIN", "0191": "EE company code",
    "0192": "NO organisation number", "0195": "SG UEN", "0196": "IS kennitala", "0199": "LEI", "0200": "LT legal entity code",
    "0201": "IT iPA code", "0204": "DE Leitweg-ID", "0208": "BE enterprise number", "0209": "GS1 key", "0210": "IT codice fiscale",
    "0211": "IT partita IVA", "0212": "FI organisation ID", "0213": "FI VAT", "0221": "JP invoice issuer number",
    "0224": "FR CTC routing code", "0225": "FR CTC electronic address",
    "9906": "IT VAT", "9907": "IT codice fiscale", "9920": "ES VAT", "9925": "BE VAT", "9930": "DE VAT", "9938": "LU VAT",
    "9944": "NL VAT", "9957": "FR VAT", "9959": "US EIN", "EM": "Email", SEPA: "SEPA creditor ID"
  };
  const UNITS = {
    C62: "one", H87: "piece", EA: "each", XUN: "unit", XPP: "piece", HUR: "hour", DAY: "day", WEE: "week", MON: "month",
    ANN: "year", MIN: "minute", KGM: "kilogram", GRM: "gram", TNE: "tonne", MTR: "metre", KMT: "kilometre", MTK: "square metre",
    MTQ: "cubic metre", LTR: "litre", KWH: "kilowatt hour", SET: "set", PR: "pair", LS: "lump sum", E48: "service unit", ZZ: "mutually defined"
  };
  // Country and currency names in the chosen language.
  let regionNames = null, currencyNames = null;
  function setDisplayNames() {
    try { regionNames = new Intl.DisplayNames([I18N.lang], { type: "region" }); } catch (e) {}
    try { currencyNames = new Intl.DisplayNames([I18N.lang], { type: "currency" }); } catch (e) {}
  }
  setDisplayNames();

  // ---------- Field specs: [path, label, bt (string or {role: bt}), options] ----------
  const DOC_SPEC = [
    ["ID", "Document number", "BT-1"],
    ["IssueDate", "Issue date", "BT-2"],
    ["IssueTime", "Issue time"],
    ["InvoiceTypeCode", "Invoice type code", "BT-3", { only: "Invoice" }],
    ["CreditNoteTypeCode", "Credit note type code", "BT-3", { only: "CreditNote" }],
    ["DueDate", "Payment due date", "BT-9"],
    ["TaxPointDate", "VAT point date", "BT-7"],
    ["DocumentCurrencyCode", "Invoice currency", "BT-5"],
    ["TaxCurrencyCode", "VAT accounting currency", "BT-6"],
    ["BuyerReference", "Buyer reference", "BT-10"],
    ["AccountingCost", "Buyer accounting reference", "BT-19"],
    ["ProfileID", "Business process type", "BT-23"],
    ["CustomizationID", "Specification identifier", "BT-24"],
    ["UBLVersionID", "UBL version"]
  ];
  const DOC_CLAIMS = ["ID", "IssueDate", "IssueTime", "InvoiceTypeCode", "CreditNoteTypeCode", "DueDate", "TaxPointDate",
    "DocumentCurrencyCode", "TaxCurrencyCode", "BuyerReference", "AccountingCost", "Note", "ProfileID", "CustomizationID", "UBLVersionID"];

  const REF_SPEC = [
    ["ProjectReference/ID", "Project reference", "BT-11"],
    ["ContractDocumentReference/ID", "Contract reference", "BT-12"],
    ["OrderReference/ID", "Purchase order reference", "BT-13"],
    ["OrderReference/SalesOrderID", "Sales order reference", "BT-14"],
    ["ReceiptDocumentReference/ID", "Receiving advice reference", "BT-15"],
    ["DespatchDocumentReference/ID", "Despatch advice reference", "BT-16"],
    ["OriginatorDocumentReference/ID", "Tender or lot reference", "BT-17"],
    ["InvoicePeriod/StartDate", "Invoicing period start", "BT-73"],
    ["InvoicePeriod/EndDate", "Invoicing period end", "BT-74"],
    ["InvoicePeriod/DescriptionCode", "VAT point date code", "BT-8"]
  ];
  const REF_CLAIMS = ["ProjectReference", "ContractDocumentReference", "OrderReference", "ReceiptDocumentReference",
    "DespatchDocumentReference", "OriginatorDocumentReference", "InvoicePeriod", "BillingReference"];

  const ADR_SPEC = [
    ["ID", "Document identifier", { N: "BT-122", O: "BT-18" }],
    ["DocumentTypeCode", "Document type code"],
    ["DocumentDescription", "Description", "BT-123"],
    ["Attachment/ExternalReference/URI", "External document location", "BT-124"],
    ["Attachment/EmbeddedDocumentBinaryObject", "Attached document", "BT-125"]
  ];

  // Party fields; BT numbers by role: S seller, B buyer, P payee, T tax representative.
  const PARTY_SPEC = [
    ["PartyLegalEntity/RegistrationName", "Legal name", { S: "BT-27", B: "BT-44" }],
    ["PartyName/Name", "Trading name", { S: "BT-28", B: "BT-45", P: "BT-59", T: "BT-62" }],
    ["PartyIdentification/ID", "Party identifier", { S: "BT-29", B: "BT-46", P: "BT-60" }],
    ["PartyLegalEntity/CompanyID", "Legal registration identifier", { S: "BT-30", B: "BT-47", P: "BT-61" }],
    ["PartyTaxScheme/CompanyID", "VAT / tax registration identifier", { S: "BT-31 / BT-32", B: "BT-48", T: "BT-63" }],
    ["PartyTaxScheme/TaxScheme/ID", "Tax scheme"],
    ["PartyLegalEntity/CompanyLegalForm", "Additional legal information", { S: "BT-33" }],
    ["EndpointID", "Electronic address", { S: "BT-34", B: "BT-49" }],
    ["PostalAddress/StreetName", "Address line 1", { S: "BT-35", B: "BT-50", T: "BT-64" }],
    ["PostalAddress/AdditionalStreetName", "Address line 2", { S: "BT-36", B: "BT-51", T: "BT-65" }],
    ["PostalAddress/AddressLine/Line", "Address line 3", { S: "BT-162", B: "BT-163", T: "BT-164" }],
    ["PostalAddress/CityName", "City", { S: "BT-37", B: "BT-52", T: "BT-66" }],
    ["PostalAddress/PostalZone", "Post code", { S: "BT-38", B: "BT-53", T: "BT-67" }],
    ["PostalAddress/CountrySubentity", "Country subdivision", { S: "BT-39", B: "BT-54", T: "BT-68" }],
    ["PostalAddress/Country/IdentificationCode", "Country", { S: "BT-40", B: "BT-55", T: "BT-69" }],
    ["Contact/Name", "Contact point", { S: "BT-41", B: "BT-56" }],
    ["Contact/Telephone", "Contact telephone", { S: "BT-42", B: "BT-57" }],
    ["Contact/ElectronicMail", "Contact email", { S: "BT-43", B: "BT-58" }]
  ];
  // Which party fields exist in EN 16931 for each role (used for "show empty fields").
  const PARTY_ROLE_FIELDS = (role) => PARTY_SPEC.filter((f) => !f[2] || typeof f[2] === "string" || f[2][role]);

  const DELIVERY_SPEC = [
    ["DeliveryParty/PartyName/Name", "Deliver to party name", "BT-70"],
    ["DeliveryLocation/ID", "Deliver to location identifier", "BT-71"],
    ["ActualDeliveryDate", "Actual delivery date", "BT-72"],
    ["DeliveryLocation/Address/StreetName", "Deliver to address line 1", "BT-75"],
    ["DeliveryLocation/Address/AdditionalStreetName", "Deliver to address line 2", "BT-76"],
    ["DeliveryLocation/Address/AddressLine/Line", "Deliver to address line 3", "BT-165"],
    ["DeliveryLocation/Address/CityName", "Deliver to city", "BT-77"],
    ["DeliveryLocation/Address/PostalZone", "Deliver to post code", "BT-78"],
    ["DeliveryLocation/Address/CountrySubentity", "Deliver to country subdivision", "BT-79"],
    ["DeliveryLocation/Address/Country/IdentificationCode", "Deliver to country", "BT-80"]
  ];

  const PAYMEANS_SPEC = [
    ["PaymentMeansCode", "Payment means type", "BT-81 / BT-82"],
    ["PaymentID", "Remittance information", "BT-83"],
    ["PaymentDueDate", "Payment due date"],
    ["PayeeFinancialAccount/ID", "Payment account (IBAN)", "BT-84"],
    ["PayeeFinancialAccount/Name", "Payment account name", "BT-85"],
    ["PayeeFinancialAccount/FinancialInstitutionBranch/ID", "Payment service provider (BIC)", "BT-86"],
    ["CardAccount/PrimaryAccountNumberID", "Card number (last digits)", "BT-87"],
    ["CardAccount/NetworkID", "Card network"],
    ["CardAccount/HolderName", "Card holder name", "BT-88"],
    ["PaymentMandate/ID", "Mandate reference", "BT-89"],
    ["PaymentMandate/PayerFinancialAccount/ID", "Debited account", "BT-91"]
  ];
  const PAYTERMS_SPEC = [
    ["Note", "Payment terms", "BT-20"],
    ["PaymentDueDate", "Payment due date"],
    ["Amount", "Amount"]
  ];

  const AC_SPEC = [
    ["ChargeIndicator", "Type"],
    ["AllowanceChargeReasonCode", "Reason code", { A: "BT-98", C: "BT-105" }],
    ["AllowanceChargeReason", "Reason", { A: "BT-97", C: "BT-104" }],
    ["MultiplierFactorNumeric", "Percentage", { A: "BT-94", C: "BT-101" }],
    ["Amount", "Amount", { A: "BT-92", C: "BT-99" }],
    ["BaseAmount", "Base amount", { A: "BT-93", C: "BT-100" }],
    ["TaxCategory/ID", "VAT category", { A: "BT-95", C: "BT-102" }],
    ["TaxCategory/Percent", "VAT rate", { A: "BT-96", C: "BT-103" }],
    ["TaxCategory/TaxScheme/ID", "Tax scheme"]
  ];
  const LINE_AC_SPEC = [
    ["ChargeIndicator", "Type"],
    ["AllowanceChargeReasonCode", "Reason code", { A: "BT-140", C: "BT-145" }],
    ["AllowanceChargeReason", "Reason", { A: "BT-139", C: "BT-144" }],
    ["MultiplierFactorNumeric", "Percentage", { A: "BT-138", C: "BT-143" }],
    ["Amount", "Amount", { A: "BT-136", C: "BT-141" }],
    ["BaseAmount", "Base amount", { A: "BT-137", C: "BT-142" }]
  ];

  const TOTAL_SPEC = [
    ["LineExtensionAmount", "Sum of line net amounts", "BT-106"],
    ["AllowanceTotalAmount", "Sum of allowances", "BT-107"],
    ["ChargeTotalAmount", "Sum of charges", "BT-108"],
    ["TaxExclusiveAmount", "Total without VAT", "BT-109"],
    ["TaxInclusiveAmount", "Total with VAT", "BT-112"],
    ["PrepaidAmount", "Paid amount", "BT-113"],
    ["PayableRoundingAmount", "Rounding amount", "BT-114"],
    ["PayableAmount", "Amount due for payment", "BT-115"]
  ];

  const LINE_SPEC = [
    ["ID", "Line identifier", "BT-126"],
    ["Note", "Line note", "BT-127"],
    ["DocumentReference/ID", "Invoiced object identifier", "BT-128"],
    ["InvoicedQuantity", "Invoiced quantity", "BT-129 / BT-130", { only: "Invoice" }],
    ["CreditedQuantity", "Credited quantity", "BT-129 / BT-130", { only: "CreditNote" }],
    ["LineExtensionAmount", "Line net amount", "BT-131"],
    ["OrderLineReference/LineID", "Referenced purchase order line", "BT-132"],
    ["OrderLineReference/OrderReference/ID", "Purchase order (line level)"],
    ["AccountingCost", "Buyer accounting reference", "BT-133"],
    ["InvoicePeriod/StartDate", "Line period start", "BT-134"],
    ["InvoicePeriod/EndDate", "Line period end", "BT-135"],
    ["Price/PriceAmount", "Item net price", "BT-146"],
    ["Price/AllowanceCharge/Amount", "Item price discount", "BT-147"],
    ["Price/AllowanceCharge/BaseAmount", "Item gross price", "BT-148"],
    ["Price/AllowanceCharge/ChargeIndicator", "Price discount indicator"],
    ["Price/BaseQuantity", "Item price base quantity", "BT-149 / BT-150"],
    ["Item/ClassifiedTaxCategory/ID", "VAT category", "BT-151"],
    ["Item/ClassifiedTaxCategory/Percent", "VAT rate", "BT-152"],
    ["Item/ClassifiedTaxCategory/TaxScheme/ID", "Tax scheme"],
    ["Item/Name", "Item name", "BT-153"],
    ["Item/Description", "Item description", "BT-154"],
    ["Item/SellersItemIdentification/ID", "Seller's item identifier", "BT-155"],
    ["Item/BuyersItemIdentification/ID", "Buyer's item identifier", "BT-156"],
    ["Item/StandardItemIdentification/ID", "Item standard identifier", "BT-157"],
    ["Item/CommodityClassification/ItemClassificationCode", "Item classification", "BT-158"],
    ["Item/OriginCountry/IdentificationCode", "Item country of origin", "BT-159"],
    ["Item/AdditionalItemProperty", "Item attribute", "BT-160 / BT-161", { fmt: itemProperty }]
  ];

  // Fields EN 16931 requires (cardinality 1..1 in their group): shown even when empty fields are hidden.
  const REQUIRED = new Set(("BT-1 BT-2 BT-3 BT-5 BT-24 BT-27 BT-40 BT-44 BT-55 BT-106 BT-109 BT-112 BT-115 " +
    "BT-126 BT-129 BT-130 BT-131 BT-146 BT-151 BT-153").split(" "));

  // ---------- State ----------
  const state = { root: null, kind: null, name: "", size: 0, wrapped: "", showEmpty: false, showTags: false, raw: false, foldPassing: false, openCards: new Set(), closedCards: new Set(), flaggedRules: new Set(), secFlag: {}, atts: [], attIndex: new Map(), cache: new Map() };
  try { state.showEmpty = localStorage.getItem("edocxml.showEmpty") === "1"; state.showTags = localStorage.getItem("edocxml.showTags") === "1"; state.raw = localStorage.getItem("edocxml.raw") === "1"; state.foldPassing = localStorage.getItem("edocxml.foldPassing") === "1"; } catch (e) {}

  // ---------- Helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  function humanize(name) {
    const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(" ");
    return words.map((w, i) => (i && !/^[A-Z0-9]+$/.test(w) ? w.toLowerCase() : w)).join(" ");
  }
  function formatSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }
  function num(raw) { const n = Number(String(raw).trim()); return isFinite(n) && String(raw).trim() !== "" ? n : null; }
  function fmtAmount(raw, cur) {
    const n = num(raw);
    if (n === null || state.raw) return (state.raw && n !== null ? '<span class="amt">' + esc(raw) + "</span>" : esc(raw)) + (cur ? ' <span class="unit">' + esc(cur) + "</span>" : "");
    const dec = (String(raw).split(".")[1] || "").length;
    const s = n.toLocaleString(I18N.locale(), { minimumFractionDigits: Math.max(2, Math.min(dec, 6)), maximumFractionDigits: Math.max(2, Math.min(dec, 6)) });
    return '<span class="amt" title="' + esc(raw) + '">' + s + "</span>" + (cur ? ' <span class="unit">' + esc(cur) + "</span>" : "");
  }
  const dec = (code, table) => (table[code] ? ' <span class="dec">· ' + esc(T(table[code])) + "</span>" : "");

  function decodeValue(el, raw) {
    const n = el.localName, p = el.parentElement ? el.parentElement.localName : "";
    if (n === "InvoiceTypeCode" || n === "CreditNoteTypeCode" || (n === "DocumentTypeCode" && DOC_TYPES[raw])) return dec(raw, DOC_TYPES);
    if (n === "PaymentMeansCode") return dec(raw, PAY_MEANS);
    if (n === "ID" && (p === "TaxCategory" || p === "ClassifiedTaxCategory")) return dec(raw, VAT_CAT);
    if (n === "DescriptionCode") return dec(raw, DATE_CODE);
    if (n === "AllowanceChargeReasonCode") return dec(raw, AC_REASON);
    if (n === "IdentificationCode" && p.endsWith("Country") && regionNames) {
      try { const r = regionNames.of(raw.toUpperCase()); if (r && r !== raw.toUpperCase()) return ' <span class="dec">· ' + esc(r) + "</span>"; } catch (e) {}
    }
    if (/CurrencyCode$/.test(n) && currencyNames) {
      try { const c = currencyNames.of(raw.toUpperCase()); if (c && c !== raw.toUpperCase()) return ' <span class="dec">· ' + esc(c) + "</span>"; } catch (e) {}
    }
    return "";
  }

  // Render one leaf element's value, including decoded codes and attribute chips.
  function renderValue(el) {
    const n = el.localName;
    if (n === "EmbeddedDocumentBinaryObject") {
      const i = state.attIndex.get(el);
      const a = state.atts[i];
      return '<a href="#att-' + i + '">' + esc(a.filename) + "</a>" +
        '<span class="chip">' + esc(a.mime || T("unknown type")) + " · " + formatSize(a.size) + "</span> " +
        '<button class="mini" type="button" data-act="preview" data-att="' + i + '">' + T("Preview") + "</button>";
    }
    if (el.children.length) return '<span class="dec">' + T("(group)") + "</span>";
    const raw = txt(el);
    const attrs = Array.from(el.attributes).filter((a) => !/^xmlns/.test(a.name));
    const cur = el.getAttribute("currencyID");
    let html;
    if (cur) html = fmtAmount(raw, cur);
    else if (n === "ChargeIndicator") html = raw === "true" ? T("Charge") : raw === "false" ? T("Allowance") : esc(raw);
    else if ((n === "Percent" || n === "MultiplierFactorNumeric") && num(raw) !== null) html = '<span class="amt">' + esc(raw) + "</span> %";
    else if (n === "Note" && /^#([A-Z0-9]{2,4})#/.test(raw)) {
      const m = raw.match(/^#([A-Z0-9]{2,4})#/);
      html = '<span class="chip" style="margin-left:0" title="' + esc(T("Subject code (BT-21)")) + '">' + esc(m[1]) + (NOTE_SUBJECT[m[1]] ? " · " + esc(T(NOTE_SUBJECT[m[1]])) : "") + "</span> " + esc(raw.slice(m[0].length));
    } else if (n === "URI" && /^https?:\/\//i.test(raw)) html = '<a href="' + esc(raw) + '" target="_blank" rel="noopener noreferrer">' + esc(raw) + "</a>";
    else if (/Date$/.test(n) && /^\d{4}-\d{2}-\d{2}$/.test(raw)) html = fmtDate(raw);   // readable, or as written with "Exact values"
    else html = raw === "" ? '<span class="dec">' + T("(empty)") + "</span>" : esc(raw) + decodeValue(el, raw);

    for (const a of attrs) {
      if (a.name === "currencyID") continue;
      if (a.name === "unitCode") { html += ' <span class="unit" title="' + esc(T("Unit of measure")) + '">' + esc(a.value) + (UNITS[a.value] ? " · " + esc(T(UNITS[a.value])) : "") + "</span>"; continue; }
      if (a.name === "name" && n === "PaymentMeansCode") { html += '<span class="chip" title="' + esc(T("Payment means text (BT-82)")) + '">' + esc(a.value) + "</span>"; continue; }
      let label = a.value;
      if (a.name === "schemeID" && SCHEMES[a.value]) label += " · " + T(SCHEMES[a.value]);
      html += '<span class="chip" title="' + esc(a.name) + '">' + esc(a.name) + ": " + esc(label) + "</span>";
    }
    return html;
  }

  function btFor(bt, role) {
    if (!bt) return "";
    if (typeof bt === "string") return bt;
    return (role && bt[role]) || Object.values(bt).filter((v, i, arr) => arr.indexOf(v) === i).join(" / ");
  }
  // The element's XML path below the document root, with its prefixes (cac:AccountingSupplierParty/cac:Party/cbc:EndpointID).
  function tagPath(el) {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== state.root; e = e.parentElement) parts.unshift(e.nodeName);
    return parts.join("/");
  }
  // Path of a field that is missing: UBL puts groups in cac: and values in cbc:.
  function guessTag(ctx, path) {
    const segs = path.split("/");
    return [ctx ? tagPath(ctx) : ""].concat(segs.map((s, i) => (i < segs.length - 1 ? "cac:" : "cbc:") + s)).filter(Boolean).join("/");
  }
  // Shown under a label when "Show XML tags" is on.
  // A label with its BT number kept on the same line; the number sits at the right end when there is room.
  const btCell = (labelHtml, bt) => '<span class="thc"><span class="thl">' + labelHtml + "</span>" + (bt ? '<span class="bt">' + bt + "</span>" : "") + "</span>";
  const xtag = (tag) => (tag ? '<code class="xtag">' + esc(tag) + "</code>" : "");
  const bts = (bt) => (bt ? bt.split("/").map((b) => b.trim()).filter(Boolean) : []);
  // Failed checks that point at a field: at its element, or naming its BT number for this part of the document
  // (ctx), so a failure on line 2 does not mark the same BT on the other lines. Returns { lvl, ids } or null.
  function fieldFlag(ctx, bt, els) {
    const own = bts(bt);
    const hits = (state.failed || []).filter((f) => els.some((e) => f.at.includes(e)) ||
      (own.some((b) => f.bts.has(b)) && (!ctx || f.at.some((a) => a === ctx || a.contains(ctx) || ctx.contains(a)))));
    if (!hits.length) return null;
    return { lvl: hits.some((f) => !f.c.warn) ? "bad" : "warn", ids: hits.map((f) => f.c.id).filter((id, i, a) => a.indexOf(id) === i),
      msgs: hits.map((f) => I18N.tr(f.c.text)).filter((m, i, a) => a.indexOf(m) === i).slice(0, 2) };
  }
  // A required field that is missing counts as an error even when no rule set names it.
  const requiredFlag = (ctx, bt) => (ctx && bts(bt).some((b) => REQUIRED.has(b)) ? { lvl: "bad", ids: [] } : null);
  // A group that is missing altogether still shows when a failed check names one of its fields.
  const specFlagged = (spec, role) => spec.some((f) => fieldFlag(null, btFor(f[2], role), []));
  const dataRules = (flag) => (flag && flag.ids && flag.ids.length ? ' data-rules="' + esc(flag.ids.join(" ")) + '"' : "");
  // the short reason under a flagged field, so the failure is read where the field is
  const whyHtml = (flag) => (flag ? '<div class="why">' + (flag.msgs && flag.msgs.length ? flag.msgs.map(esc).join("<br>") : esc(T("Required field"))) + "</div>" : "");
  const flagTitle = (flag) => (flag.ids.length ? T("Fails {ids}", { ids: flag.ids.join(", ") }) : T("Required field"));
  const missing = () => '<span class="missing">' + T("Missing") + "</span>";
  // several BT numbers (BT-81 / BT-82) go one under the other, so the label keeps its width
  const btHtml = (bt) => { const parts = String(bt).split(" / "); const spans = parts.map((b) => '<span class="bt">' + esc(b) + "</span>").join(""); return parts.length > 1 ? '<span class="bts">' + spans + "</span>" : spans; };
  function row(label, bt, valueHtml, cls, tag, flag) {
    if (flag) cls = (cls ? cls + " " : "") + "flag-" + flag.lvl;
    return '<div class="row' + (cls ? " " + cls : "") + '"' + (flag ? ' title="' + esc(flagTitle(flag)) + '"' + dataRules(flag) : "") + '><div class="k"><span class="kl">' + esc(T(label)) + "</span>" +
      (bt ? btHtml(bt) : "") + xtag(tag) + '</div><div class="v">' + valueHtml + whyHtml(flag) + "</div></div>";
  }
  function markDeep(el, used) { used.add(el); for (const k of el.querySelectorAll("*")) used.add(k); }

  // Render spec fields for ctx; marks rendered elements in `used`.
  function renderFields(ctx, spec, role, used) {
    let html = "";
    for (const [path, label, bt, opts] of spec) {
      if (opts && opts.only && opts.only !== state.kind) continue;
      const els = byPath(ctx, path), b = btFor(bt, role);
      if (!els.length) {
        // Hidden empty fields still show when a failed check points at them or EN 16931 requires them.
        const flag = fieldFlag(ctx, b, []) || requiredFlag(ctx, b);
        if (state.showEmpty || flag) html += row(label, b, flag ? missing() : "—", "empty", guessTag(ctx, path), flag);
        continue;
      }
      for (const el of els) {
        const flag = fieldFlag(ctx, b, [el]);
        if (opts && opts.fmt) { markDeep(el, used); html += row(label, b, opts.fmt(el), "", tagPath(el), flag); }
        else { used.add(el); html += row(label, b, renderValue(el), "", tagPath(el), flag); }
      }
    }
    return html;
  }
  // Every leaf under the given elements that no spec field picked up.
  function extras(elements, used, withSelf) {
    let html = "";
    const walk = (el, trail) => {
      for (const k of el.children) {
        if (used.has(k)) continue;
        const t = trail.concat(humanize(k.localName));
        if (k.children.length) walk(k, t);
        else html += row(t.join(" › "), "", renderValue(k), "extra", tagPath(k));
      }
    };
    for (const el of elements) {
      if (!el || used.has(el)) continue;
      if (!el.children.length) { if (withSelf) html += row(humanize(el.localName), "", renderValue(el), "extra", tagPath(el)); }
      else walk(el, withSelf ? [humanize(el.localName)] : []);
    }
    return html ? '<div class="extras-h">' + T("More fields") + "</div>" + html : "";
  }
  function itemProperty(el) {
    return "<b>" + esc(val(el, "Name")) + "</b>: " + esc(val(el, "Value")) +
      (first(el, "ValueQuantity") ? " " + renderValue(first(el, "ValueQuantity")) : "");
  }

  // ---------- Sections ----------
  function card(id, title, body, opts) {
    opts = opts || {};
    body = body || "";
    const sec = state.issues.secs[id], hasIssue = !!(sec && (sec.bad.size || sec.warn.size)) || !!state.secFlag[id];
    // Every block opens by default; the arrow folds one by hand, and "Fold passing blocks" folds the ones without a problem
    // (a block you opened yourself stays open, Checks never folds).
    const collapsible = id !== "checks";
    const open = !collapsible || (!state.closedCards.has(id) && (!state.foldPassing || hasIssue || state.openCards.has(id)));
    // Failed rules for this block that no field shows by itself (document-level rules); the rest sit on their field.
    const marked = new Set((body.match(/data-rules="[^"]*"/g) || []).flatMap((m) => m.slice(12, -1).split(" ")));
    if (state.flaggedRules) state.flaggedRules.forEach((r) => marked.add(r));   // a failure already shown on a field anywhere is not listed again
    const iss = id !== "lines" && id !== "checks" && sec;
    const loose = iss ? iss.list.filter((c) => !marked.has(c.id)) : [];
    const errs = loose.length ? '<ul class="checks card-errs">' + loose.map((c) => checkLi(c, false)).join("") + "</ul>" : "";
    const nRows = (body.match(/<div class="row[ "]|<tr class="line /g) || []).length;
    return '<section class="card' + (opts.full ? " full" : "") + (collapsible ? " collapsible" + (open ? "" : " collapsed") : "") + '" id="sec-' + id + '"><h2' +
      (collapsible ? ' tabindex="0" role="button" aria-expanded="' + open + '" data-act="card"' : "") + ">" +
      dot(id) + esc(T(title)) + (opts.count != null ? '<span class="n">' + opts.count + "</span>" : "") +
      (collapsible && nRows ? '<span class="sum">' + T(nRows > 1 ? "{n} fields" : "{n} field", { n: nRows }) + "</span>" : "") +
      (opts.act ? '<span class="act">' + opts.act + "</span>" : "") +
      (collapsible ? '<span class="chev" aria-hidden="true"></span>' : "") +
      '</h2><div class="card-body">' + errs + (body || '<div class="none">' + T("Not present in this document.") + "</div>") + "</div></section>";
  }
  function sub(title, body) { return '<div class="sub"><h3>' + esc(T(title)) + "</h3>" + body + "</div>"; }

  // Document-level allowances or charges: one table, a row per entry and their total underneath.
  function docAcTable(els, role, single) {
    const spec = AC_SPEC.filter((f) => f[0] !== "ChargeIndicator");
    // columns with nothing in them are left out (unless empty fields are shown)
    const cols = spec.filter(([path]) => state.showEmpty || path === "Amount" || els.some((e) => has(e, path)));
    const isNum = (path) => path === "Amount" || path === "BaseAmount" || path === "MultiplierFactorNumeric";
    const cur = (first(els[0], "Amount") || { getAttribute: () => "" }).getAttribute("currencyID") || "";
    let sum = 0, more = "";
    const rows = els.map((el, j) => {
      const u = new Set(byPath(el, "ChargeIndicator"));
      sum += num(val(el, "Amount")) || 0;
      const tds = cols.map(([path, , bt0]) => {
        const e = first(el, path), bt = btFor(bt0, role);
        if (e) u.add(e);
        const f = bt ? (fieldFlag(el, bt, e ? [e] : []) || (e ? null : requiredFlag(el, bt))) : null;
        const cls = (isNum(path) ? "r" : "") + (f ? (isNum(path) ? " " : "") + "flag-" + f.lvl : "");
        const inner = e ? (path === "Amount" || path === "BaseAmount" ? fmtAmount(txt(e), "") : renderValue(e)) : f ? missing() : "—";
        return "<td" + (cls ? ' class="' + cls + '"' : "") + (f ? ' title="' + esc(flagTitle(f)) + '"' + dataRules(f) : "") + ">" + inner + "</td>";
      }).join("");
      const x = extras([el], u);
      if (x) more += sub(T(single + " {n}", { n: j + 1 }), x);
      return '<tr class="frow"><td>' + (j + 1) + "</td>" + tds + "</tr>";
    }).join("");
    const amtCol = cols.findIndex(([path]) => path === "Amount");
    const foot = "<tr><td" + (amtCol ? ' colspan="' + (amtCol + 1) + '"' : "") + ">" + T(role === "C" ? "Total charges" : "Total allowances") + "</td>" +
      '<td class="r">' + money(sum) + ' <span class="unit">' + esc(cur) + "</span></td>" +
      (cols.length - amtCol - 1 > 0 ? '<td colspan="' + (cols.length - amtCol - 1) + '"></td>' : "") + "</tr>";
    const head = "<tr><th>#</th>" + cols.map(([path, label, bt]) => "<th" + (isNum(path) ? ' class="r"' : "") + ">" + btCell(esc(T(label)), esc(btFor(bt, role))) + xtag("cac:AllowanceCharge/" + guessTag(null, path)) + "</th>").join("") + "</tr>";
    return '<div class="tablewrap"><table class="ac"><thead>' + head + "</thead><tbody>" + rows + "</tbody><tfoot>" + foot + "</tfoot></table></div>" + more;
  }

  // A line's allowances and charges, folded into the calculation of the line net amount (BT-131):
  // quantity × net price, + each charge, − each allowance, = calculated, against the amount in the file.
  const money = (n) => (state.raw ? n.toFixed(2) : n.toLocaleString(I18N.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  function lineAcTables(ln, used) {
    const acs = byPath(ln, "AllowanceCharge");
    acs.forEach((ac) => markDeep(ac, used));
    if (!acs.length) return "";
    const cur = (first(ln, "LineExtensionAmount") || { getAttribute: () => "" }).getAttribute("currencyID") || "";
    const sums = { A: 0, C: 0 };
    const r = (label, amount, cls, bt) => '<tr' + (cls ? ' class="' + cls + '"' : "") + '><td class="k">' + label + '</td><td class="bt-col">' + (bt ? '<span class="bt">' + esc(bt) + "</span>" : "") + '</td><td class="r">' + amount + '</td><td class="cur">' + esc(cur) + "</td></tr>";
    let more = "";
    // one row per charge or allowance: reason on top, the rest (code, percentage, base amount, VAT) small underneath
    const entry = (role) => acs.filter((ac) => (val(ac, "ChargeIndicator") === "true") === (role === "C")).map((ac, j) => {
      const amt = num(val(ac, "Amount")) || 0;
      sums[role] += amt;
      const uu = new Set(byPath(ac, "ChargeIndicator"));
      ["AllowanceChargeReasonCode", "AllowanceChargeReason", "MultiplierFactorNumeric", "Amount", "BaseAmount", "TaxCategory/ID", "TaxCategory/Percent", "TaxCategory/TaxScheme/ID"].forEach((pth) => { const e = first(ac, pth); if (e) uu.add(e); });
      const reason = val(ac, "AllowanceChargeReason"), codeEl = first(ac, "AllowanceChargeReasonCode");
      // each detail keeps its own BT number, so it can still be matched to the field it came from
      const tag = (v, bt) => '<span class="dtl">' + esc(v) + (bt ? ' <span class="bt">' + esc(btFor(bt, role)) + "</span>" : "") + "</span>";
      const bits = [];
      if (codeEl) bits.push(tag(txt(codeEl) + (AC_REASON[txt(codeEl)] ? " · " + T(AC_REASON[txt(codeEl)]) : ""), { A: "BT-140", C: "BT-145" }));
      if (has(ac, "MultiplierFactorNumeric")) bits.push(tag(val(ac, "MultiplierFactorNumeric") + " %", { A: "BT-138", C: "BT-143" }));
      if (has(ac, "BaseAmount")) bits.push(tag(T("of {amount}", { amount: money(num(val(ac, "BaseAmount")) || 0) }), { A: "BT-137", C: "BT-142" }));
      const x = extras([ac], uu);
      if (x) more += sub(T(role === "C" ? "Charge {n}" : "Allowance {n}", { n: j + 1 }), x);
      return r(btCell('<span class="ac-sign">' + (role === "C" ? "+" : "−") + "</span>" + esc(reason || T(role === "C" ? "Charge {n}" : "Allowance {n}", { n: j + 1 })), esc(btFor({ A: "BT-139", C: "BT-144" }, role))) +
        (bits.length ? '<span class="sub-d">' + bits.join("") + "</span>" : ""),
        money(amt), "ac-row", btFor({ A: "BT-136", C: "BT-141" }, role));
    }).join("");
    const charges = entry("C"), allowances = entry("A");
    const rows = (charges ? charges + r(T("Total charges"), money(sums.C), "subtotal") : "") + (allowances ? allowances + r(T("Total allowances"), money(sums.A), "subtotal") : "");
    // Quantity × net price / base quantity + charges − allowances = line net amount (BT-131).
    const qty = num(val(ln, "InvoicedQuantity") || val(ln, "CreditedQuantity")), price = num(val(ln, "Price/PriceAmount"));
    const baseQty = has(ln, "Price/BaseQuantity") ? num(val(ln, "Price/BaseQuantity")) : 1, net = num(val(ln, "LineExtensionAmount"));
    let top = "", bottom = "";
    if (qty !== null && price !== null && baseQty) {
      const gross = Math.round(qty * price / baseQty * 100) / 100, calc = Math.round((gross + sums.C - sums.A) * 100) / 100;
      const ok = net !== null && Math.abs(calc - net) < 0.02;
      top = r(T(baseQty !== 1 ? "Quantity × net price / base quantity" : "Quantity × net price") + ' <span class="dec">(' + esc(String(qty)) + " × " + money(price) + (baseQty !== 1 ? " / " + baseQty : "") + ")</span>", money(gross));
      bottom = r(T("= Calculated"), money(calc), "key") +
        r(T("Line net amount in the file"), net === null ? "—" : money(net) +
          (ok ? ' <span class="ac-ok">✓</span>' : ' <span class="ac-bad">✗ ' + T("off by {amount}", { amount: money(Math.abs(calc - net)) }) + "</span>"), ok ? "" : "bad", "BT-131");
    }
    return '<div class="sub ac-block"><h3>' + T("Line net amount") + '</h3><table class="tot ac-calc"><tbody>' + top + rows + bottom + "</tbody></table>" + more + "</div>";
  }

  function buildSections() {
    const R = state.root, kind = state.kind;
    const claimed = new Set();
    const claim = (...names) => names.forEach((n) => claimed.add(n));
    const out = [];
    const docCur = val(R, "DocumentCurrencyCode");

    // Document
    {
      claim(...DOC_CLAIMS);
      const used = new Set();
      const spec = DOC_SPEC.map((f) => (f[0] === "ID" ? ["ID", kind === "CreditNote" ? "Credit note number" : "Invoice number", "BT-1"] : f));
      out.push({ id: "doc", title: "Document", html: card("doc", "Document", renderFields(R, spec, null, used)) });
    }
    // References
    {
      claim(...REF_CLAIMS);
      const used = new Set();
      let body = renderFields(R, REF_SPEC, null, used);
      body += extras(REF_CLAIMS.filter((n) => n !== "BillingReference").flatMap((n) => byPath(R, n)), used, true);
      out.push({ id: "refs", title: "References", html: card("refs", "References", body) });
    }
    // Preceding invoices (BG-3): repeatable, one table row per invoice so each number sits with its date
    {
      const brs = byPath(R, "BillingReference"), docs = byPath(R, "BillingReference/InvoiceDocumentReference");
      const refSpec = [["BillingReference/InvoiceDocumentReference/ID", "Invoice reference", "BT-25"], ["BillingReference/InvoiceDocumentReference/IssueDate", "Issue date", "BT-26"]];
      if (brs.length || state.showEmpty || specFlagged(refSpec, null)) {
        const used = new Set();
        let body = "";
        if (docs.length) {
          body = '<div class="tablewrap"><table><thead><tr><th>#</th><th>' + btCell(T("Invoice reference"), "BT-25") + xtag("cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID") + "</th>" +
            "<th>" + btCell(T("Issue date"), "BT-26") + xtag("cac:BillingReference/cac:InvoiceDocumentReference/cbc:IssueDate") + "</th></tr></thead><tbody>" +
            docs.map((d, i) => {
              const id = first(d, "ID"), date = first(d, "IssueDate");
              [id, date].forEach((e) => e && used.add(e));
              // an empty cell is only marked when a failed rule points at it (BT-26 is optional unless a rule says otherwise)
              const cell = (e, bt) => { const f = fieldFlag(d, bt, e ? [e] : []);
                return "<td" + (f ? ' class="flag-' + f.lvl + '" title="' + esc(flagTitle(f)) + '"' + dataRules(f) : "") + ">" + (e ? renderValue(e) : f ? missing() : "—") + "</td>"; };
              return '<tr class="frow"><td>' + (i + 1) + "</td>" + cell(id, "BT-25") + cell(date, "BT-26") + "</tr>";
            }).join("") + "</tbody></table></div>";
        }
        if (!docs.length) body = renderFields(R, refSpec, null, used);
        body += extras(brs, used, true);
        const count = docs.length > 1 ? docs.length : null;
        out.push({ id: "preceding", title: "Preceding invoices", count, html: card("preceding", "Preceding invoices", body, { full: true, count }) });
      }
    }
    // Invoice notes (BT-22) in their own block
    {
      const notes = byPath(R, "Note");
      if (notes.length || state.showEmpty) out.push({ id: "notes", title: "Notes", count: notes.length > 1 ? notes.length : null,
        html: card("notes", "Notes", renderFields(R, [["Note", "Invoice note", "BT-22"]], null, new Set()), { full: true, count: notes.length > 1 ? notes.length : null }) });
    }
    // Supporting documents (BG-24) and invoiced objects (BT-18), when supplied
    {
      claim("AdditionalDocumentReference");
      const adrs = byPath(R, "AdditionalDocumentReference");
      let body = "", nDoc = 0, nObj = 0;
      adrs.forEach((adr) => {
        const u = new Set();
        const role = val(adr, "DocumentTypeCode") === "130" ? "O" : "N";
        const title = role === "O" ? T("Invoiced object {n}", { n: ++nObj }) : T("Supporting document {n}", { n: ++nDoc });
        body += sub(title, renderFields(adr, ADR_SPEC, role, u) + extras([adr], u));
      });
      if (!adrs.length && state.showEmpty) body = sub("Supporting document", renderFields(null, ADR_SPEC, "N", new Set()));
      const count = adrs.length > 1 ? adrs.length : null;
      if (body) out.push({ id: "docs", title: "Supporting documents", count, html: card("docs", "Supporting documents", body, { full: true, count }) });
    }
    // Parties
    const party = (id, title, tag, role) => {
      claim(tag);
      const els = byPath(R, tag);
      const spec = PARTY_ROLE_FIELDS(role).map((f) => [(tag === "TaxRepresentativeParty" || tag === "PayeeParty" ? "" : "Party/") + f[0], f[1], f[2], f[3]]);
      if (!els.length && !state.showEmpty && !specFlagged(spec, role)) return;
      let body = "";
      if (!els.length) body = renderFields(null, spec, role, new Set());
      els.forEach((el) => { const u = new Set(); body += renderFields(el, spec, role, u) + extras([el], u); });
      out.push({ id, title, html: card(id, title, body) });
    };
    party("seller", "Seller", "AccountingSupplierParty", "S");
    party("buyer", "Buyer", "AccountingCustomerParty", "B");
    party("payee", "Payee", "PayeeParty", "P");
    party("taxrep", "Seller tax representative", "TaxRepresentativeParty", "T");

    // Repeating top-level groups rendered with one spec
    const groups = (id, title, tag, spec, roleFn, subTitle, full) => {
      claim(tag);
      const els = byPath(R, tag);
      if (!els.length && !state.showEmpty && !specFlagged(spec, null)) return;
      let body = "";
      if (!els.length) body = renderFields(null, spec, null, new Set());
      els.forEach((el, i) => {
        const u = new Set();
        const inner = renderFields(el, spec, roleFn ? roleFn(el) : null, u) + extras([el], u);
        body += els.length > 1 || subTitle ? sub(subTitle ? subTitle(el, i) : T(title) + " " + (i + 1), inner) : inner;
      });
      out.push({ id, title, count: els.length > 1 ? els.length : null, html: card(id, title, body, { count: els.length > 1 ? els.length : null, full }) });
    };
    groups("delivery", "Delivery", "Delivery", DELIVERY_SPEC);
    // Payment: means + terms + prepaid in one card
    {
      claim("PaymentMeans", "PaymentTerms", "PrepaidPayment");
      const pm = byPath(R, "PaymentMeans"), pt = byPath(R, "PaymentTerms"), pp = byPath(R, "PrepaidPayment");
      let body = "";
      pm.forEach((el, i) => { const u = new Set(); body += sub(pm.length > 1 ? T("Payment means {n}", { n: i + 1 }) : "Payment means", renderFields(el, PAYMEANS_SPEC, null, u) + extras([el], u)); });
      if (!pm.length && (state.showEmpty || specFlagged(PAYMEANS_SPEC, null))) body += sub("Payment means", renderFields(null, PAYMEANS_SPEC, null, new Set()));
      pt.forEach((el, i) => { const u = new Set(); body += sub(pt.length > 1 ? T("Payment terms {n}", { n: i + 1 }) : "Payment terms", renderFields(el, PAYTERMS_SPEC, null, u) + extras([el], u)); });
      if (!pt.length && (state.showEmpty || specFlagged(PAYTERMS_SPEC, null))) body += sub("Payment terms", renderFields(null, PAYTERMS_SPEC, null, new Set()));
      pp.forEach((el, i) => { body += sub(T("Prepaid payment {n}", { n: i + 1 }), extras([el], new Set()).replace('<div class="extras-h">' + T("More fields") + "</div>", "")); });
      if (body) out.push({ id: "payment", title: "Payment", html: card("payment", "Payment", body) });
    }
    // Document-level allowances and charges, as two separate blocks
    {
      claim("AllowanceCharge");
      const all = byPath(R, "AllowanceCharge");
      const spec = AC_SPEC.filter((f) => f[0] !== "ChargeIndicator");
      const kinds = [
        ["allowances", "Allowances", "Allowance", "A", all.filter((e) => val(e, "ChargeIndicator") !== "true")],
        ["charges", "Charges", "Charge", "C", all.filter((e) => val(e, "ChargeIndicator") === "true")]
      ];
      for (const [id, title, single, role, els] of kinds) {
        if (!els.length && !state.showEmpty) continue;
        const body = els.length ? docAcTable(els, role, single) : renderFields(null, spec, role, new Set());
        out.push({ id, title, html: card(id, title, body, { full: true }) });
      }
    }

    // VAT
    {
      claim("TaxTotal", "WithholdingTaxTotal");
      const tts = byPath(R, "TaxTotal");
      const taxCur = val(R, "TaxCurrencyCode");
      let body = "";
      tts.forEach((tt) => {
        const u = new Set();
        const amt = first(tt, "TaxAmount");
        let inner = "";
        if (amt) {
          u.add(amt);
          const inTaxCur = taxCur && taxCur !== docCur && amt.getAttribute("currencyID") === taxCur;
          inner += row(inTaxCur ? "VAT total in accounting currency" : "Invoice total VAT amount", inTaxCur ? "BT-111" : "BT-110", renderValue(amt), "", tagPath(amt));
        }
        const subs = byPath(tt, "TaxSubtotal");
        if (subs.length) {
          const th = (label, bt, tag, r) => "<th" + (r ? ' class="r"' : "") + ">" + btCell(T(label), bt) + xtag("cac:TaxSubtotal/" + tag) + "</th>";
          inner += '<div class="tablewrap"><table><thead><tr>' + th("Category", "BT-118", "cac:TaxCategory/cbc:ID") + th("Rate", "BT-119", "cac:TaxCategory/cbc:Percent", true) +
            th("Taxable", "BT-116", "cbc:TaxableAmount", true) + th("VAT", "BT-117", "cbc:TaxAmount", true) +
            th("Exemption reason", "BT-120/121", "cac:TaxCategory/cbc:TaxExemptionReason") + "</tr></thead><tbody>";
          for (const st of subs) {
            const g = (p) => { const e = first(st, p); if (e) u.add(e); return e; };
            const cat = g("TaxCategory/ID"), pct = g("TaxCategory/Percent"), tb = g("TaxableAmount"), ta = g("TaxAmount");
            const rc = g("TaxCategory/TaxExemptionReasonCode"), rt = g("TaxCategory/TaxExemptionReason");
            g("TaxCategory/TaxScheme/ID");
            inner += '<tr class="frow"><td>' + (cat ? renderValue(cat) : "—") + '</td><td class="r">' + (pct ? esc(txt(pct)) + " %" : "—") +
              '</td><td class="r">' + (tb ? renderValue(tb) : "—") + '</td><td class="r">' + (ta ? renderValue(ta) : "—") +
              "</td><td>" + [rc ? esc(txt(rc)) : "", rt ? esc(txt(rt)) : ""].filter(Boolean).join(" · ") + "</td></tr>";
          }
          inner += "</tbody></table></div>";
        }
        inner += extras([tt], u);
        body += tts.length > 1 ? sub(T("Tax total {n}", { n: tts.indexOf(tt) + 1 }), inner) : inner;
      });
      body += extras(byPath(R, "WithholdingTaxTotal"), new Set(), true);
      out.push({ id: "vat", title: "VAT", html: card("vat", "VAT", body, { full: true }) });
    }

    // Totals + checks
    {
      claim("LegalMonetaryTotal");
      const lmt = first(R, "LegalMonetaryTotal");
      const u = new Set();
      // Totals as a table: amounts right-aligned in one column so they line up.
      const strong = { TaxExclusiveAmount: "key", TaxInclusiveAmount: "key", PayableAmount: "due" };
      const sign = { AllowanceTotalAmount: "− ", PrepaidAmount: "− ", ChargeTotalAmount: "+ " };
      const trs = TOTAL_SPEC.map(([path, label, bt]) => {
        const e = first(lmt, path);
        const flag = fieldFlag(lmt || R, bt, e ? [e] : []) || (e ? null : requiredFlag(R, bt));
        if (!e && !state.showEmpty && !flag) return "";
        if (e) u.add(e);
        return '<tr class="frow' + (e ? "" : " empty") + (strong[path] ? " " + strong[path] : "") + (flag ? " flag-" + flag.lvl : "") + '"' +
          (flag ? ' title="' + esc(flagTitle(flag)) + '"' + dataRules(flag) : "") + '><td class="k">' + btCell(esc(T(label)), bt) +
          xtag(e ? tagPath(e) : "cac:LegalMonetaryTotal/cbc:" + path) + "</td>" +
          '<td class="r">' + (e ? (sign[path] || "") + fmtAmount(txt(e), "") : flag ? missing() : "—") + '</td><td class="cur">' + (e ? esc(e.getAttribute("currencyID") || "") : "") + "</td></tr>";
      }).join("");
      let body = trs ? '<table class="tot"><tbody>' + trs + "</tbody></table>" + extras([lmt], u) : "";
      out.push({ id: "totals", title: "Totals", html: card("totals", "Totals", body) });
      const checks = state.checks;
      if (checks.length) {
        const bad = checks.filter((c) => !c.ok && !c.warn).length, warn = checks.filter((c) => !c.ok && c.warn).length;
        out.push({ id: "checks", title: "Checks", html: card("checks", "Checks", checksHtml(checks),
          { count: bad ? T("{n} failing", { n: bad }) : warn ? T(warn > 1 ? "{n} warnings" : "{n} warning", { n: warn }) : T("all pass") }) });
      }
    }

    // Lines
    {
      const lineTag = kind === "CreditNote" ? "CreditNoteLine" : "InvoiceLine";
      claim("InvoiceLine", "CreditNoteLine");
      const lines = byPath(R, lineTag);
      let body = "";
      if (lines.length) {
        const lt = "cac:" + lineTag + "/";
        const th = (label, tag, r) => "<th" + (r ? ' class="r"' : "") + ">" + T(label) + xtag(lt + tag) + "</th>";
        body = '<div class="tablewrap"><table><thead><tr>' + th("Line", "cbc:ID") + th("Item", "cac:Item/cbc:Name") +
          th("Quantity", kind === "CreditNote" ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity", true) + th("Net price", "cac:Price/cbc:PriceAmount", true) +
          th("VAT", "cac:Item/cac:ClassifiedTaxCategory") + th("Net amount", "cbc:LineExtensionAmount", true) + '<th class="go"></th></tr></thead><tbody>';
        lines.forEach((ln, i) => {
          const q = first(ln, "InvoicedQuantity") || first(ln, "CreditedQuantity");
          const unit = q ? q.getAttribute("unitCode") || "" : "";
          const price = first(ln, "Price/PriceAmount"), net = first(ln, "LineExtensionAmount");
          const cat = val(ln, "Item/ClassifiedTaxCategory/ID"), pct = val(ln, "Item/ClassifiedTaxCategory/Percent");
          const sid = val(ln, "Item/SellersItemIdentification/ID");
          const u = new Set();
          let detail = renderFields(ln, LINE_SPEC, null, u);
          detail += lineAcTables(ln, u);
          detail += extras([ln], u);
          // Rules that fail on this line: flag the row and list them in a full-width row right under it.
          const lineChecks = state.checks.filter((c) => !c.ok && c.lines && c.lines.includes(i));
          const nBad = lineChecks.filter((c) => !c.warn).length;
          const flag = lineChecks.length ? '<span class="lerr' + (nBad ? "" : " warn") + '" title="' + esc(lineChecks.map((c) => c.id).join(", ")) + '">' +
            (nBad ? T(nBad > 1 ? "✗ {n} errors" : "✗ {n} error", { n: nBad }) : "! " + lineChecks.length) + "</span>" : "";
          const lineNo = String(val(ln, "ID") || i + 1);
          body += '<tr class="line frow' + (nBad ? " has-err" : "") + '" data-line="' + i + '" style="--idw:' + Math.min(lineNo.length, 12) + 'ch" tabindex="0" aria-expanded="false"><td>' + esc(lineNo) + flag + "</td><td>" +
            esc(val(ln, "Item/Name") || "—") + (sid ? '<div class="small">' + esc(sid) + "</div>" : "") + '</td><td class="r">' +
            (q ? esc(txt(q)) + (unit ? ' <span class="unit" title="' + esc(UNITS[unit] || unit) + '">' + esc(unit) + "</span>" : "") : "—") +
            '</td><td class="r">' + (price ? fmtAmount(txt(price), "") : "—") + "</td><td><span class=\"vatc\" data-cat=\"" + esc(cat) + "\">" + esc(cat) + (pct ? " " + esc(pct) + " %" : "") + "</span>" +
            '</td><td class="r">' + (net ? renderValue(net) : "—") + '</td><td class="go" aria-hidden="true"></td></tr>' + lineErrRow(i, 7) +
            '<tr class="detail" data-detail="' + i + '" hidden><td colspan="7"><div class="detail-grid">' + detail + "</div></td></tr>";
        });
        body += "</tbody></table></div>";
      }
      const badLines = Object.keys(state.issues.lines).filter((k) => state.issues.lines[k].bad.size).length;
      const count = lines.length + (badLines ? " · " + T("{n} with errors", { n: badLines }) : "");
      out.push({ id: "lines", title: "Lines", count, html: card("lines", "Lines", body, {
        full: true, count,
        act: lines.length ? '<button class="mini" type="button" data-act="expand">' + T("Expand all") + '</button><button class="mini" type="button" data-act="collapse">' + T("Collapse all") + "</button>" : ""
      }) });
    }

    // Anything else at the top level (extensions, signatures, other parties…)
    {
      const rest = Array.from(R.children).filter((k) => !claimed.has(k.localName));
      if (rest.length) {
        let body = "";
        for (const el of rest) {
          if (!el.children.length) body += row(humanize(el.localName), "", renderValue(el), "extra", tagPath(el));
          else body += sub(humanize(el.localName), extras([el], new Set()).replace('<div class="extras-h">' + T("More fields") + "</div>", ""));
        }
        out.push({ id: "other", title: "Other elements", count: rest.length, html: card("other", "Other elements", body, { full: true, count: rest.length }) });
      }
    }

    return out;
  }

  // Coloured, foldable XML view.
  function xmlHtml(doc) {
    const P = (t) => '<span class="p">' + esc(t) + "</span>";
    const attrs = (el) => Array.from(el.attributes).map((a) => {
      const ns = /^xmlns/.test(a.name) ? " ns" : "";
      return ' <span class="a' + ns + '">' + esc(a.name) + "</span>" + P("=") + '<span class="s' + ns + '">"' + esc(a.value) + '"</span>';
    }).join("");
    const open = (el) => P("<") + '<span class="t">' + esc(el.nodeName) + "</span>" + attrs(el);
    const close = (el) => P("</") + '<span class="t">' + esc(el.nodeName) + "</span>" + P(">");
    const node = (el) => {
      const kids = Array.from(el.childNodes).filter((n) => n.nodeType === 1 || n.nodeType === 8 || n.nodeType === 4 || (n.nodeType === 3 && n.nodeValue.trim()));
      if (!kids.length) return '<div class="ln">' + open(el) + P("/>") + "</div>";
      if (kids.every((n) => n.nodeType === 3 || n.nodeType === 4)) {
        const t = el.textContent.trim();
        let body;
        if (el.localName === "EmbeddedDocumentBinaryObject" && t.length > 120) {
          body = '<span class="x">' + esc(t.slice(0, 40)) + '</span><span class="p">…</span> <a class="b64" href="#att-' + state.attIndex.get(el) + '">' +
            T("{n} characters of Base64 · open attachment", { n: t.length.toLocaleString(I18N.locale()) }) + "</a>";
        } else body = '<span class="x">' + esc(t) + "</span>";
        return '<div class="ln">' + open(el) + P(">") + body + close(el) + "</div>";
      }
      const childCount = kids.filter((n) => n.nodeType === 1).length;
      return '<div class="node"><div class="ln"><button type="button" class="fold" aria-label="' + esc(T("Fold {name}", { name: el.nodeName })) + '">▾</button>' + open(el) + P(">") +
        '<span class="more" title="' + esc(T("Expand")) + '">… ' + childCount + "</span></div>" +
        '<div class="kids">' + kids.map((n) => (n.nodeType === 1 ? node(n)
          : n.nodeType === 8 ? '<div class="ln c">' + esc("<!--" + n.nodeValue + "-->") + "</div>"
          : '<div class="ln"><span class="x">' + esc(n.nodeValue.trim()) + "</span></div>")).join("") +
        '</div><div class="ln close-tag">' + close(el) + "</div></div>";
    };
    const decl = doc.xmlVersion ? '<div class="ln">' + P("<?") + '<span class="t">xml</span> <span class="a">version</span>' + P("=") + '<span class="s">"' + esc(doc.xmlVersion) + '"</span>' +
      (doc.xmlEncoding ? ' <span class="a">encoding</span>' + P("=") + '<span class="s">"' + esc(doc.xmlEncoding) + '"</span>' : "") + P("?>") + "</div>" : "";
    return decl + node(doc.documentElement);
  }


  // ---------- Attachments ----------
  function collectAttachments() {
    state.atts = []; state.attIndex = new Map(); state.cache.forEach((c) => c.url && URL.revokeObjectURL(c.url)); state.cache = new Map();
    const all = state.root.getElementsByTagName("*");
    for (const el of all) {
      if (el.localName !== "EmbeddedDocumentBinaryObject") continue;
      let adr = el.parentElement;
      while (adr && adr.localName !== "AdditionalDocumentReference" && adr.localName !== "DocumentReference") adr = adr.parentElement;
      const b64 = el.textContent.replace(/\s+/g, "");
      const pad = (b64.match(/=+$/) || [""])[0].length;
      const i = state.atts.length;
      const head = sniffB64(b64);
      const mime = el.getAttribute("mimeCode") || head || "";
      const filename = el.getAttribute("filename") || (adr ? val(adr, "ID") : "") || "attachment-" + (i + 1) + extFor(mime);
      let warn = "";
      if (mime === "application/pdf" && head && head !== "application/pdf") warn = "Declared as PDF, but the content doesn't start with %PDF.";
      state.atts.push({ el, b64, filename, mime, sniffed: head, size: Math.max(0, Math.floor(b64.length * 3 / 4) - pad),
        desc: adr ? val(adr, "DocumentDescription") : "", ref: adr ? val(adr, "ID") : "", warn });
      state.attIndex.set(el, i);
    }
  }
  function sniffB64(b64) {
    let bytes;
    try { bytes = atob(b64.slice(0, 16).replace(/[^A-Za-z0-9+/]/g, "").slice(0, 12)); } catch (e) { return ""; }
    if (bytes.startsWith("%PDF")) return "application/pdf";
    if (bytes.startsWith("\x89PNG")) return "image/png";
    if (bytes.startsWith("\xFF\xD8\xFF")) return "image/jpeg";
    if (bytes.startsWith("GIF8")) return "image/gif";
    if (bytes.startsWith("PK")) return "application/zip";
    if (/^\s*</.test(bytes) || bytes.startsWith("\xEF\xBB\xBF<")) return "application/xml";
    return "";
  }
  function extFor(mime) {
    return ({ "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "application/zip": ".zip",
      "application/xml": ".xml", "text/xml": ".xml", "text/csv": ".csv", "text/plain": ".txt",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx", "application/vnd.oasis.opendocument.spreadsheet": ".ods" })[mime] || "";
  }
  function attBytes(i) {
    const a = state.atts[i];
    let c = state.cache.get(i);
    if (!c) {
      let b64 = a.b64.replace(/-/g, "+").replace(/_/g, "/");
      if (b64.length % 4) b64 += "=".repeat(4 - (b64.length % 4));
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
      const type = a.sniffed || a.mime || "application/octet-stream";
      c = { u8, type, url: URL.createObjectURL(new Blob([u8], { type })) };
      state.cache.set(i, c);
    }
    return c;
  }

  const viewer = $("viewer"), vBody = $("vBody");
  let viewing = -1;
  function preview(i) {
    const a = state.atts[i];
    let c;
    try { c = attBytes(i); } catch (e) { alert(T("This attachment isn't valid Base64, so it can't be opened.")); return; }
    viewing = i;
    $("vTitle").textContent = a.filename + " · " + formatSize(c.u8.length);
    $("vOpen").href = c.url;
    vBody.textContent = "";
    const t = c.type;
    if (t === "application/pdf") {
      const f = document.createElement("iframe");
      f.title = T("Preview of {name}", { name: a.filename }); f.src = c.url;
      vBody.appendChild(f);
    } else if (/^image\//.test(t)) {
      const img = document.createElement("img"); img.alt = a.filename; img.src = c.url; vBody.appendChild(img);
    } else if (/xml|json|csv|text\//.test(t) || /\.(xml|txt|csv|json)$/i.test(a.filename)) {
      const pre = document.createElement("pre");
      pre.textContent = new TextDecoder("utf-8").decode(c.u8.subarray(0, 3 * 1048576));
      vBody.appendChild(pre);
    } else {
      const d = document.createElement("div"); d.className = "msg";
      d.textContent = T("No in-page preview for {type}. Use Download to open it.", { type: t || T("this file type") });
      vBody.appendChild(d);
    }
    if (typeof viewer.showModal === "function") viewer.showModal(); else viewer.setAttribute("open", "");
  }
  function closeViewer() { vBody.textContent = ""; viewing = -1; if (viewer.open) viewer.close(); }
  function download(i) {
    const a = state.atts[i];
    let c;
    try { c = attBytes(i); } catch (e) { alert(T("This attachment isn't valid Base64, so it can't be saved.")); return; }
    const blob = new Blob([c.u8], { type: c.type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = a.filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }
  $("vClose").addEventListener("click", closeViewer);
  $("vDownload").addEventListener("click", () => { if (viewing >= 0) download(viewing); });
  viewer.addEventListener("close", () => { vBody.textContent = ""; viewing = -1; });
  viewer.addEventListener("click", (e) => { if (e.target === viewer) closeViewer(); });

  // ---------- Render ----------
  const fmtMoney = (raw) => (raw === "" || raw == null ? "—" : fmtAmount(raw, ""));
  function parseDate(raw) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function fmtDate(raw) {
    if (state.raw) return esc(raw || "");
    const d = parseDate(raw);
    return d ? '<span title="' + esc(raw) + '">' + esc(d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short", year: "numeric" })) + "</span>" : esc(raw || "");
  }
  function countryName(code) {
    if (!code) return "";
    try { const r = regionNames && regionNames.of(code.toUpperCase()); if (r && r !== code.toUpperCase()) return r; } catch (e) {}
    return code;
  }
  const schemeLabel = (el) => {
    const s = el && el.getAttribute("schemeID");
    return s ? '<span class="scheme" title="schemeID ' + esc(s) + '">' + esc(SCHEMES[s] ? T(SCHEMES[s]) : s) + "</span>" : "";
  };
  const kv = (items) => {
    const list = items.filter((i) => i && i[1]);
    return list.length ? '<dl class="kv">' + list.map((i) => "<dt>" + esc(T(i[0])) + "</dt><dd>" + i[1] + "</dd>").join("") + "</dl>" : "";
  };
  const iban = (s) => '<span class="iban">' + esc(String(s).replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ")) + "</span>";

  // Business rules live in rules/en16931.js.
  const roundingInInclusive = () => EN16931.roundingInInclusive(state.root);
  const computeChecks = () => EN16931.check(state.root, state.kind, state.ruleSets);

  // Which Fields block (and which line) an element belongs to, so failed rules can be pinned on it.
  const BLOCK_OF = {
    AccountingSupplierParty: "seller", AccountingCustomerParty: "buyer", PayeeParty: "payee", TaxRepresentativeParty: "taxrep",
    Delivery: "delivery", PaymentMeans: "payment", PaymentTerms: "payment", PrepaidPayment: "payment",
    TaxTotal: "vat", WithholdingTaxTotal: "vat", LegalMonetaryTotal: "totals", AdditionalDocumentReference: "docs", Note: "notes"
  };
  REF_CLAIMS.forEach((n) => { BLOCK_OF[n] = "refs"; });
  BLOCK_OF.BillingReference = "preceding";
  function locate(el) {
    const R = state.root;
    let top = el;
    while (top && top.parentElement && top.parentElement !== R) top = top.parentElement;
    if (!top || top === R || top.parentElement !== R) return { sec: "doc" };
    const n = top.localName;
    if (n === "InvoiceLine" || n === "CreditNoteLine") return { sec: "lines", line: byPath(R, n).indexOf(top) };
    if (n === "AllowanceCharge") return { sec: val(top, "ChargeIndicator") === "true" ? "charges" : "allowances" };
    return { sec: BLOCK_OF[n] || (DOC_CLAIMS.includes(n) ? "doc" : "other") };
  }
  // Failed rule IDs per block and per line: { secs: { id: { bad, warn } }, lines: { index: { bad, warn } } }.
  function mapIssues(checks) {
    const secs = {}, lines = {};
    // Each entry keeps the rule IDs (for dots and badges) and the failed checks themselves (for block headers).
    const add = (map, key, lvl, c) => {
      const e = map[key] = map[key] || { bad: new Set(), warn: new Set(), list: [] };
      e[lvl].add(c.id);
      if (!e.list.includes(c)) e.list.push(c);
    };
    checks.filter((c) => !c.ok).forEach((c) => {
      const lvl = c.warn ? "warn" : "bad";
      c.lines = [];
      c.at.forEach((el) => {
        const loc = locate(el);
        if (!c.sec) c.sec = loc.sec;
        add(secs, loc.sec, lvl, c);
        if (loc.line >= 0) { add(lines, loc.line, lvl, c); if (!c.lines.includes(loc.line)) c.lines.push(loc.line); }
      });
    });
    return { secs, lines };
  }
  // Status dot: green when no rule fails in the block, red on a failure, amber on a warning only.
  function dot(id) {
    let bad = [], warn = [];
    if (id === "checks") {
      bad = state.checks.filter((c) => !c.ok && !c.warn).map((c) => c.id);
      warn = state.checks.filter((c) => !c.ok && c.warn).map((c) => c.id);
    } else if (state.issues.secs[id]) {
      bad = [...state.issues.secs[id].bad]; warn = [...state.issues.secs[id].warn];
    }
    // a field marked inside the block counts too, even when no rule points at the block itself
    const fl = state.secFlag[id];
    const cls = bad.length || fl === "bad" ? "bad" : warn.length || fl === "warn" ? "warn" : "ok";
    const title = bad.length ? T("Fails {ids}", { ids: bad.join(", ") }) : warn.length ? T("Warning {ids}", { ids: warn.join(", ") }) : fl ? T("A field in this block is flagged") : T("No rule fails here");
    return '<span class="dot ' + cls + '" title="' + esc(title) + '"></span>';
  }
  // inList: an entry of the Checks list; a failed one is clickable (arrow under its ID) and jumps to where it fails.
  // Elsewhere (a block header or a line's error row) the "Fails on …" detail is dropped: you are already there.
  const checkLi = (x, inList) => {
    const go = inList && !x.ok;
    return '<li class="' + (x.ok ? "ok" : x.warn ? "warn" : "bad") + (go ? " go" : "") + '"' +
      (go ? ' data-act="goerr" data-check="' + state.checks.indexOf(x) + '" role="button" tabindex="0" title="' + esc(T("Show where it fails")) + '"' : "") + ">" +
      '<span class="rid">' + esc(x.id) + (go ? '<span class="arrow" aria-hidden="true">↘</span>' : "") + "</span><span>" +
      (x.ok ? "✓ " : x.warn ? "! " : "✗ ") + esc(I18N.tr(x.text)) +
      (x.detail && (inList || !/^Fails on /.test(x.detail)) ? "<small>" + esc(I18N.tr(x.detail)) + "</small>" : "") + "</span></li>";
  };
  // Jump to a failed check: its line (the next one on each click when it fails on several) or else its block.
  function goToCheck(c) {
    showTab("fields");
    if (c.lines.length) {
      c.next = ((c.next == null ? -1 : c.next) + 1) % c.lines.length;
      const row = $("content").querySelector('tr.line[data-line="' + c.lines[c.next] + '"]');
      if (row) { row.hidden = false; setLine(row, true); flash(row); }
      return;
    }
    flash($("sec-" + c.sec));
  }
  function flash(el) {
    if (!el) return;
    goTo(el);
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1600);
  }

  // Full-width row under a line listing the rules that fail on it (empty when the line is fine).
  function lineErrRow(i, cols) {
    const list = state.checks.filter((c) => !c.ok && c.lines && c.lines.includes(i));
    return list.length ? '<tr class="line-err" data-errline="' + i + '"><td colspan="' + cols + '"><ul class="checks line-checks">' +
      list.map((c) => checkLi(c, false)).join("") + "</ul></td></tr>" : "";
  }

  function checksHtml(c) {
    c = c || state.checks;
    if (!c.length) return "";
    const li = (x) => checkLi(x, true);
    const bad = c.filter((x) => !x.ok && !x.warn), warn = c.filter((x) => !x.ok && x.warn), ok = c.filter((x) => x.ok);
    const detected = EN16931.detect(state.root);
    let h = '<div class="rulesets"><span>' + T("Rule sets") + '</span><label class="on"><input type="checkbox" checked disabled> EN 16931</label>' +
      Object.keys(EN16931.sets).map((id) => '<label' + (state.ruleSets.includes(id) ? ' class="on"' : "") + '><input type="checkbox" data-ruleset="' + id + '"' +
        (state.ruleSets.includes(id) ? " checked" : "") + "> " + esc(T(EN16931.sets[id].name)) + (detected.includes(id) ? " <small>" + T("detected") + "</small>" : "") + "</label>").join("") + "</div>";
    if (bad.length || warn.length) h += '<ul class="checks">' + bad.concat(warn).map(li).join("") + "</ul>";
    if (ok.length) h += '<details class="passed"><summary>' + (ok.length > 1 ? T("{n} rules pass", { n: ok.length }) : T("1 rule passes")) +
      '</summary><ul class="checks">' + ok.map(li).join("") + "</ul></details>";
    return h;
  }

  // Verdict first: one banner at the very top says whether the document follows the rules, and where it does not.
  function renderVerdict() {
    const el = $("verdict"), checks = state.checks;
    if (!checks.length) { el.hidden = true; el.innerHTML = ""; return; }
    const bad = checks.filter((c) => !c.ok && !c.warn).length, warn = checks.filter((c) => !c.ok && c.warn).length;
    const lvl = bad ? "bad" : warn ? "warn" : "ok";
    const where = Object.keys(state.issues.secs).filter((id) => id !== "checks" && (state.issues.secs[id].bad.size || state.issues.secs[id].warn.size));
    const chips = where.map((id) => {
      const s = state.issues.secs[id], n = s.bad.size + s.warn.size;
      return '<button type="button" class="vchip ' + (s.bad.size ? "bad" : "warn") + '" data-act="gosec" data-sec="' + esc(id) + '">' +
        esc(T((state.sectionTitles && state.sectionTitles.get(id)) || humanize(id))) + " <b>" + n + "</b></button>";
    }).join("");
    el.className = "verdict " + lvl;
    el.hidden = false;
    el.innerHTML = '<div class="v-main"><span class="v-icon" aria-hidden="true">' + (bad ? "✗" : "✓") + "</span><div><div class=\"v-text\">" +
      (bad ? T("✗ {bad} of {n} rules fail", { bad, n: checks.length }).replace(/^✗\s*/, "") : T("✓ {n} rules pass", { n: checks.length }).replace(/^✓\s*/, "")) + "</div>" +
      (warn ? '<div class="v-sub">' + T(warn > 1 ? "{n} warnings" : "{n} warning", { n: warn }) + "</div>" : "") +
      '<button type="button" class="v-sets" data-act="checks" title="' + esc(T("Change the rule sets")) + '">' + esc(T("Rule sets")) + ": EN 16931" +
      state.ruleSets.map((id) => " · " + esc(T(EN16931.sets[id].name))).join("") + "</button></div></div>" +
      '<div class="v-issues" id="vIssues"></div>' +
      (chips ? '<div class="v-chips">' + chips + "</div>" : "") +
      (bad || warn ? '<button type="button" class="v-btn" data-act="checks">' + T("Show all {n} rules", { n: checks.length }) + "</button>" : "");
  }

  // Phone summary: the figures to match against SAP in one compact card (the wide hero and fact tiles are hidden there).
  function renderHero() {
    const R = state.root, kind = state.kind;
    const code = val(R, kind === "CreditNote" ? "CreditNoteTypeCode" : "InvoiceTypeCode");
    const partyName = (tag) => val(R, tag + "/Party/PartyLegalEntity/RegistrationName") || val(R, tag + "/Party/PartyName/Name");
    const pay = first(R, "LegalMonetaryTotal/PayableAmount");
    const net = first(R, "LegalMonetaryTotal/TaxExclusiveAmount") || first(R, "LegalMonetaryTotal/LineExtensionAmount"), vat = first(R, "TaxTotal/TaxAmount");
    const issue = val(R, "IssueDate"), due = val(R, "DueDate") || val(R, "PaymentMeans/PaymentDueDate");
    const di = parseDate(issue), dd = parseDate(due);
    // the #BAR# note says what kind of transaction this is (B2B, B2C, B2BINT …)
    const barNote = byPath(R, "Note").map(txt).map((t) => /^#BAR#\s*([\s\S]*)$/.exec(t.trim())).find(Boolean);
    const bar = barNote ? barNote[1].trim() : "";
    const days = di && dd ? Math.round((dd - di) / 86400000) : null;
    $("hero").innerHTML =
      '<div class="hero-main"><div class="eyebrow"><span class="badge' + (kind === "CreditNote" ? " cn" : "") + '">' + T(kind === "CreditNote" ? "Credit note" : "Invoice") + "</span>" +
      (bar ? '<span class="badge bar-in" title="' + esc(T("Transaction category (note #BAR#)")) + '">' + esc(bar) + "</span>" : "") +
      (code ? "<span>" + esc(code) + (DOC_TYPES[code] ? " · " + esc(T(DOC_TYPES[code])) : "") + "</span>" : "") +
      (state.wrapped ? "<span>" + esc(T("inside <{name}>", { name: state.wrapped })) + "</span>" : "") + "</div>" +
      '<div class="docno">' + esc(val(R, "ID") || T("(no number)")) + "</div>" +
      '<div class="flow"><div class="who from"><small>' + T("From") + "</small><span title=\"" + esc(partyName("AccountingSupplierParty")) + "\">" + esc(partyName("AccountingSupplierParty") || T("Unknown seller")) + "</span></div>" +
      '<span class="arrow" aria-hidden="true">→</span><div class="who to"><small>' + T("To") + "</small><span title=\"" + esc(partyName("AccountingCustomerParty")) + "\">" + esc(partyName("AccountingCustomerParty") || T("Unknown buyer")) + "</span></div></div></div>" +
      (bar ? '<div class="hero-bar" title="' + esc(T("Transaction category (note #BAR#)")) + '"><span>' + esc(bar) + "</span></div>" : "") +
      '<div class="hero-amount">' +
      (pay ? '<div class="lbl">' + T(kind === "CreditNote" ? "Amount credited" : "Amount due") + '</div><div class="big">' + fmtMoney(txt(pay)) + '<span class="cur">' + esc(pay.getAttribute("currencyID") || "") + "</span></div>" : "") +
      (due ? '<div class="due">' + T("Due") + " <b>" + fmtDate(due) + "</b>" + (days !== null ? " · " + T("{n} days after issue", { n: days }) : "") + "</div>" : "") +
      (net || vat ? '<div class="sums">' + (net ? '<div><span>' + T("Net amount") + "</span><b>" + fmtMoney(txt(net)) + "</b></div>" : "") +
        (vat ? '<div><span>' + T("VAT") + "</span><b>" + fmtMoney(txt(vat)) + "</b></div>" : "") + "</div>" : "") +
      "</div>";

  }

  function attTile(i) {
    const a = state.atts[i];
    const type = a.sniffed || a.mime || "";
    const ext = (a.filename.includes(".") ? a.filename.split(".").pop() : extFor(type).slice(1) || "file").slice(0, 4).toUpperCase();
    const cls = /pdf/.test(type) ? "pdf" : /^image\//.test(type) ? "img" : /xml/.test(type) ? "xml" : "";
    return '<div class="att" id="att-' + i + '"><div class="att-icon ' + cls + '">' + esc(ext) + '</div><div class="att-meta"><b>' + esc(a.filename) + "</b>" +
      "<span>" + esc(a.mime || T("unknown type")) + " · " + formatSize(a.size) + (a.desc ? " · " + esc(a.desc) : "") + "</span>" +
      (a.ref && a.ref !== a.filename ? "<span>" + esc(T("Reference: {ref}", { ref: a.ref })) + "</span>" : "") + (a.warn ? '<span class="warn">' + esc(T(a.warn)) + "</span>" : "") +
      '</div><div class="att-act"><button class="primary" type="button" data-act="preview" data-att="' + i + '">' + T("Preview") + "</button>" +
      '<button type="button" data-act="download" data-att="' + i + '">' + T("Download") + "</button></div></div>";
  }

  // Same order as the billing document in VF03 / FB03: header, partners, delivery and payment, items, then amounts and the rule check.
  const NAV_GROUPS = [
    ["Document", ["doc", "refs", "preceding", "notes", "docs"]],
    ["Parties", ["seller", "buyer", "payee", "taxrep"]],
    ["Delivery & payment", ["delivery", "payment", "allowances", "charges"]],
    ["Lines", ["lines"]],
    ["Amounts", ["vat", "totals", "checks"]],
    ["More", ["other"]]
  ];
  function renderFieldsTab() {
    // first pass finds which failures sit on a field, second pass leaves those out of the block-level lists
    state.flaggedRules = null;
    state.secFlag = {};
    const first = buildSections();
    state.flaggedRules = new Set(first.flatMap((s) => (s.html.match(/data-rules="[^"]*"/g) || []).flatMap((m) => m.slice(12, -1).split(" "))));
    state.secFlag = {};
    first.forEach((s) => { if (/flag-bad/.test(s.html)) state.secFlag[s.id] = "bad"; else if (/flag-warn/.test(s.html)) state.secFlag[s.id] = "warn"; });
    const sections = buildSections();
    const byId = new Map(sections.map((s) => [s.id, s]));
    const menu = (cls) => '<nav class="fnav ' + cls + '" aria-label="' + esc(T("Sections")) + '">' + NAV_GROUPS.map(([label, ids]) => {
      const items = ids.filter((id) => byId.has(id)).map((id) => {
        const s = byId.get(id);
        return '<a href="#sec-' + id + '" data-sec="' + id + '">' + dot(id) + esc(T(s.title)) +
          (s.count ? '<span class="n">' + s.count + "</span>" : "") + "</a>";
      }).join("");
      return items ? '<div class="glabel">' + esc(T(label)) + "</div>" + items : "";
    }).join("") + "</nav>";
    state.sectionTitles = new Map(sections.map((s) => [s.id, s.title]));
    const topIds = NAV_GROUPS.slice(0, 3).flatMap((g) => g[1]);
    const part = (list) => '<div class="fgrid">' + list.map((s) => s.html).join("") + "</div>";
    const top = sections.filter((s) => topIds.includes(s.id)), bottom = sections.filter((s) => s.id !== "lines" && !topIds.includes(s.id));
    const lines = byId.get("lines");
    $("content").innerHTML =
      '<div class="fields-layout">' + menu("fnav-side") + '<div class="fmain">' + part(top) +
      (lines ? '<div class="lines-zone">' + lines.html + "</div>" : "") + part(bottom) + "</div></div>";
    if ($("filter").value) applyFilter();
    measureStick();
    watchSections();
  }

  // Heights of the sticky bars: the tab bar, and on phones the strip of section chips under it. Scroll targets and the
  // "where am I" highlight both measure from the bottom of these.
  const horizontalNav = () => {
    const nav = document.querySelector("#content .fnav-side");
    return nav && getComputedStyle(nav).position === "sticky" && nav.offsetWidth > $("content").clientWidth * 0.9 ? nav : null;
  };
  function measureStick() {
    const bar = $("tabbar"), nav = horizontalNav();
    if (bar && bar.offsetHeight) document.documentElement.style.setProperty("--stick", bar.offsetHeight + "px");
    document.documentElement.style.setProperty("--navh", nav ? nav.offsetHeight + "px" : "0px");
  }
  window.addEventListener("resize", () => { measureStick(); watchSections(); });

  // Highlight the section you are in: the block that covers the line just under the sticky bars (the lowest one when
  // two sit side by side), or the next block below when that line is between blocks, or the last block at the very end.
  function spy() {
    spyFrame = 0;
    if ($("pFields").hidden) return;
    const cards = Array.from($("content").querySelectorAll(".card")).filter((c) => !c.hidden);
    if (!cards.length) return;
    const bar = $("tabbar"), nav = horizontalNav();
    const y = Math.max(bar ? bar.getBoundingClientRect().bottom : 0, nav ? nav.getBoundingClientRect().bottom : 0) + 16;
    // the block you just picked in the menu stays highlighted while it is the one on screen
    if (pinned.id) {
      const pc = $("sec-" + pinned.id), pr = pc && pc.getBoundingClientRect();
      if (pr && !pc.hidden && (Date.now() - pinned.at < 1300 || (pr.top <= y + 2 && pr.bottom > y))) { setActive(pinned.id); return; }
      pinned.id = null;
    }
    let best = null;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 3) best = cards[cards.length - 1];
    else {
      let topMost = -Infinity;
      cards.forEach((c) => { const r = c.getBoundingClientRect(); if (r.top <= y && r.bottom > y && r.top > topMost + 2) { best = c; topMost = r.top; } });
      if (!best) {
        const below = cards.filter((c) => c.getBoundingClientRect().top > y).sort((p, q) => p.getBoundingClientRect().top - q.getBoundingClientRect().top)[0];
        best = below || cards[cards.length - 1];
      }
    }
    if (best) setActive(best.id.replace(/^sec-/, ""));
  }
  let spyFrame = 0;
  const pinned = { id: null, at: 0 };
  // scrolling by hand (wheel, touch, keys) releases the block picked in the menu
  ["wheel", "touchmove", "keydown"].forEach((ev) => window.addEventListener(ev, () => { pinned.id = null; }, { passive: true }));
  function watchSections() { if (!spyFrame) spyFrame = requestAnimationFrame(spy); }
  window.addEventListener("scroll", watchSections, { passive: true });
  function setActive(id) {
    let on = null;
    $("content").querySelectorAll(".fnav a").forEach((a) => { const active = a.dataset.sec === id; a.classList.toggle("active", active); if (active) on = a; });
    // keep the highlighted entry in view inside the menu itself (a sideways strip on phones, a tall list on desktop)
    const nav = on && on.closest(".fnav");
    if (!nav) return;
    const n = nav.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (nav.scrollWidth > nav.clientWidth + 1) nav.scrollTo({ left: nav.scrollLeft + (r.left - n.left) - (n.width - r.width) / 2, behavior: "smooth" });
    else if (nav.scrollHeight > nav.clientHeight + 1) nav.scrollTo({ top: nav.scrollTop + (r.top - n.top) - (n.height - r.height) / 2, behavior: "smooth" });
  }
  // Folded blocks: click the heading to open or close; anything that jumps to a field opens its block first.
  function toggleCard(card, open) {
    const id = card.id.replace(/^sec-/, "");
    const willOpen = open == null ? card.classList.contains("collapsed") : open;
    card.classList.toggle("collapsed", !willOpen);
    const h = card.querySelector(":scope > h2");
    if (h) h.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (willOpen) { state.openCards.add(id); state.closedCards.delete(id); } else { state.openCards.delete(id); state.closedCards.add(id); }
    watchSections();
  }
  function openCard(el) { const c = el && el.closest && el.closest(".card.collapsed"); if (c) toggleCard(c, true); }
  $("content").addEventListener("click", (e) => {
    const h = e.target.closest('h2[data-act="card"]');
    if (h && !e.target.closest(".act")) toggleCard(h.parentElement);
  });
  $("content").addEventListener("keydown", (e) => {
    const h = e.target.closest && e.target.closest('h2[data-act="card"]');
    if (h && e.target === h && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleCard(h.parentElement); }
  });
  $("content").addEventListener("click", (e) => {
    const a = e.target.closest(".fnav a[data-sec]");
    if (!a) return;
    e.preventDefault();
    const el = $("sec-" + a.dataset.sec);
    if (el) { openCard(el); pinned.id = a.dataset.sec; pinned.at = Date.now(); el.scrollIntoView({ behavior: "smooth", block: "start" }); setActive(a.dataset.sec); }
  });

  function renderAttachments() {
    $("attCount").textContent = state.atts.length;
    $("pAtts").innerHTML = state.atts.length
      ? '<div class="atts">' + state.atts.map((a, i) => attTile(i)).join("") + "</div>"
      : '<div class="sheet"><div class="none">' + T("This document has no embedded attachments.") + "</div></div>";
  }

  function render() {
    state.checks = computeChecks();
    state.issues = mapIssues(state.checks);
    state.failed = state.checks.filter((c) => !c.ok).map((c) => ({ c, at: c.at, bts: new Set(c.only || c.text.match(/\bB[TG]-\d+\b/g) || []) }));
    collectAttachments();
    renderHero();
    renderFieldsTab();
    renderVerdict();
    renderAttachments();
    $("rawXml").innerHTML = xmlHtml(state.root.ownerDocument);
    renderEreport();
    $("showEmpty").checked = state.showEmpty;
    $("showTags").checked = state.showTags;
    $("showRaw").checked = state.raw;
    $("showFold").checked = state.foldPassing;
    updateFilterBadge();
    updateIssues();
    $("out").hidden = false;
    $("intro").hidden = true;
  }

  // The Flux 10 report built from the invoice, shown on its own tab while the E-reporting rule set is on.
  function renderEreport() {
    const on = state.ruleSets.includes("ereport") && window.EReport;
    $("tab-ereport").hidden = !on;
    if (!on) { $("ereportXml").textContent = ""; if (!$("pEreport").hidden) showTab("fields"); return; }
    try { $("ereportXml").textContent = EReport.build(state.root, state.kind).xml; } catch (e) { $("ereportXml").textContent = String(e.message || e); }
  }
  $("ereportCopy").addEventListener("click", () => { try { navigator.clipboard.writeText($("ereportXml").textContent); } catch (e) {} });
  function showTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", t.dataset.tab === name ? "true" : "false"));
    $("pFields").hidden = name !== "fields";
    $("pAtts").hidden = name !== "atts";
    $("pRaw").hidden = name !== "raw";
    $("pEreport").hidden = name !== "ereport";
    $("fieldTools").hidden = name !== "fields";
    $("filtersBtn").hidden = name !== "fields";
    syncIssueChrome();
    if (name === "fields") measureStick();
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

  // Phones: the filter box and the checkboxes sit behind a Filters button (see style.css); the badge counts what is switched on.
  function updateFilterBadge() {
    const toggles = (state.showEmpty ? 1 : 0) + (state.showTags ? 1 : 0) + (state.raw ? 1 : 0) + (state.foldPassing ? 1 : 0);
    const n = ($("filter").value.trim() ? 1 : 0) + toggles;
    const c = $("filtersCount"), d = $("displayCount");
    c.textContent = n; c.hidden = !n;
    d.textContent = toggles; d.hidden = !toggles;
  }
  $("filtersBtn").addEventListener("click", () => {
    const open = !$("tabbar").classList.contains("filters-open");
    $("tabbar").classList.toggle("filters-open", open);
    $("filtersBtn").setAttribute("aria-expanded", open ? "true" : "false");
    measureStick();
    watchSections();
  });
  ["input", "change"].forEach((ev) => $("fieldTools").addEventListener(ev, updateFilterBadge));
  // Display menu (wide screens): one button instead of four checkboxes in the toolbar
  $("displayBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !$("display").classList.contains("open");
    $("display").classList.toggle("open", open);
    $("displayBtn").setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("#display")) { $("display").classList.remove("open"); $("displayBtn").setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $("display").classList.remove("open"); $("displayBtn").setAttribute("aria-expanded", "false"); } });
  $("showFold").addEventListener("change", (e) => {
    state.foldPassing = e.target.checked;
    state.openCards.clear(); state.closedCards.clear();   // the checkbox decides again, block by block
    try { localStorage.setItem("edocxml.foldPassing", state.foldPassing ? "1" : "0"); } catch (err) {}
    if (state.root) render();
  });

  // Next / previous issue: walks through every failing field, line or block, errors first, each in page order.
  // The same list feeds the first lines of the verdict, the issues panel on wide screens and the Next issue button.
  let issueList = [], issueIdx = -1;
  const blockTitle = (el) => {
    const c = el.closest && el.closest(".card"), id = c ? c.id.replace(/^sec-/, "") : "";
    return id ? T((state.sectionTitles && state.sectionTitles.get(id)) || humanize(id)) : "";
  };
  function issueLabel(el) {
    if (el.matches(".row, .frow")) {
      const l = el.querySelector(".kl, .thl") || el.querySelector("td:first-child"), b = el.querySelector(".bt");
      return { label: l ? l.textContent.trim() : "", bt: b ? b.textContent.trim() : "" };
    }
    if (el.matches("tr.line")) { const c = el.querySelector("td"); return { label: T("Line") + " " + (c ? c.textContent.trim().split(/\s+/)[0] : ""), bt: "" }; }
    return { label: blockTitle(el), bt: "" };
  }
  function updateIssues() {
    const fails = state.checks.filter((c) => !c.ok);
    const content = $("content"), byEl = new Map(), items = [];
    const pos = (x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    [false, true].forEach((warn) => {
      const els = [];
      fails.filter((c) => !!c.warn === warn).forEach((c) => {
        let t = Array.from(content.querySelectorAll('[data-rules~="' + c.id + '"]'));
        if (!t.length && c.lines && c.lines.length) t = c.lines.map((i) => content.querySelector('tr.line[data-line="' + i + '"]')).filter(Boolean);
        if (!t.length && c.sec) t = [$("sec-" + c.sec)].filter(Boolean);
        t.forEach((el) => {
          if (!byEl.has(el)) { byEl.set(el, { el, warn, checks: [] }); els.push(el); }
          byEl.get(el).checks.push(c);
        });
      });
      els.sort(pos).forEach((el) => {
        const it = byEl.get(el), l = issueLabel(el);
        items.push(Object.assign(it, l, { block: blockTitle(el), msg: I18N.tr(it.checks[0].text), ids: it.checks.map((c) => c.id).filter((x, i, s) => s.indexOf(x) === i) }));
      });
    });
    issueList = items; issueIdx = -1;
    $("issueN").textContent = "";
    renderIssueUI();
    syncIssueChrome();
  }
  const issueBtn = (it, i, compact) => '<button type="button" class="iss ' + (it.warn ? "warn" : "bad") + '" data-issue="' + i + '"><span class="iss-top"><code>' + esc(it.ids.join(" ")) +
    "</code>" + (compact ? "" : '<span class="iss-blk">' + esc(it.block) + "</span>") + '</span><span class="iss-msg">' + esc(it.msg) + '</span><span class="iss-fld">' +
    esc(it.label) + (it.bt ? " · " + esc(it.bt) : "") + "</span></button>";
  function renderIssueUI() {
    const bad = issueList.filter((x) => !x.warn).length, warn = issueList.length - bad;
    const count = bad ? T("{n} errors", { n: bad }) : "";
    const countLine = [bad ? (bad > 1 ? T("{n} errors", { n: bad }) : T("{n} error", { n: bad })) : "", warn ? (warn > 1 ? T("{n} warnings", { n: warn }) : T("{n} warning", { n: warn })) : ""].filter(Boolean).join(" · ");
    $("ipCount").textContent = countLine;
    $("ipOpenCount").textContent = String(issueList.length);
    $("ipList").innerHTML = issueList.map((it, i) => issueBtn(it, i, false)).join("");
    const v = $("vIssues");
    if (v) v.innerHTML = issueList.slice(0, 3).map((it, i) => issueBtn(it, i, true)).join("") +
      (issueList.length > 3 ? '<button type="button" class="iss-more" data-act="checks">' + T("+{n} more", { n: issueList.length - 3 }) + "</button>" : "");
    void count;
  }
  // Panel on wide screens (closable, remembered), Next issue button elsewhere once the verdict has scrolled out of view.
  const widePanel = window.matchMedia("(min-width: 1500px)");
  let panelPref = true;
  try { panelPref = localStorage.getItem("edocxml.issuePanel") !== "0"; } catch (e) {}
  function syncIssueChrome() {
    const has = issueList.length > 0 && !$("pFields").hidden, open = widePanel.matches && has && panelPref;
    $("issuePanel").hidden = !open;
    $("ipOpen").hidden = !(widePanel.matches && has && !panelPref);
    document.body.classList.toggle("panel-open", open);
    const vb = $("verdict").getBoundingClientRect().bottom;
    $("issueNav").hidden = !has || open || (vb > 0 && issueIdx < 0);
    $("ipList").querySelectorAll(".iss").forEach((b) => b.classList.toggle("on", +b.dataset.issue === issueIdx));
  }
  let syncQueued = false;
  const queueSync = () => { if (!syncQueued) { syncQueued = true; requestAnimationFrame(() => { syncQueued = false; syncIssueChrome(); }); } };
  window.addEventListener("scroll", queueSync, { passive: true });
  window.addEventListener("resize", queueSync);
  widePanel.addEventListener("change", syncIssueChrome);
  const setPanel = (on) => { panelPref = on; try { localStorage.setItem("edocxml.issuePanel", on ? "1" : "0"); } catch (e) {} syncIssueChrome(); };
  $("ipClose").addEventListener("click", () => setPanel(false));
  $("ipOpen").addEventListener("click", () => setPanel(true));
  $("ipRules").addEventListener("click", () => { const c = $("sec-checks"); if (c) { openCard(c); flash(c); } });
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-issue]");
    if (b) goIssue(+b.dataset.issue);
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "j" || e.key === "k") stepIssue(e.key === "j" ? 1 : -1);
  });
  function goIssue(i) {
    if (!issueList[i]) return;
    issueIdx = i;
    const it = issueList[i];
    openCard(it.el);
    it.el.scrollIntoView({ behavior: "smooth", block: "center" });
    it.el.classList.add("flash");
    setTimeout(() => it.el.classList.remove("flash"), 1600);
    $("issueN").textContent = (i + 1) + "/" + issueList.length;
    syncIssueChrome();
  }
  function stepIssue(d) {
    if (!issueList.length) return;
    goIssue((issueIdx + d + issueList.length) % issueList.length);
  }
  $("issueNext").addEventListener("click", () => stepIssue(1));
  $("issuePrev").addEventListener("click", () => stepIssue(-1));

  const setFold = (n, closed) => {
    n.classList.toggle("closed", closed);
    n.querySelector(":scope > .ln > .fold").textContent = closed ? "▸" : "▾";
  };
  $("rawXml").addEventListener("click", (e) => {
    const f = e.target.closest(".fold, .more");
    if (f) { const n = f.closest(".node"); setFold(n, !n.classList.contains("closed")); }
  });
  $("pRaw").querySelector(".xmlbar").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-xml]");
    if (!b) return;
    const nodes = $("rawXml").querySelectorAll(".node");
    if (b.dataset.xml === "expand") nodes.forEach((n) => setFold(n, false));
    else if (b.dataset.xml === "collapse") {
      // Keep the document root open and fold each section below it.
      nodes.forEach((n) => {
        const parent = n.parentElement.closest(".node");
        setFold(n, !!parent && !parent.parentElement.closest(".node"));
      });
    } else if (b.dataset.xml === "copy") {
      const label = b.textContent;
      try { await navigator.clipboard.writeText(state.text || ""); b.textContent = T("Copied"); }
      catch (err) {
        const ta = document.createElement("textarea");
        ta.value = state.text || ""; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); b.textContent = T("Copied"); } catch (e2) { b.textContent = T("Copy failed"); }
        ta.remove();
      }
      setTimeout(() => { b.textContent = label; }, 1500);
    }
  });
  function goTo(el) {
    if (!el) return;
    openCard(el);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("filter").addEventListener("input", applyFilter);
  $("showEmpty").addEventListener("change", (e) => {
    state.showEmpty = e.target.checked;
    try { localStorage.setItem("edocxml.showEmpty", state.showEmpty ? "1" : "0"); } catch (err) {}
    renderFieldsTab();
  });
  // XML tags are always in the page; the checkbox only shows or hides them.
  $("showRaw").addEventListener("change", (e) => {
    state.raw = e.target.checked;
    try { localStorage.setItem("edocxml.raw", state.raw ? "1" : "0"); } catch (err) {}
    if (state.root) render();
  });
  $("showTags").addEventListener("change", (e) => {
    state.showTags = e.target.checked;
    try { localStorage.setItem("edocxml.showTags", state.showTags ? "1" : "0"); } catch (err) {}
    $("content").classList.toggle("show-tags", state.showTags);
    if ($("filter").value) applyFilter();
  });

  // Text the filter searches: XML tags count only while they are shown.
  function searchText(el) {
    const dates = Array.from(el.querySelectorAll("span[title]")).map((x) => x.getAttribute("title")).filter((t) => /^\d{4}-\d{2}-\d{2}/.test(t)).join(" ");
    if (state.showTags || !el.querySelector(".xtag")) return (el.textContent + " " + dates).toLowerCase();
    const c = el.cloneNode(true);
    c.querySelectorAll(".xtag").forEach((x) => x.remove());
    return (c.textContent + " " + dates).toLowerCase();
  }
  function applyFilter() {
    const q = $("filter").value.trim().toLowerCase();
    const content = $("content");
    content.classList.toggle("filtering", !!q);
    content.querySelectorAll(".row").forEach((r) => { r.hidden = q && !searchText(r).includes(q); });
    content.querySelectorAll("tr.line").forEach((tr) => {
      const d = content.querySelector('tr[data-detail="' + tr.dataset.line + '"]');
      const hit = !q || searchText(tr).includes(q) || (d && searchText(d).includes(q));
      tr.hidden = !hit;
      const err = content.querySelector('tr[data-errline="' + tr.dataset.line + '"]');
      if (err) err.hidden = !hit;
      if (d) { if (q && hit) setLine(tr, true); if (!hit) d.hidden = true; }
    });
    content.querySelectorAll("tr.frow:not(.line)").forEach((tr) => { tr.hidden = q && !searchText(tr).includes(q); });
    content.querySelectorAll(".sub").forEach((s) => { s.hidden = q && !s.querySelector(".row:not([hidden]), tr.frow:not([hidden])"); });
    content.querySelectorAll(".card").forEach((c) => { c.hidden = q && !c.querySelector(".row:not([hidden]), tr.frow:not([hidden])"); });
    content.querySelectorAll(".fnav a[data-sec]").forEach((a) => { const c = $("sec-" + a.dataset.sec); a.hidden = !!(c && c.hidden); });
  }

  function setLine(tr, open) {
    const d = $("content").querySelector('tr[data-detail="' + tr.dataset.line + '"]');
    if (!d) return;
    d.hidden = !open;
    tr.classList.toggle("open", open);
    tr.setAttribute("aria-expanded", open ? "true" : "false");
  }

  $("out").addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#att-"]');
    if (link) {
      e.preventDefault();
      showTab("atts");
      const el = $(link.getAttribute("href").slice(1));
      if (el) { goTo(el); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600); }
      return;
    }
    const btn = e.target.closest("[data-act]");
    if (btn) {
      const act = btn.dataset.act;
      if (act === "preview") preview(+btn.dataset.att);
      else if (act === "download") download(+btn.dataset.att);
      else if (act === "checks") { showTab("fields"); goTo($("sec-checks")); }
      else if (act === "goline") {
        showTab("fields");
        const row = $("content").querySelector('tr.line[data-line="' + btn.dataset.line + '"]');
        if (row) { row.hidden = false; setLine(row, true); flash(row); }
      }
      else if (act === "gosec") { showTab("fields"); flash($("sec-" + btn.dataset.sec)); }
      else if (act === "goerr") goToCheck(state.checks[+btn.dataset.check]);
      else if (act === "expand" || act === "collapse") $("content").querySelectorAll("tr.line:not([hidden])").forEach((tr) => setLine(tr, act === "expand"));
      return;
    }
    const tr = e.target.closest("tr.line");
    if (tr && !e.target.closest("a")) setLine(tr, !tr.classList.contains("open"));
  });
  $("out").addEventListener("change", (e) => {
    const box = e.target.closest && e.target.closest("input[data-ruleset]");
    if (!box) return;
    const id = box.dataset.ruleset;
    state.ruleSets = box.checked ? state.ruleSets.concat(id) : state.ruleSets.filter((x) => x !== id);
    render();
    goTo($("sec-checks"));
  });
  $("out").addEventListener("keydown", (e) => {
    const tr = e.target.closest && e.target.closest("tr.line");
    if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setLine(tr, !tr.classList.contains("open")); }
    const err = e.target.closest && e.target.closest('[data-act="goerr"]');
    if (err && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); goToCheck(state.checks[+err.dataset.check]); }
  });

  // ---------- Loading ----------
  const lbMsg = $("lbMsg"), drop = $("drop"), pasteArea = $("pasteArea"), pasteBtn = $("pasteBtn");
  // The message is kept as a function so it can be shown again in another language.
  let lastMsg = null;
  function setMsg(html, bad) {
    lastMsg = typeof html === "function" ? html : null;
    lbMsg.innerHTML = lastMsg ? lastMsg() : html;
    lbMsg.className = "lb-msg" + (bad ? " bad" : "");
  }

  function load(text, name) {
    text = String(text || "").replace(/^﻿/, "").trim();
    if (!text) return false;
    // XML copied from a browser's tree view has a "-" before each expandable tag (-<cac:Party>); drop it.
    let dashes = 0;
    text = text.replace(/^([ \t]*)-[ \t]*(?=<)/gm, (m, indent) => { dashes++; return indent; });
    // The same view shows &amp; as a bare "&", which isn't valid XML; escape any "&" that doesn't start an entity.
    let amps = 0;
    text = text.replace(/&(?!(?:[a-zA-Z_][\w.-]*|#\d+|#x[0-9a-fA-F]+);)/g, () => { amps++; return "&amp;"; });
    if (!text.startsWith("<")) {
      // Accept a Base64-encoded XML too.
      try {
        const bin = atob(text.replace(/\s+/g, ""));
        const dec = new TextDecoder("utf-8").decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))).replace(/^﻿/, "").trim();
        if (dec.startsWith("<")) text = dec;
      } catch (e) {}
    }
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const err = doc.getElementsByTagName("parsererror")[0];
    if (err) {
      const why = esc((err.textContent || "").split("\n").filter(Boolean)[0] || "");
      setMsg(() => "<b>" + T("Not valid XML.") + "</b> " + why, true);
      return false;
    }
    let root = doc.documentElement, wrapped = "";
    const kinds = ["Invoice", "CreditNote"];
    if (!kinds.includes(root.localName)) {
      const found = Array.from(root.getElementsByTagName("*")).find((e) => kinds.includes(e.localName));
      if (!found) {
        const name = root.localName, cii = /CrossIndustryInvoice/.test(name);
        setMsg(() => "<b>" + T("No UBL Invoice or CreditNote found.") + "</b> " + esc(T("Root element is <{name}>.", { name })) +
          (cii ? " " + T("This is a CII (UN/CEFACT) invoice; this viewer reads UBL.") : ""), true);
        return false;
      }
      wrapped = root.localName; root = found;
    }
    // Extra rule sets (PEPPOL, France …) start from what the CustomizationID says; the Checks card can change them.
    Object.assign(state, { root, kind: root.localName, name: name || "", size: text.length, wrapped, text, ruleSets: EN16931.detect(root) });
    $("filter").value = "";
    render();
    showTab("fields");
    drop.classList.add("loaded");
    const size = formatSize(new Blob([text]).size);
    setMsg(() => "<b>" + esc(state.name || T("Pasted XML")) + "</b> · " + size + " · " +
      T(state.kind === "CreditNote" ? "credit note" : "invoice") +
      (dashes ? " · " + T("removed {n} leading “-” from tags", { n: dashes }) : "") +
      (amps ? " · " + esc(T("escaped {n} bare “&”", { n: amps })) : ""));
    $("clearBtn").hidden = false;
    $("sampleBtn").hidden = true;
    pasteArea.hidden = true; pasteArea.value = ""; pasteBtn.setAttribute("aria-expanded", "false");
    return true;
  }

  function clearAll() {
    closeViewer();
    state.cache.forEach((c) => c.url && URL.revokeObjectURL(c.url));
    Object.assign(state, { root: null, kind: null, atts: [], attIndex: new Map(), cache: new Map() });
    $("out").hidden = true; $("intro").hidden = false;
    ["content", "hero", "verdict", "pAtts", "rawXml"].forEach((id) => { $(id).innerHTML = ""; });
    $("filter").value = "";
    pasteArea.value = "";
    drop.classList.remove("loaded");
    $("clearBtn").hidden = true;
    $("sampleBtn").hidden = false;
    setMsg(() => T(window.matchMedia("(hover: none)").matches ? "Open an XML file or paste it. Nothing leaves your browser." : "Drop a UBL invoice or credit note XML here, or paste it anywhere with Ctrl+V."));
  }

  // A small invoice that follows the EN 16931 rules, so a first visit shows a green verdict.
  const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID><cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID><cbc:ID>INV-2026-0042</cbc:ID><cbc:IssueDate>2026-10-01</cbc:IssueDate><cbc:DueDate>2026-10-31</cbc:DueDate><cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode><cbc:BuyerReference>PO-7781</cbc:BuyerReference><cac:AccountingSupplierParty><cac:Party><cbc:EndpointID schemeID="EM">billing@example-supplies.test</cbc:EndpointID><cac:PartyName><cbc:Name>Example Supplies GmbH</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>Hauptstrasse 12</cbc:StreetName><cbc:CityName>Berlin</cbc:CityName><cbc:PostalZone>10115</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>DE123456789</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>Example Supplies GmbH</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty><cac:AccountingCustomerParty><cac:Party><cbc:EndpointID schemeID="EM">accounts@sample-buyer.test</cbc:EndpointID><cac:PartyName><cbc:Name>Sample Buyer SRL</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>Via Roma 5</cbc:StreetName><cbc:CityName>Milano</cbc:CityName><cbc:PostalZone>20121</cbc:PostalZone><cac:Country><cbc:IdentificationCode>IT</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyLegalEntity><cbc:RegistrationName>Sample Buyer SRL</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty><cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>DE89370400440532013000</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans><cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38.00</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">200.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">38.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">200.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">238.00</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">238.00</cbc:PayableAmount></cac:LegalMonetaryTotal><cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">4</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>Office chair, ergonomic</cbc:Name><cac:SellersItemIdentification><cbc:ID>CH-100</cbc:ID></cac:SellersItemIdentification><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">50.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine></Invoice>`;
  $("sampleBtn").addEventListener("click", () => load(SAMPLE_XML, "sample-invoice.xml"));

  function loadFile(f) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => load(String(r.result), f.name);
    r.onerror = () => setMsg(() => esc(T("Couldn't read {name}.", { name: f.name })), true);
    r.readAsText(f);
  }

  $("pickBtn").addEventListener("click", () => $("file").click());
  $("file").addEventListener("change", (e) => { loadFile(e.target.files[0]); e.target.value = ""; });
  $("clearBtn").addEventListener("click", clearAll);
  pasteBtn.addEventListener("click", async () => {
    // One tap: read straight from the clipboard and replace whatever is open (the browser may show its own
    // "Paste" prompt first, e.g. on iPhone). Only if that is refused does the paste box open, always empty.
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) { if (!load(text, "")) pasteArea.value = ""; return; }
        setMsg(() => T("The clipboard is empty. Copy the XML first, then click Paste text."), true);
        return;
      } catch (e) {}
    }
    pasteArea.hidden = !pasteArea.hidden;
    pasteBtn.setAttribute("aria-expanded", pasteArea.hidden ? "false" : "true");
    if (!pasteArea.hidden) { pasteArea.value = ""; pasteArea.focus(); }
  });
  // old text in the box is selected when it gets focus, so pasting replaces it
  pasteArea.addEventListener("focus", () => pasteArea.select());
  let t;
  pasteArea.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => load(pasteArea.value, ""), 250); });

  // Paste anywhere (except into the filter box or the paste area itself).
  document.addEventListener("paste", (e) => {
    const tgt = e.target;
    if (tgt === pasteArea || (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable))) return;
    const dt = e.clipboardData;
    if (!dt) return;
    if (dt.files && dt.files.length) { e.preventDefault(); loadFile(dt.files[0]); return; }
    const text = dt.getData("text");
    if (text && text.trim()) { e.preventDefault(); load(text, ""); }
  });

  // Language: redraw everything in the new one, keeping the open tab and scroll position.
  const langBtns = $("lang").querySelectorAll("[data-lang]");
  const markLang = () => langBtns.forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === I18N.lang ? "true" : "false"));
  langBtns.forEach((b) => b.addEventListener("click", () => I18N.set(b.dataset.lang)));
  markLang();
  // Light / dark: follows the device until the button is used. One tap switches to the other theme; the choice is remembered,
  // and choosing the device's own theme again goes back to following it.
  const THEME_LABEL = { light: "Theme: light", dark: "Theme: dark" };
  const deviceDark = window.matchMedia("(prefers-color-scheme: dark)");
  let themePref = "system";
  try { const t = localStorage.getItem("tools.theme"); if (t === "light" || t === "dark") themePref = t; } catch (err) {}
  const effectiveTheme = () => (themePref === "system" ? (deviceDark.matches ? "dark" : "light") : themePref);
  function applyTheme() {
    const root = document.documentElement;
    if (themePref === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", themePref);
    const b = $("themeBtn"), t = effectiveTheme();
    b.dataset.pref = t;
    b.setAttribute("aria-label", T(THEME_LABEL[t]));
    b.title = T(THEME_LABEL[t]);
  }
  $("themeBtn").addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    themePref = next === (deviceDark.matches ? "dark" : "light") ? "system" : next;
    try { if (themePref === "system") localStorage.removeItem("tools.theme"); else localStorage.setItem("tools.theme", themePref); } catch (err) {}
    applyTheme();
  });
  if (deviceDark.addEventListener) deviceDark.addEventListener("change", applyTheme);
  applyTheme();

  I18N.onChange(() => {
    applyTheme();
    markLang();
    setDisplayNames();
    if (lastMsg) lbMsg.innerHTML = lastMsg();
    if (!state.root) return;
    const tab = document.querySelector('.tab[aria-selected="true"]');
    const y = window.scrollY;
    render();
    showTab(tab ? tab.dataset.tab : "fields");
    window.scrollTo(0, y);
  });
  I18N.applyStatic();
  setMsg(() => T(window.matchMedia("(hover: none)").matches ? "Open an XML file or paste it. Nothing leaves your browser." : "Drop a UBL invoice or credit note XML here, or paste it anywhere with Ctrl+V."));
  $("content").classList.toggle("show-tags", state.showTags);
  $("showTags").checked = state.showTags;
  $("showRaw").checked = state.raw;

  // Drop anywhere on the page.
  let depth = 0;
  window.addEventListener("dragenter", (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) { depth++; drop.classList.add("dragging"); } });
  window.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove("dragging"); });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault(); depth = 0; drop.classList.remove("dragging");
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
})();
