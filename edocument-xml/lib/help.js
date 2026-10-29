/* Plain-language "how to fix" lines for the rules, in English and Italian. Rule files add theirs with EdocHelp.add({ id: [english, italian] });
   the Checks list shows the line under every rule that fails. */
(function () {
  const H = {};
  // Where the value of a code-list rule comes from: the official Peppol BIS Billing 3.0 code lists (docs.peppol.eu for the lists its guide names,
  // otherwise the list file in the OpenPEPPOL repository).
  const PAGE = "https://docs.peppol.eu/poacc/billing/3.0/codelist/", FILE = "https://raw.githubusercontent.com/OpenPEPPOL/peppol-bis-invoice-3/master/structure/codelist/";
  const LISTS = {
    "ISO 4217 currency codes": [FILE + "ISO4217_2015.xml", "BR-CL-03 BR-CL-04 BR-CL-05 PEPPOL-EN16931-CL007 ibr-cl-03 ibr-cl-04 ibr-cl-05"],
    "ISO 3166-1 country codes": [FILE + "ISO3166-1_Alpha2.xml", "BR-CL-14 BR-CL-15 ibr-cl-14 ibr-cl-15"],
    "UN/ECE Rec 20 unit codes": [FILE + "UNECERec20-11e.xml", "BR-CL-23 ibr-cl-23"],
    "UNCL 1001 document type codes": [FILE + "UNCL1001-inv.xml", "BR-CL-01"],
    "UNCL 4461 payment means codes": [PAGE + "UNCL4461/", "BR-CL-16 ibr-cl-16"],
    "UNCL 5305 VAT category codes": [PAGE + "UNCL5305/", "BR-CL-17 BR-CL-18"],
    "UNCL 5189 allowance reason codes": [PAGE + "UNCL5189/", "BR-CL-19 PEPPOL-EN16931-CL002 ibr-cl-19"],
    "UNCL 7161 charge reason codes": [PAGE + "UNCL7161/", "BR-CL-20 PEPPOL-EN16931-CL003 ibr-cl-20"],
    "UNCL 2005 period codes": [PAGE + "UNCL2005/", "BR-CL-06 PEPPOL-EN16931-CL006"],
    "UNCL 1153 reference qualifier codes": [PAGE + "UNCL1153/", "BR-CL-07 ibr-cl-07"],
    "UNCL 7143 classification codes": [PAGE + "UNCL7143/", "BR-CL-13 ibr-cl-13"],
    "ISO 6523 ICD identifier schemes": [PAGE + "ICD/", "BR-CL-10 BR-CL-11 BR-CL-21 BR-CL-26 ibr-cl-10 ibr-cl-11 ibr-cl-21 ibr-cl-26"],
    "EAS electronic address schemes": [PAGE + "eas/", "BR-CL-25 PEPPOL-EN16931-CL008 ibr-cl-25"],
    "VATEX exemption reason codes": [PAGE + "vatex/", "BR-CL-22"],
    "Allowed MIME types": [FILE + "MimeCode.xml", "BR-CL-24 PEPPOL-EN16931-CL001 ibr-cl-24"]
  };
  const L = {};
  Object.keys(LISTS).forEach((name) => LISTS[name][1].split(" ").forEach((id) => { L[id] = { name, url: LISTS[name][0] }; }));
  window.EdocHelp = {
    add(map) { Object.assign(H, map); },
    // the line for a rule id in the current language, or ""
    get(id) { const h = H[id]; return h ? (window.I18N && I18N.lang === "it" ? h[1] || h[0] : h[0]) : ""; },
    // the official list a code-list rule takes its value from: { name, url }, or null
    link(id) { return L[id] || null; },
    // the official page or file of a code list, by the name used above ("UNCL 4461 payment means codes"), or ""
    listUrl: (name) => (LISTS[name] ? LISTS[name][0] : ""),
    linkIds: () => Object.keys(L),
    count: () => Object.keys(H).length
  };
})();
