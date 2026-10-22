/* English names of the coded values of the Italian electronic invoice. The Italian text is the schema's own description of each value (rules/it-schema-data.js);
   these are translations of it. Element name -> value -> English. */
window.IT_LABELS_EN = {
  FormatoTrasmissione: { FPA12: "Invoice to public administration", FPR12: "Invoice to private parties" },
  TipoDocumento: {
    TD01: "Invoice", TD02: "Advance / down payment on invoice", TD03: "Advance / down payment on fee note", TD04: "Credit note", TD05: "Debit note", TD06: "Fee note",
    TD16: "Reverse charge integration (domestic)", TD17: "Integration / self-invoice for services purchased from abroad", TD18: "Integration for purchase of intra-EU goods",
    TD19: "Integration / self-invoice for goods purchased under art. 17 c. 2 DPR 633/72", TD20: "Self-invoice for regularisation and integration of invoices (art. 6 c. 9-bis D.Lgs. 471/97 or art. 46 c. 5 D.L. 331/93)",
    TD21: "Self-invoice for exceeding the ceiling (splafonamento)", TD22: "Extraction of goods from VAT warehouse", TD23: "Extraction of goods from VAT warehouse with payment of VAT",
    TD24: "Deferred invoice under art. 21 c. 4 third period lett. a) DPR 633/72", TD25: "Deferred invoice under art. 21 c. 4 third period lett. b) DPR 633/72",
    TD26: "Transfer of depreciable assets and internal transfers (art. 36 DPR 633/72)", TD27: "Invoice for self-consumption or free transfers without recharge",
    TD28: "Purchases from San Marino with VAT (paper invoice)", TD29: "Notice of omitted or irregular invoicing by the Italian supplier (art. 6 c. 8 D.Lgs. 471/97)"
  },
  RegimeFiscale: {
    RF01: "Ordinary regime", RF02: "Minimum taxpayers regime (art. 1 c. 96-117, L. 244/2007)", RF04: "Agriculture and related activities and fishing (arts. 34 and 34-bis, DPR 633/1972)",
    RF05: "Sale of salt and tobacco (art. 74 c. 1, DPR 633/1972)", RF06: "Trade in matches (art. 74 c. 1, DPR 633/1972)", RF07: "Publishing (art. 74 c. 1, DPR 633/1972)",
    RF08: "Public telephony services (art. 74 c. 1, DPR 633/1972)", RF09: "Resale of public transport and parking documents (art. 74 c. 1, DPR 633/1972)",
    RF10: "Entertainment, games and other activities in the tariff annexed to DPR 640/72 (art. 74 c. 6, DPR 633/1972)", RF11: "Travel and tourism agencies (art. 74-ter, DPR 633/1972)",
    RF12: "Farm holidays (art. 5 c. 2, L. 413/1991)", RF13: "Door-to-door sales (art. 25-bis c. 6, DPR 600/1973)", RF14: "Resale of used goods, art, antiques or collectibles (art. 36, D.L. 41/1995)",
    RF15: "Auction agencies for art, antiques or collectibles (art. 40-bis, D.L. 41/1995)", RF16: "Cash-basis VAT for public administration (art. 6 c. 5, DPR 633/1972)",
    RF17: "Cash-basis VAT (art. 32-bis, D.L. 83/2012)", RF18: "Other", RF19: "Flat-rate regime", RF20: "Cross-border VAT exemption regime (EU Directive 2020/285)"
  },
  SocioUnico: { SU: "sole shareholder", SM: "more than one shareholder" },
  StatoLiquidazione: { LS: "in liquidation", LN: "not in liquidation" },
  SoggettoEmittente: { CC: "Customer / client", TZ: "Third party" },
  TipoRitenuta: { RT01: "Withholding tax, natural persons", RT02: "Withholding tax, legal entities", RT03: "INPS contribution", RT04: "ENASARCO contribution", RT05: "ENPAM contribution", RT06: "Other social security contribution" },
  TipoCassa: {
    TC01: "National pension and assistance fund for lawyers", TC02: "Pension fund for chartered accountants", TC03: "Pension and assistance fund for surveyors",
    TC04: "National pension and assistance fund for self-employed engineers and architects", TC05: "National notaries fund", TC06: "National pension and assistance fund for accountants and commercial experts",
    TC07: "National assistance body for commercial agents and representatives (ENASARCO)", TC08: "National pension and assistance body for labour consultants (ENPACL)",
    TC09: "National pension and assistance body for doctors (ENPAM)", TC10: "National pension and assistance body for pharmacists (ENPAF)", TC11: "National pension and assistance body for veterinarians (ENPAV)",
    TC12: "National pension and assistance body for agricultural employees (ENPAIA)", TC13: "Pension fund for employees of shipping companies and maritime agencies",
    TC14: "National pension institute for Italian journalists (INPGI)", TC15: "National assistance body for Italian health-care orphans (ONAOSI)", TC16: "Autonomous supplementary assistance fund for Italian journalists (CASAGIT)",
    TC17: "Pension body for industrial experts and graduate industrial experts (EPPI)", TC18: "Multi-category pension and assistance body (EPAP)", TC19: "National pension and assistance body for biologists (ENPAB)",
    TC20: "National pension and assistance body for nurses (ENPAPI)", TC21: "National pension and assistance body for psychologists (ENPAP)", TC22: "INPS"
  },
  Ritenuta: { SI: "YES = supply / service subject to withholding tax" },
  Natura: {
    N1: "Excluded under art. 15 DPR 633/1972", N2: "Not subject to VAT", "N2.1": "Not subject to VAT under arts. 7 to 7-septies DPR 633/72", "N2.2": "Not subject to VAT - other cases",
    N3: "Non-taxable", "N3.1": "Non-taxable - exports", "N3.2": "Non-taxable - intra-EU supplies", "N3.3": "Non-taxable - supplies to San Marino",
    "N3.4": "Non-taxable - transactions treated as exports", "N3.5": "Non-taxable - following declarations of intent", "N3.6": "Non-taxable - other transactions not counting towards the ceiling",
    N4: "Exempt", N5: "Margin scheme / VAT not shown on the invoice", N6: "Reverse charge (reverse-charge transactions, self-invoicing for non-EU purchases of services, or imports of goods in the cases provided for)",
    "N6.1": "Reverse charge - supply of scrap and other recovered materials", "N6.2": "Reverse charge - supply of gold and silver under law 7/2000 and used jewellery to OPO",
    "N6.3": "Reverse charge - subcontracting in construction", "N6.4": "Reverse charge - supply of buildings", "N6.5": "Reverse charge - supply of mobile phones", "N6.6": "Reverse charge - supply of electronic products",
    "N6.7": "Reverse charge - construction and related sectors", "N6.8": "Reverse charge - energy sector", "N6.9": "Reverse charge - other cases",
    N7: "VAT paid in another EU state (telecommunication, broadcasting and electronic services, art. 7-octies lett. a, b, art. 74-sexies DPR 633/72)"
  },
  Tipo: { SC: "SC = Discount", MG: "MG = Surcharge" },
  Art73: { SI: "YES = document issued under the rules and terms set by ministerial decree under art. 73 DPR 633/72" },
  TipoCessionePrestazione: { SC: "Discount", PR: "Bonus", AB: "Allowance", AC: "Ancillary expense" },
  EsigibilitaIVA: { D: "deferred VAT", I: "immediate VAT", S: "split payment" },
  CondizioniPagamento: { TP01: "payment in instalments", TP02: "full payment", TP03: "advance" },
  ModalitaPagamento: {
    MP01: "cash", MP02: "cheque", MP03: "banker's draft", MP04: "cash at the Treasury", MP05: "bank transfer", MP06: "promissory note", MP07: "bank payment slip", MP08: "payment card",
    MP09: "RID direct debit", MP10: "RID utilities", MP11: "fast RID", MP12: "RIBA", MP13: "MAV", MP14: "tax office receipt", MP15: "transfer to special accounting accounts",
    MP16: "bank direct debit", MP17: "postal direct debit", MP18: "postal current account slip", MP19: "SEPA Direct Debit", MP20: "SEPA Direct Debit CORE", MP21: "SEPA Direct Debit B2B",
    MP22: "deduction from sums already collected", MP23: "PagoPA"
  }
};
