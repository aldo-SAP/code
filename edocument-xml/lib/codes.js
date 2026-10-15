/* Code lists used to show codes in words (UNTDID 1001, 4461, 5305, 2005, 5189, 4451, ISO 6523 ICD, UN/ECE Rec 20). */
window.EdocCodes = (function () {
  "use strict";
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
  return { DOC_TYPES, PAY_MEANS, VAT_CAT, DATE_CODE, AC_REASON, NOTE_SUBJECT, SCHEMES, UNITS };
})();
