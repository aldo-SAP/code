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
  const state = { root: null, kind: null, name: "", size: 0, wrapped: "", showEmpty: false, showTags: false, atts: [], attIndex: new Map(), cache: new Map() };
  try { state.showEmpty = localStorage.getItem("edocxml.showEmpty") === "1"; state.showTags = localStorage.getItem("edocxml.showTags") === "1"; } catch (e) {}

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
    if (n === null) return esc(raw) + (cur ? ' <span class="unit">' + esc(cur) + "</span>" : "");
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
  const xtag = (tag) => (tag ? '<code class="xtag">' + esc(tag) + "</code>" : "");
  const bts = (bt) => (bt ? bt.split("/").map((b) => b.trim()).filter(Boolean) : []);
  // Failed checks that point at a field: at its element, or naming its BT number for this part of the document
  // (ctx), so a failure on line 2 does not mark the same BT on the other lines. Returns { lvl, ids } or null.
  function fieldFlag(ctx, bt, els) {
    const own = bts(bt);
    const hits = (state.failed || []).filter((f) => els.some((e) => f.at.includes(e)) ||
      (own.some((b) => f.bts.has(b)) && (!ctx || f.at.some((a) => a === ctx || a.contains(ctx) || ctx.contains(a)))));
    if (!hits.length) return null;
    return { lvl: hits.some((f) => !f.c.warn) ? "bad" : "warn", ids: hits.map((f) => f.c.id).filter((id, i, a) => a.indexOf(id) === i) };
  }
  // A required field that is missing counts as an error even when no rule set names it.
  const requiredFlag = (ctx, bt) => (ctx && bts(bt).some((b) => REQUIRED.has(b)) ? { lvl: "bad", ids: [] } : null);
  // A group that is missing altogether still shows when a failed check names one of its fields.
  const specFlagged = (spec, role) => spec.some((f) => fieldFlag(null, btFor(f[2], role), []));
  const flagTitle = (flag) => (flag.ids.length ? T("Fails {ids}", { ids: flag.ids.join(", ") }) : T("Required field"));
  const missing = () => '<span class="missing">' + T("Missing") + "</span>";
  function row(label, bt, valueHtml, cls, tag, flag) {
    if (flag) cls = (cls ? cls + " " : "") + "flag-" + flag.lvl;
    return '<div class="row' + (cls ? " " + cls : "") + '"' + (flag ? ' title="' + esc(flagTitle(flag)) + '"' : "") + '><div class="k">' + esc(T(label)) +
      (bt ? '<span class="bt">' + esc(bt) + "</span>" : "") + xtag(tag) + '</div><div class="v">' + valueHtml + "</div></div>";
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
    // Failed rules for this block, in red right under its name (Lines shows them per row, Checks lists them all).
    const iss = id !== "lines" && id !== "checks" && state.issues.secs[id];
    const errs = iss ? '<ul class="checks card-errs">' + iss.list.map((c) => checkLi(c, false)).join("") + "</ul>" : "";
    return '<section class="card' + (opts.full ? " full" : "") + '" id="sec-' + id + '"><h2>' + dot(id) + esc(T(title)) +
      (opts.count != null ? '<span class="n">' + opts.count + "</span>" : "") + (opts.act ? '<span class="act">' + opts.act + "</span>" : "") +
      "</h2>" + errs + (body || '<div class="none">' + T("Not present in this document.") + "</div>") + "</section>";
  }
  function sub(title, body) { return '<div class="sub"><h3>' + esc(T(title)) + "</h3>" + body + "</div>"; }

  // A line's allowances and charges: one table each, a row per entry and their total underneath,
  // then quantity × price + charges − allowances worked out against the line net amount.
  const money = (n) => n.toLocaleString(I18N.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function lineAcTables(ln, used) {
    const acs = byPath(ln, "AllowanceCharge");
    acs.forEach((ac) => markDeep(ac, used));
    const cur = (first(ln, "LineExtensionAmount") || { getAttribute: () => "" }).getAttribute("currencyID") || "";
    const sums = {};
    const table = (role) => {
      const list = acs.filter((ac) => (val(ac, "ChargeIndicator") === "true") === (role === "C"));
      sums[role] = list.reduce((s, ac) => s + (num(val(ac, "Amount")) || 0), 0);
      if (!list.length) return "";
      // Columns with nothing in them are left out (unless empty fields are shown).
      const cols = LINE_AC_SPEC.filter(([path]) => path !== "ChargeIndicator" && (state.showEmpty || path === "Amount" || list.some((ac) => has(ac, path))));
      const isNum = (path) => path === "Amount" || path === "BaseAmount" || path === "MultiplierFactorNumeric";
      let more = "";
      const rows = list.map((ac, j) => {
        const uu = new Set(byPath(ac, "ChargeIndicator"));
        const tds = cols.map(([path]) => {
          const el = first(ac, path);
          if (el) uu.add(el);
          return '<td' + (isNum(path) ? ' class="r"' : "") + ">" + (!el ? "—" : path === "Amount" || path === "BaseAmount" ? fmtAmount(txt(el), "") : renderValue(el)) + "</td>";
        }).join("");
        const x = extras([ac], uu);
        if (x) more += sub(T(role === "C" ? "Charge {n}" : "Allowance {n}", { n: j + 1 }), x);
        return "<tr><td>" + (j + 1) + "</td>" + tds + "</tr>";
      }).join("");
      const amtCol = cols.findIndex(([path]) => path === "Amount");
      const foot = "<tr><td" + (amtCol ? ' colspan="' + (amtCol + 1) + '"' : "") + ">" + T(role === "C" ? "Total charges" : "Total allowances") + "</td>" +
        '<td class="r">' + money(sums[role]) + ' <span class="unit">' + esc(cur) + "</span></td>" +
        (cols.length - amtCol - 1 > 0 ? '<td colspan="' + (cols.length - amtCol - 1) + '"></td>' : "") + "</tr>";
      const head = "<tr><th>#</th>" + cols.map(([path, label, bt]) => "<th" + (isNum(path) ? ' class="r"' : "") + ">" + esc(T(label)) +
        '<span class="bt">' + esc(btFor(bt, role)) + "</span>" + xtag("cac:AllowanceCharge/" + guessTag(null, path)) + "</th>").join("") + "</tr>";
      return '<div class="sub ac-block"><h3>' + T(role === "C" ? "Line charges" : "Line allowances") + " · " + list.length + "</h3>" +
        '<div class="tablewrap"><table class="ac"><thead>' + head + "</thead><tbody>" + rows + "</tbody><tfoot>" + foot + "</tfoot></table></div>" + more + "</div>";
    };
    const html = table("A") + table("C");
    if (!acs.length) return html;
    // Quantity × net price / base quantity + charges − allowances = line net amount (BT-131).
    const qty = num(val(ln, "InvoicedQuantity") || val(ln, "CreditedQuantity")), price = num(val(ln, "Price/PriceAmount"));
    const baseQty = has(ln, "Price/BaseQuantity") ? num(val(ln, "Price/BaseQuantity")) : 1, net = num(val(ln, "LineExtensionAmount"));
    if (qty === null || price === null || !baseQty) return html;
    const gross = Math.round(qty * price / baseQty * 100) / 100, calc = Math.round((gross + sums.C - sums.A) * 100) / 100;
    const ok = net !== null && Math.abs(calc - net) < 0.02;
    const r = (label, amount, cls) => '<tr' + (cls ? ' class="' + cls + '"' : "") + '><td class="k">' + label + '</td><td class="r">' + amount + '</td><td class="cur">' + esc(cur) + "</td></tr>";
    return html + '<div class="sub ac-block"><h3>' + T("Line net amount") + '</h3><table class="tot ac-calc"><tbody>' +
      r(T(baseQty !== 1 ? "Quantity × net price / base quantity" : "Quantity × net price") + ' <span class="dec">(' + esc(String(qty)) + " × " + money(price) + (baseQty !== 1 ? " / " + baseQty : "") + ")</span>", money(gross)) +
      r(T("+ Total charges"), money(sums.C)) + r(T("− Total allowances"), money(sums.A)) +
      r(T("= Calculated"), money(calc), "key") +
      r(T("Line net amount in the file") + '<span class="bt">BT-131</span>', net === null ? "—" : money(net) +
        (ok ? ' <span class="ac-ok">✓</span>' : ' <span class="ac-bad">✗ ' + T("off by {amount}", { amount: money(Math.abs(calc - net)) }) + "</span>"), ok ? "" : "bad") +
      "</tbody></table></div>";
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
          body = '<div class="tablewrap"><table><thead><tr><th>#</th><th>' + T("Invoice reference") + ' <span class="bt">BT-25</span>' + xtag("cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID") + "</th>" +
            "<th>" + T("Issue date") + ' <span class="bt">BT-26</span>' + xtag("cac:BillingReference/cac:InvoiceDocumentReference/cbc:IssueDate") + "</th></tr></thead><tbody>" +
            docs.map((d, i) => {
              const id = first(d, "ID"), date = first(d, "IssueDate");
              [id, date].forEach((e) => e && used.add(e));
              const cell = (e, bt) => { const f = fieldFlag(d, bt, e ? [e] : []) || (e ? null : { lvl: "bad", ids: [] });
                return "<td" + (f ? ' class="flag-' + f.lvl + '" title="' + esc(flagTitle(f)) + '"' : "") + ">" + (e ? renderValue(e) : f ? missing() : "—") + "</td>"; };
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
        let body = els.length ? "" : renderFields(null, spec, role, new Set());
        els.forEach((el, i) => {
          const u = new Set([first(el, "ChargeIndicator")]);
          const inner = renderFields(el, spec, role, u) + extras([el], u);
          body += els.length > 1 ? sub(T(single + " {n}", { n: i + 1 }), inner) : inner;
        });
        out.push({ id, title, html: card(id, title, body) });
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
          const th = (label, bt, tag, r) => "<th" + (r ? ' class="r"' : "") + ">" + T(label) + ' <span class="bt">' + bt + "</span>" + xtag("cac:TaxSubtotal/" + tag) + "</th>";
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
          (flag ? ' title="' + esc(flagTitle(flag)) + '"' : "") + '><td class="k">' + esc(T(label)) + '<span class="bt">' + bt + "</span>" +
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
          th("VAT", "cac:Item/cac:ClassifiedTaxCategory") + th("Net amount", "cbc:LineExtensionAmount", true) + "</tr></thead><tbody>";
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
          body += '<tr class="line frow' + (nBad ? " has-err" : "") + '" data-line="' + i + '" tabindex="0" aria-expanded="false"><td>' + esc(val(ln, "ID") || i + 1) + flag + "</td><td>" +
            esc(val(ln, "Item/Name") || "—") + (sid ? '<div class="small">' + esc(sid) + "</div>" : "") + '</td><td class="r">' +
            (q ? esc(txt(q)) + (unit ? ' <span class="unit" title="' + esc(UNITS[unit] || unit) + '">' + esc(unit) + "</span>" : "") : "—") +
            '</td><td class="r">' + (price ? fmtAmount(txt(price), "") : "—") + "</td><td>" + esc(cat) + (pct ? " " + esc(pct) + " %" : "") +
            '</td><td class="r">' + (net ? renderValue(net) : "—") + "</td></tr>" + lineErrRow(i, 6) +
            '<tr class="detail" data-detail="' + i + '" hidden><td colspan="6"><div class="detail-grid">' + detail + "</div></td></tr>";
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
    const cls = bad.length ? "bad" : warn.length ? "warn" : "ok";
    const title = bad.length ? T("Fails {ids}", { ids: bad.join(", ") }) : warn.length ? T("Warning {ids}", { ids: warn.join(", ") }) : T("No rule fails here");
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

  function renderHero() {
    const R = state.root, kind = state.kind;
    const code = val(R, kind === "CreditNote" ? "CreditNoteTypeCode" : "InvoiceTypeCode");
    const partyName = (tag) => val(R, tag + "/Party/PartyLegalEntity/RegistrationName") || val(R, tag + "/Party/PartyName/Name");
    const pay = first(R, "LegalMonetaryTotal/PayableAmount");
    const issue = val(R, "IssueDate"), due = val(R, "DueDate") || val(R, "PaymentMeans/PaymentDueDate");
    const di = parseDate(issue), dd = parseDate(due);
    const days = di && dd ? Math.round((dd - di) / 86400000) : null;
    const checks = state.checks, bad = checks.filter((c) => !c.ok && !c.warn).length;
    $("hero").innerHTML =
      '<div class="hero-main"><div class="eyebrow"><span class="badge' + (kind === "CreditNote" ? " cn" : "") + '">' + T(kind === "CreditNote" ? "Credit note" : "Invoice") + "</span>" +
      (code ? "<span>" + esc(code) + (DOC_TYPES[code] ? " · " + esc(T(DOC_TYPES[code])) : "") + "</span>" : "") +
      (state.wrapped ? "<span>" + esc(T("inside <{name}>", { name: state.wrapped })) + "</span>" : "") + "</div>" +
      '<div class="docno">' + esc(val(R, "ID") || T("(no number)")) + "</div>" +
      '<div class="flow"><div class="who from"><small>' + T("From") + "</small><span>" + esc(partyName("AccountingSupplierParty") || T("Unknown seller")) + "</span></div>" +
      '<span class="arrow" aria-hidden="true">→</span><div class="who to"><small>' + T("To") + "</small><span>" + esc(partyName("AccountingCustomerParty") || T("Unknown buyer")) + "</span></div></div></div>" +
      '<div class="hero-amount">' +
      (pay ? '<div class="lbl">' + T(kind === "CreditNote" ? "Amount credited" : "Amount due") + '</div><div class="big">' + fmtMoney(txt(pay)) + '<span class="cur">' + esc(pay.getAttribute("currencyID") || "") + "</span></div>" : "") +
      (due ? '<div class="due">' + T("Due") + " <b>" + fmtDate(due) + "</b>" + (days !== null ? " · " + T("{n} days after issue", { n: days }) : "") + "</div>" : "") +
      (checks.length ? '<button type="button" class="pill ' + (bad ? "bad" : "ok") + '" data-act="checks">' +
        (bad ? T("✗ {bad} of {n} rules fail", { bad, n: checks.length }) : T("✓ {n} rules pass", { n: checks.length })) + "</button>" : "") + "</div>";

    const pm = first(R, "PaymentMeans/PaymentMeansCode");
    const pmText = pm ? (PAY_MEANS[txt(pm)] ? T(PAY_MEANS[txt(pm)]) : pm.getAttribute("name") || txt(pm)) : "";
    const ps = val(R, "InvoicePeriod/StartDate"), pe = val(R, "InvoicePeriod/EndDate");
    const lines = byPath(R, kind === "CreditNote" ? "CreditNoteLine" : "InvoiceLine");
    const facts = [
      ["Issued", issue ? fmtDate(issue) : "", val(R, "IssueTime")],
      ["Invoicing period", ps || pe ? fmtDate(ps) + " – " + fmtDate(pe) : "", ""],
      ["Purchase order", esc(val(R, "OrderReference/ID")), val(R, "BuyerReference") ? T("Buyer ref. {ref}", { ref: val(R, "BuyerReference") }) : ""],
      ["Buyer reference", first(R, "OrderReference/ID") ? "" : esc(val(R, "BuyerReference")), ""],
      ["Payment", esc(pmText), val(R, "PaymentTerms/Note")],
      ["Lines", lines.length ? String(lines.length) : "", (state.atts.length ? T(state.atts.length > 1 ? "{n} attachments" : "{n} attachment", { n: state.atts.length }) : "")],
      ["Currency", esc(val(R, "DocumentCurrencyCode")), currencyNames && val(R, "DocumentCurrencyCode") ? (function () { try { return currencyNames.of(val(R, "DocumentCurrencyCode")); } catch (e) { return ""; } })() : ""]
    ].filter((f) => f[1]);
    $("facts").innerHTML = facts.map((f) => '<div class="fact"><div class="l">' + esc(T(f[0])) + '</div><div class="v">' + f[1] + "</div>" + (f[2] ? '<div class="s">' + esc(f[2]) + "</div>" : "") + "</div>").join("");
  }

  function partyBlock(el, cls, roleLabel) {
    if (!el) return '<div class="party ' + cls + '"><div class="role">' + esc(T(roleLabel)) + '</div><div class="pname muted">' + T("Not provided") + "</div></div>";
    const legal = val(el, "PartyLegalEntity/RegistrationName"), trade = val(el, "PartyName/Name");
    const a = first(el, "PostalAddress");
    const addr = a ? [val(a, "StreetName"), val(a, "AdditionalStreetName")].concat(byPath(a, "AddressLine/Line").map(txt),
      [[val(a, "PostalZone"), val(a, "CityName")].filter(Boolean).join(" "), val(a, "CountrySubentity"), countryName(val(a, "Country/IdentificationCode"))]).filter(Boolean).join("\n") : "";
    const items = [];
    byPath(el, "PartyTaxScheme").forEach((pts) => {
      const scheme = val(pts, "TaxScheme/ID");
      items.push([scheme && scheme !== "VAT" ? "Tax number" : "VAT number", esc(val(pts, "CompanyID"))]);
    });
    const lid = first(el, "PartyLegalEntity/CompanyID");
    if (lid) items.push(["Legal ID", esc(txt(lid)) + schemeLabel(lid)]);
    byPath(el, "PartyIdentification/ID").forEach((id) => items.push(["Identifier", esc(txt(id)) + schemeLabel(id)]));
    const ep = first(el, "EndpointID");
    if (ep) items.push(["Electronic address", esc(txt(ep)) + schemeLabel(ep)]);
    items.push(["Legal form", esc(val(el, "PartyLegalEntity/CompanyLegalForm"))]);
    const contact = [val(el, "Contact/Name"), val(el, "Contact/Telephone"), val(el, "Contact/ElectronicMail")].filter(Boolean).map(esc).join(" · ");
    items.push(["Contact", contact]);
    return '<div class="party ' + cls + '"><div class="role">' + esc(T(roleLabel)) + '</div><div class="pname">' + esc(legal || trade || T("(no name)")) + "</div>" +
      (legal && trade && trade !== legal ? '<div class="trade">' + esc(T("Trading as {name}", { name: trade })) + "</div>" : "") +
      (addr ? '<div class="addr">' + esc(addr) + "</div>" : "") + kv(items) + "</div>";
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

  function renderOverview() {
    const R = state.root, kind = state.kind;
    const docCur = val(R, "DocumentCurrencyCode");
    let h = '<div class="sheet">';

    // Parties
    h += '<div class="parties">' + partyBlock(first(R, "AccountingSupplierParty/Party"), "from", "From · Seller") +
      partyBlock(first(R, "AccountingCustomerParty/Party"), "to", "To · Buyer") + "</div>";
    const payee = first(R, "PayeeParty"), rep = first(R, "TaxRepresentativeParty");
    if (payee || rep) h += '<div class="parties" style="margin-top:14px">' + (payee ? partyBlock(payee, "from", "Payee (paid to)") : "") + (rep ? partyBlock(rep, "from", "Seller tax representative") : "") + "</div>";

    // Notes
    const notes = byPath(R, "Note").map(txt).filter(Boolean);
    if (notes.length) {
      h += '<h3 class="sh">' + T("Notes") + '</h3><div class="notes">' + notes.map((n) => {
        const m = n.match(/^#([A-Z0-9]{2,4})#/);
        return '<div class="note">' + (m ? '<span class="tag" title="' + esc(T("Subject code {code}", { code: m[1] })) + '">' + esc(NOTE_SUBJECT[m[1]] ? T(NOTE_SUBJECT[m[1]]) : m[1]) + "</span>" : "") + esc(m ? n.slice(m[0].length) : n) + "</div>";
      }).join("") + "</div>";
    }

    // Lines
    const lines = byPath(R, kind === "CreditNote" ? "CreditNoteLine" : "InvoiceLine");
    h += '<h3 class="sh">' + T("Lines") + (lines.length ? " · " + lines.length : "") + "</h3>";
    if (lines.length) {
      h += '<div class="tablewrap"><table class="inv"><thead><tr><th></th><th>' + T("Description") + '</th><th class="r">' + T("Quantity") + '</th><th class="r">' + T("Unit price") +
        "</th><th>" + T("VAT") + '</th><th class="r">' + T("Amount") + "</th></tr></thead><tbody>";
      lines.forEach((ln, i) => {
        const q = first(ln, "InvoicedQuantity") || first(ln, "CreditedQuantity");
        const unit = q ? q.getAttribute("unitCode") || "" : "";
        const base = first(ln, "Price/BaseQuantity");
        const subs = [val(ln, "Item/Description"), val(ln, "Item/SellersItemIdentification/ID") ? T("Item {id}", { id: val(ln, "Item/SellersItemIdentification/ID") }) : "",
          val(ln, "OrderLineReference/LineID") && val(ln, "OrderLineReference/LineID") !== "0" ? T("PO line {id}", { id: val(ln, "OrderLineReference/LineID") }) : "",
          val(ln, "InvoicePeriod/StartDate") ? T("Period {from} – {to}", { from: val(ln, "InvoicePeriod/StartDate"), to: val(ln, "InvoicePeriod/EndDate") }) : ""].filter(Boolean);
        byPath(ln, "AllowanceCharge").forEach((ac) => {
          const charge = val(ac, "ChargeIndicator") === "true";
          const amount = num(val(ac, "Amount")) !== null ? money(num(val(ac, "Amount"))) : val(ac, "Amount");
          const reason = val(ac, "AllowanceChargeReason") || (AC_REASON[val(ac, "AllowanceChargeReasonCode")] ? T(AC_REASON[val(ac, "AllowanceChargeReasonCode")]) : "");
          subs.push(T(charge ? "Charge + {amount}" : "Allowance − {amount}", { amount }) + (reason ? " (" + reason + ")" : ""));
        });
        const cat = val(ln, "Item/ClassifiedTaxCategory/ID"), pct = val(ln, "Item/ClassifiedTaxCategory/Percent");
        const iss = state.issues.lines[i], nBad = iss ? iss.bad.size : 0;
        h += '<tr' + (nBad ? ' class="has-err"' : "") + '><td class="pos">' + esc(val(ln, "ID") || i + 1) +
          (nBad ? '<button type="button" class="lerr" data-act="goline" data-line="' + i + '" title="' + esc([...iss.bad].join(", ") + " · " + T("show in Fields")) + '">✗ ' + nBad + "</button>" : "") +
          '</td><td><div class="iname">' + esc(val(ln, "Item/Name") || "—") + "</div>" +
          subs.map((s) => '<div class="isub">' + esc(s) + "</div>").join("") + '</td><td class="r">' + (q ? esc(txt(q)) + (unit ? ' <span class="unit" title="' + esc(unit) + '">' + esc(UNITS[unit] ? T(UNITS[unit]) : unit) + "</span>" : "") : "—") +
          '</td><td class="r">' + fmtMoney(val(ln, "Price/PriceAmount")) + (base && txt(base) !== "1" ? '<div class="isub">' + esc(T("per {n}", { n: txt(base) })) + "</div>" : "") +
          "</td><td>" + (cat || pct ? '<span class="vat-chip" title="' + esc(VAT_CAT[cat] ? T(VAT_CAT[cat]) : cat) + '">' + (pct ? esc(pct) + " %" : "") + (cat ? " " + esc(cat) : "") + "</span>" : "") +
          '</td><td class="r">' + fmtMoney(val(ln, "LineExtensionAmount")) + "</td></tr>" + lineErrRow(i, 6);
      });
      h += "</tbody></table></div>";
    } else h += '<div class="none">' + T("No lines in this document.") + "</div>";

    // Totals block
    const lmt = first(R, "LegalMonetaryTotal");
    if (lmt) {
      const t = (label, raw, cls, sign) => (raw === "" ? "" : '<div class="t' + (cls ? " " + cls : "") + '"><span>' + T(label) + "</span><span>" + (sign || "") + fmtMoney(raw) + "</span></div>");
      const tt = byPath(R, "TaxTotal").find((x) => { const a = first(x, "TaxAmount"); return a && (!docCur || a.getAttribute("currencyID") === docCur); });
      let vatRows = "";
      if (tt) {
        const subs = byPath(tt, "TaxSubtotal");
        if (subs.length) subs.forEach((st) => {
          const cat = val(st, "TaxCategory/ID"), pct = val(st, "TaxCategory/Percent");
          vatRows += t(T("VAT {rate}", { rate: pct ? esc(pct) + " % " : "" }) + (cat ? '<span class="vat-chip" title="' + esc(VAT_CAT[cat] ? T(VAT_CAT[cat]) : cat) + '">' + esc(cat) + "</span>" : "") +
            ' <span class="muted">' + T("on {amount}", { amount: fmtMoney(val(st, "TaxableAmount")) }) + "</span>", val(st, "TaxAmount"));
        });
        else vatRows = t("VAT", val(tt, "TaxAmount"));
      }
      h += '<div class="totals-wrap"><div class="totals">' +
        t("Lines total", val(lmt, "LineExtensionAmount")) +
        t("Allowances", val(lmt, "AllowanceTotalAmount"), "", "− ") +
        t("Charges", val(lmt, "ChargeTotalAmount"), "", "+ ") +
        t("Total excl. VAT", val(lmt, "TaxExclusiveAmount"), "strong") + vatRows +
        (roundingInInclusive() ? t("Rounding", val(lmt, "PayableRoundingAmount")) : "") +
        t("Total incl. VAT", val(lmt, "TaxInclusiveAmount"), "strong") +
        t("Already paid", val(lmt, "PrepaidAmount"), "", "− ") +
        (roundingInInclusive() ? "" : t("Rounding", val(lmt, "PayableRoundingAmount"))) +
        t(T(kind === "CreditNote" ? "Amount credited" : "Amount due") + " " + esc(docCur), val(lmt, "PayableAmount"), "due") +
        "</div></div>";
    }

    // Payment, references, delivery, allowances
    const cards = [];
    {
      let body = "";
      byPath(R, "PaymentMeans").forEach((pm) => {
        const c = first(pm, "PaymentMeansCode");
        const name = c ? (PAY_MEANS[txt(c)] ? T(PAY_MEANS[txt(c)]) : c.getAttribute("name") || txt(c)) : T("Payment");
        body += "<h4>" + esc(name) + (c ? ' <span class="muted" style="font-weight:400">· ' + esc(T("code {code}", { code: txt(c) })) + "</span>" : "") + "</h4>" + kv([
          ["IBAN / account", val(pm, "PayeeFinancialAccount/ID") ? iban(val(pm, "PayeeFinancialAccount/ID")) : ""],
          ["Account name", esc(val(pm, "PayeeFinancialAccount/Name"))],
          ["BIC", esc(val(pm, "PayeeFinancialAccount/FinancialInstitutionBranch/ID"))],
          ["Remittance info", esc(val(pm, "PaymentID"))],
          ["Card", esc([val(pm, "CardAccount/NetworkID"), val(pm, "CardAccount/PrimaryAccountNumberID"), val(pm, "CardAccount/HolderName")].filter(Boolean).join(" · "))],
          ["Mandate", esc(val(pm, "PaymentMandate/ID"))],
          ["Debited account", val(pm, "PaymentMandate/PayerFinancialAccount/ID") ? iban(val(pm, "PaymentMandate/PayerFinancialAccount/ID")) : ""]
        ]);
      });
      const terms = byPath(R, "PaymentTerms/Note").map(txt).filter(Boolean);
      body += kv([["Terms", terms.map(esc).join("<br>")], ["Due date", val(R, "DueDate") ? fmtDate(val(R, "DueDate")) : ""]]);
      if (body) cards.push("<div>" + (body.startsWith("<h4") ? "" : "<h4>" + T("Payment") + "</h4>") + body + "</div>");
    }
    {
      const refs = kv([
        ["Purchase order", esc(val(R, "OrderReference/ID"))], ["Sales order", esc(val(R, "OrderReference/SalesOrderID"))],
        ["Buyer reference", esc(val(R, "BuyerReference"))], ["Accounting ref.", esc(val(R, "AccountingCost"))],
        ["Contract", esc(val(R, "ContractDocumentReference/ID"))], ["Project", esc(val(R, "ProjectReference/ID"))],
        ["Preceding invoice", esc(byPath(R, "BillingReference/InvoiceDocumentReference").map((d) => val(d, "ID") + (val(d, "IssueDate") ? " (" + val(d, "IssueDate") + ")" : "")).join(", "))],
        ["Despatch advice", esc(val(R, "DespatchDocumentReference/ID"))], ["Receiving advice", esc(val(R, "ReceiptDocumentReference/ID"))],
        ["Tender / lot", esc(val(R, "OriginatorDocumentReference/ID"))],
        ["VAT point date", val(R, "TaxPointDate") ? fmtDate(val(R, "TaxPointDate")) : ""],
        ["Period code", esc(val(R, "InvoicePeriod/DescriptionCode") ? val(R, "InvoicePeriod/DescriptionCode") + (DATE_CODE[val(R, "InvoicePeriod/DescriptionCode")] ? " · " + T(DATE_CODE[val(R, "InvoicePeriod/DescriptionCode")]) : "") : "")]
      ]);
      if (refs) cards.push("<div><h4>" + T("References") + "</h4>" + refs + "</div>");
    }
    byPath(R, "Delivery").forEach((d) => {
      const a = first(d, "DeliveryLocation/Address");
      const addr = a ? [val(a, "StreetName"), val(a, "AdditionalStreetName"), [val(a, "PostalZone"), val(a, "CityName")].filter(Boolean).join(" "), countryName(val(a, "Country/IdentificationCode"))].filter(Boolean).map(esc).join("<br>") : "";
      const loc = first(d, "DeliveryLocation/ID");
      const body = kv([["Delivered", val(d, "ActualDeliveryDate") ? fmtDate(val(d, "ActualDeliveryDate")) : ""], ["Deliver to", esc(val(d, "DeliveryParty/PartyName/Name"))],
        ["Location ID", loc ? esc(txt(loc)) + schemeLabel(loc) : ""], ["Address", addr]]);
      if (body) cards.push("<div><h4>" + T("Delivery") + "</h4>" + body + "</div>");
    });
    const acs = byPath(R, "AllowanceCharge");
    [["Allowances", false], ["Charges", true]].forEach(([title, isCharge]) => {
      const list = acs.filter((ac) => (val(ac, "ChargeIndicator") === "true") === isCharge);
      if (!list.length) return;
      cards.push("<div><h4>" + T(title) + "</h4>" + kv(list.map((ac, i) => {
        const charge = isCharge;
        const code = val(ac, "AllowanceChargeReasonCode");
        const reason = val(ac, "AllowanceChargeReason") || (AC_REASON[code] ? T(AC_REASON[code]) : code);
        return [reason || T(charge ? "Charge" : "Allowance") + (list.length > 1 ? " " + (i + 1) : ""), (charge ? "+ " : "− ") + fmtMoney(val(ac, "Amount")) +
          (val(ac, "MultiplierFactorNumeric") ? ' <span class="muted">(' + esc(val(ac, "MultiplierFactorNumeric")) + " %)</span>" : "") +
          (val(ac, "TaxCategory/Percent") ? ' <span class="vat-chip">' + esc(val(ac, "TaxCategory/Percent")) + " % " + esc(val(ac, "TaxCategory/ID")) + "</span>" : "")];
      })) + "</div>");
    });
    if (cards.length) h += '<h3 class="sh">' + esc(T("Payment & references")) + '</h3><div class="info">' + cards.join("") + "</div>";

    // Attachments
    if (state.atts.length) h += '<h3 class="sh">' + T("Attachments · {n}", { n: state.atts.length }) + '</h3><div class="atts">' + state.atts.map((a, i) => attTile(i).replace('id="att-' + i + '"', "")).join("") + "</div>";

    h += "</div>";
    $("pOverview").innerHTML = h;
  }

  const NAV_GROUPS = [
    ["Document", ["doc", "refs", "preceding", "notes", "docs"]],
    ["Parties", ["seller", "buyer", "payee", "taxrep"]],
    ["Delivery & payment", ["delivery", "payment", "allowances", "charges"]],
    ["Amounts", ["vat", "totals", "checks"]],
    ["More", ["other"]],
    ["Lines", ["lines"]]
  ];
  let navObserver = null;
  function renderFieldsTab() {
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
    const main = sections.filter((s) => s.id !== "lines").map((s) => s.html).join("");
    const lines = byId.get("lines");
    $("content").innerHTML =
      '<div class="fields-layout">' + menu("fnav-side") + '<div class="fgrid">' + main + "</div></div>" +
      (lines ? '<div class="lines-zone">' + lines.html + "</div>" : "");
    if ($("filter").value) applyFilter();
    measureStick();
    watchSections();
  }

  // Height of the sticky tab bar, used to offset the sticky menus and scroll targets.
  function measureStick() {
    const bar = $("tabbar");
    if (bar && bar.offsetHeight) document.documentElement.style.setProperty("--stick", bar.offsetHeight + "px");
  }
  window.addEventListener("resize", measureStick);

  // Highlight the section currently in view in the menu.
  function watchSections() {
    if (navObserver) navObserver.disconnect();
    if (!("IntersectionObserver" in window)) return;
    const visible = new Map();
    const stick = $("tabbar") ? $("tabbar").offsetHeight : 48;
    navObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) visible.set(e.target.id, e.target.getBoundingClientRect().top); else visible.delete(e.target.id); });
      let best = null, bestTop = Infinity;
      visible.forEach((_, id) => { const t = $(id).getBoundingClientRect().top; if (t < bestTop) { bestTop = t; best = id; } });
      if (best) setActive(best.replace(/^sec-/, ""));
    }, { rootMargin: "-" + (stick + 20) + "px 0px -55% 0px" });
    $("content").querySelectorAll(".card").forEach((c) => navObserver.observe(c));
  }
  function setActive(id) {
    $("content").querySelectorAll(".fnav a").forEach((a) => a.classList.toggle("active", a.dataset.sec === id));
  }
  $("content").addEventListener("click", (e) => {
    const a = e.target.closest(".fnav a[data-sec]");
    if (!a) return;
    e.preventDefault();
    const el = $("sec-" + a.dataset.sec);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); setActive(a.dataset.sec); }
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
    state.failed = state.checks.filter((c) => !c.ok).map((c) => ({ c, at: c.at, bts: new Set(c.text.match(/\bB[TG]-\d+\b/g) || []) }));
    collectAttachments();
    renderHero();
    renderOverview();
    renderFieldsTab();
    renderAttachments();
    $("rawXml").innerHTML = xmlHtml(state.root.ownerDocument);
    $("showEmpty").checked = state.showEmpty;
    $("showTags").checked = state.showTags;
    $("out").hidden = false;
    $("intro").hidden = true;
  }

  function showTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", t.dataset.tab === name ? "true" : "false"));
    $("pOverview").hidden = name !== "overview";
    $("pFields").hidden = name !== "fields";
    $("pAtts").hidden = name !== "atts";
    $("pRaw").hidden = name !== "raw";
    $("fieldTools").hidden = name !== "fields";
    if (name === "fields") measureStick();
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

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
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("filter").addEventListener("input", applyFilter);
  $("showEmpty").addEventListener("change", (e) => {
    state.showEmpty = e.target.checked;
    try { localStorage.setItem("edocxml.showEmpty", state.showEmpty ? "1" : "0"); } catch (err) {}
    renderFieldsTab();
  });
  // XML tags are always in the page; the checkbox only shows or hides them.
  $("showTags").addEventListener("change", (e) => {
    state.showTags = e.target.checked;
    try { localStorage.setItem("edocxml.showTags", state.showTags ? "1" : "0"); } catch (err) {}
    $("content").classList.toggle("show-tags", state.showTags);
    if ($("filter").value) applyFilter();
  });

  // Text the filter searches: XML tags count only while they are shown.
  function searchText(el) {
    if (state.showTags || !el.querySelector(".xtag")) return el.textContent.toLowerCase();
    const c = el.cloneNode(true);
    c.querySelectorAll(".xtag").forEach((x) => x.remove());
    return c.textContent.toLowerCase();
  }
  function applyFilter() {
    const q = $("filter").value.trim().toLowerCase();
    const content = $("content");
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
    showTab("overview");
    drop.classList.add("loaded");
    const size = formatSize(new Blob([text]).size);
    setMsg(() => "<b>" + esc(state.name || T("Pasted XML")) + "</b> · " + size + " · " +
      T(state.kind === "CreditNote" ? "credit note" : "invoice") + " " + esc(val(state.root, "ID")) +
      (dashes ? " · " + T("removed {n} leading “-” from tags", { n: dashes }) : "") +
      (amps ? " · " + esc(T("escaped {n} bare “&”", { n: amps })) : ""));
    $("clearBtn").hidden = false;
    pasteArea.hidden = true; pasteBtn.setAttribute("aria-expanded", "false");
    return true;
  }

  function clearAll() {
    closeViewer();
    state.cache.forEach((c) => c.url && URL.revokeObjectURL(c.url));
    Object.assign(state, { root: null, kind: null, atts: [], attIndex: new Map(), cache: new Map() });
    $("out").hidden = true; $("intro").hidden = false;
    ["content", "hero", "facts", "pOverview", "pAtts", "rawXml"].forEach((id) => { $(id).innerHTML = ""; });
    $("filter").value = "";
    pasteArea.value = "";
    drop.classList.remove("loaded");
    $("clearBtn").hidden = true;
    setMsg(() => T("Drop a UBL invoice or credit note XML here, or paste it anywhere with Ctrl+V."));
  }

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
    // Read straight from the clipboard; fall back to the paste box if the browser won't allow it.
    if (pasteArea.hidden && navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) { load(text, ""); return; }
        setMsg(() => T("The clipboard is empty. Copy the XML first, then click Paste text."), true);
        return;
      } catch (e) {}
    }
    pasteArea.hidden = !pasteArea.hidden;
    pasteBtn.setAttribute("aria-expanded", pasteArea.hidden ? "false" : "true");
    if (!pasteArea.hidden) pasteArea.focus();
  });
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
  I18N.onChange(() => {
    markLang();
    setDisplayNames();
    if (lastMsg) lbMsg.innerHTML = lastMsg();
    if (!state.root) return;
    const tab = document.querySelector('.tab[aria-selected="true"]');
    const y = window.scrollY;
    render();
    showTab(tab ? tab.dataset.tab : "overview");
    window.scrollTo(0, y);
  });
  I18N.applyStatic();
  setMsg(() => T("Drop a UBL invoice or credit note XML here, or paste it anywhere with Ctrl+V."));
  $("content").classList.toggle("show-tags", state.showTags);
  $("showTags").checked = state.showTags;

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
