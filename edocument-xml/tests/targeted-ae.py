#!/usr/bin/env python3
"""Hand-aimed PINT AE test documents: one or two edits of an official example that are meant to break one particular rule.

usage: targeted-ae.py OUTDIR SRCDIR [--log=FILE]

mutate-single.py changes every element one at a time; some rules need an element that no example has, a second copy of something, or two edits
together (a code AND a missing reason, a scheme AND a wrong number). Those are listed here. Which official rules the whole set reaches is
counted by coverage.py, so a rule that is still never exercised shows up there.
Each case is (name, example-name part, [edit, …]); an edit is one of
  ("del", xpath)  ("dup", xpath[, n])  ("set", xpath, text)  ("attr", xpath, name, value)  ("delattr", xpath, name)  ("add", parent-xpath, xml)
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from targeted import generate, NS

out, src = sys.argv[1], sys.argv[2]
opt = {a.split("=")[0][2:]: a.split("=")[1] for a in sys.argv[3:] if a.startswith("--") and "=" in a}
logfile = opt.get("log", os.path.join(os.path.dirname(os.path.abspath(out)), "mutlog-ae-targeted.json"))
EXT = "Standard.invoice.-.Extensive"
S, B = "/*/cac:AccountingSupplierParty/cac:Party", "/*/cac:AccountingCustomerParty/cac:Party"
cases = []


def case(name, base, *edits):
    cases.append((name, base, list(edits)))


# ---- counts: "MUST occur maximum once" and friends (a second copy of the element)
case("ibr-097", EXT, ("dup", "/*/cac:InvoicePeriod"))
case("ibr-098", EXT, ("dup", S + "/cac:PartyLegalEntity/cbc:RegistrationName"))
case("ibr-102", EXT, ("dup", B + "/cac:PartyLegalEntity/cbc:RegistrationName"))
case("ibr-sr-16", EXT, ("add", B, "<cac:PartyIdentification><cbc:ID>1</cbc:ID></cac:PartyIdentification><cac:PartyIdentification><cbc:ID>2</cbc:ID></cac:PartyIdentification>"))
case("ibr-sr-49", EXT, ("dup", "/*/cac:InvoicePeriod/cbc:DescriptionCode"))
case("ibr-sr-06", EXT, ("dup", "/*/cac:BillingReference/cac:InvoiceDocumentReference"))
case("ibr-067", EXT, ("dup", "/*/cac:PaymentMeans/cac:PaymentMandate"))
case("ibr-sr-28", EXT, ("dup", "/*/cac:PaymentMeans/cac:PaymentMandate/cbc:ID"))
case("ibr-sr-60", EXT, ("add", "/*/cac:PaymentTerms", "<cbc:PaymentMeansID>a</cbc:PaymentMeansID><cbc:PaymentMeansID>b</cbc:PaymentMeansID>"))
case("ibr-078", EXT, ("add", "/*", "<cac:AdditionalDocumentReference><cbc:ID>O1</cbc:ID><cbc:DocumentTypeCode>130</cbc:DocumentTypeCode></cac:AdditionalDocumentReference>"
                      "<cac:AdditionalDocumentReference><cbc:ID>O2</cbc:ID><cbc:DocumentTypeCode>130</cbc:DocumentTypeCode></cac:AdditionalDocumentReference>"))
case("ibr-071", EXT, ("add", "/*", "<cac:AdditionalDocumentReference><cbc:ID>O1</cbc:ID><cbc:DocumentTypeCode>130</cbc:DocumentTypeCode><cac:Attachment><cac:ExternalReference><cbc:URI>https://x.ae</cbc:URI></cac:ExternalReference></cac:Attachment></cac:AdditionalDocumentReference>"))
case("ibr-072", EXT, ("add", "/*", "<cac:AdditionalDocumentReference><cbc:ID>O1</cbc:ID><cbc:DocumentTypeCode>130</cbc:DocumentTypeCode><cbc:DocumentDescription>d</cbc:DocumentDescription></cac:AdditionalDocumentReference>"))
case("ibr-089", EXT, ("add", "/*/cac:InvoiceLine[1]", "<cac:DocumentReference><cbc:ID>O1</cbc:ID><cbc:DocumentTypeCode>130</cbc:DocumentTypeCode></cac:DocumentReference><cac:DocumentReference><cbc:ID>O2</cbc:ID><cbc:DocumentTypeCode>130</cbc:DocumentTypeCode></cac:DocumentReference>"))
case("ibr-sr-38", EXT, ("dup", "/*/cac:InvoiceLine[2]/cac:Item/cac:ClassifiedTaxCategory/cbc:TaxExemptionReason"))
case("ibr-sr-32", EXT, ("add", "/*/cac:TaxTotal/cac:TaxSubtotal[2]/cac:TaxCategory", "<cbc:TaxExemptionReason>a</cbc:TaxExemptionReason><cbc:TaxExemptionReason>b</cbc:TaxExemptionReason>"))
case("ibr-sr-61", EXT, ("add", "/*/cac:AllowanceCharge[1]/cac:TaxCategory", "<cbc:TaxExemptionReason>a</cbc:TaxExemptionReason><cbc:TaxExemptionReason>b</cbc:TaxExemptionReason>"))
case("ibr-sr-42", EXT, ("dup", S + "/cac:PartyTaxScheme", 2))
case("ibr-sr-22", EXT, ("dup", "/*/cac:TaxRepresentativeParty/cac:PartyName/cbc:Name"))
case("ibr-sr-23", EXT, ("add", "/*/cac:TaxRepresentativeParty", "<cac:Party><cac:PartyTaxScheme><cbc:CompanyID>1</cbc:CompanyID></cac:PartyTaxScheme><cac:PartyTaxScheme><cbc:CompanyID>2</cbc:CompanyID></cac:PartyTaxScheme></cac:Party>"))
case("ibr-sr-55", EXT, ("dup", "/*/cac:TaxRepresentativeParty/cac:PostalAddress/cac:AddressLine/cbc:Line"))
case("ibr-sr-56", EXT, ("dup", "/*/cac:Delivery/cac:DeliveryLocation/cac:Address/cac:AddressLine/cbc:Line"))
case("ibr-sr-59", EXT, ("add", "/*/cac:PaymentMeans/cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch", "<cac:Address><cac:AddressLine><cbc:Line>a</cbc:Line></cac:AddressLine><cac:AddressLine><cbc:Line>b</cbc:Line></cac:AddressLine></cac:Address>"))
case("ibr-sr-62", EXT, ("add", "/*/cac:InvoiceLine[1]", "<cac:DespatchLineReference><cac:DocumentReference><cbc:ID>1</cbc:ID></cac:DocumentReference><cac:DocumentReference><cbc:ID>2</cbc:ID></cac:DocumentReference></cac:DespatchLineReference>"))
case("ibr-092", EXT, ("add", "/*/cac:InvoiceLine[1]", "<cac:DespatchLineReference><cac:DocumentReference><cbc:ID>1</cbc:ID></cac:DocumentReference></cac:DespatchLineReference>"))
case("ibr-sr-63", EXT, ("set", "/*/cbc:CustomizationID", "urn:peppol:pint:billing-1@ae-*"))
# ---- presence
case("ibr-co-19", EXT, ("del", "/*/cac:InvoicePeriod/*"))
case("ibr-co-19b", EXT, ("del", "/*/cac:InvoicePeriod/cbc:StartDate"), ("del", "/*/cac:InvoicePeriod/cbc:EndDate"), ("del", "/*/cac:InvoicePeriod/cbc:DescriptionCode"))
case("ibr-co-20", EXT, ("del", "/*/cac:InvoiceLine[1]/cac:InvoicePeriod/*"))
case("ibr-co-26", EXT, ("del", S + "/cac:PartyTaxScheme"), ("del", S + "/cac:PartyLegalEntity/cbc:CompanyID"))
case("ibr-020", EXT, ("del", "/*/cac:TaxRepresentativeParty/cac:PostalAddress/cac:Country/cbc:IdentificationCode"))
case("ibr-093", EXT, ("add", "/*", "<cac:PrepaidPayment><cbc:PaidAmount currencyID='AED'>1</cbc:PaidAmount></cac:PrepaidPayment>"), ("del", "/*/cac:LegalMonetaryTotal/cbc:PrepaidAmount"))
case("ibr-093b", EXT, ("add", "/*", "<cac:PrepaidPayment><cbc:PaidAmount currencyID='AED'>1</cbc:PaidAmount></cac:PrepaidPayment>"))
for n, (xp, label) in {"ibr-033": ("/*/cac:AllowanceCharge[cbc:ChargeIndicator='false'][1]", "allowance"), "ibr-038": ("/*/cac:AllowanceCharge[cbc:ChargeIndicator='true'][1]", "charge"),
                       "ibr-042": ("/*/cac:InvoiceLine[1]/cac:AllowanceCharge[cbc:ChargeIndicator='false'][1]", "line allowance"),
                       "ibr-044": ("/*/cac:InvoiceLine[1]/cac:AllowanceCharge[cbc:ChargeIndicator='true'][1]", "line charge")}.items():
    case(n, EXT, ("del", xp + "/cbc:AllowanceChargeReason"), ("del", xp + "/cbc:AllowanceChargeReasonCode"))
    case(n + "b", EXT, ("del", xp + "/cbc:AllowanceChargeReason"))
    case(n + "c", EXT, ("del", xp + "/cbc:AllowanceChargeReasonCode"))
# ---- VAT category and rate/reason combinations
case("aligned-ibrp-s-10", EXT, ("add", "/*/cac:TaxTotal/cac:TaxSubtotal[1]/cac:TaxCategory", "<cbc:TaxExemptionReason>why</cbc:TaxExemptionReason>"))
case("aligned-ibrp-s-10b", EXT, ("add", "/*/cac:TaxTotal/cac:TaxSubtotal[1]/cac:TaxCategory", "<cbc:TaxExemptionReasonCode>VATEX-X</cbc:TaxExemptionReasonCode>"))
case("ibr-121-ae", EXT, ("add", "/*/cac:TaxTotal/cac:TaxSubtotal[2]/cac:TaxCategory", "<cbc:Percent>0</cbc:Percent>"))
case("aligned-ibrp-o-11-ae", EXT, ("add", "/*/cac:TaxTotal/cac:TaxSubtotal[3]/cac:TaxCategory", "<cbc:Percent>5</cbc:Percent>"))
case("aligned-ibrp-e-05", EXT, ("add", "/*/cac:InvoiceLine[2]/cac:Item/cac:ClassifiedTaxCategory", "<cbc:Percent>0</cbc:Percent>"))
case("ibr-163-ae", EXT, ("add", "/*/cac:InvoiceLine[2]/cac:ItemPriceExtension", "<cac:TaxTotal><cbc:TaxAmount currencyID='AED'>1</cbc:TaxAmount></cac:TaxTotal>"))
case("aligned-ibrp-o-05", EXT, ("add", "/*/cac:InvoiceLine[3]/cac:Item/cac:ClassifiedTaxCategory", "<cbc:Percent>0</cbc:Percent>"))
for n, (cat, ind) in {"o-06": ("O", "false"), "o-07": ("O", "true")}.items():
    case("aligned-ibrp-" + n, EXT, ("set", "/*/cac:AllowanceCharge[cbc:ChargeIndicator='%s'][1]/cac:TaxCategory/cbc:ID" % ind, cat),
         ("add", "/*/cac:AllowanceCharge[cbc:ChargeIndicator='%s'][1]/cac:TaxCategory" % ind, "<cbc:Percent>0</cbc:Percent>"))
for cat in ["N", "E", "Z", "O", "AE", "X"]:
    case("ibr-115-ae-" + cat, EXT, ("set", "/*/cac:AllowanceCharge[cbc:ChargeIndicator='false'][1]/cac:TaxCategory/cbc:ID", cat))
    case("ibr-114-ae-" + cat, EXT, ("set", "/*/cac:AllowanceCharge[cbc:ChargeIndicator='true'][1]/cac:TaxCategory/cbc:ID", cat))
    case("ibr-168-ae-" + cat, EXT, ("set", "/*/cac:AllowanceCharge[cbc:ChargeIndicator='false'][1]/cac:TaxCategory/cbc:ID", cat), ("del", "/*/cac:AllowanceCharge[cbc:ChargeIndicator='false'][1]/cbc:AllowanceChargeReasonCode"))
    case("ibr-169-ae-" + cat, EXT, ("set", "/*/cac:AllowanceCharge[cbc:ChargeIndicator='true'][1]/cac:TaxCategory/cbc:ID", cat), ("del", "/*/cac:AllowanceCharge[cbc:ChargeIndicator='true'][1]/cbc:AllowanceChargeReasonCode"))
# ---- UAE-specific combinations
case("ibr-160-ae", EXT, ("set", "/*/cac:InvoicePeriod/cbc:DescriptionCode", "OTH"), ("del", "/*/cbc:Note"))
case("ibr-186-ae", EXT, ("set", "/*/cac:InvoiceLine[1]/cac:Item/cac:CommodityClassification/cbc:CommodityCode", "B"), ("del", "/*/cac:InvoiceLine[1]/cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode"))
case("ibr-186-ae-b", EXT, ("set", "/*/cac:InvoiceLine[1]/cac:Item/cac:CommodityClassification/cbc:CommodityCode", "B"))
for bits in ["10000010", "00000010", "00001010", "11111111", "00000000", "01000000", "00000100", "00100000", "00010000", "00000001"]:
    case("ibr-177-ae-" + bits, EXT, ("set", "/*/cbc:ProfileExecutionID", bits), ("del", S + "/cac:PartyTaxScheme/cbc:CompanyID"))
    case("profile-" + bits, EXT, ("set", "/*/cbc:ProfileExecutionID", bits))
# ---- rules the single-change documents do not reach: a second copy, a missing part, a category/rate combination
PR = "<cac:ProjectReference><cbc:ID>P%d</cbc:ID></cac:ProjectReference>"
case("ibr-cl-01", EXT, ("set", "/*/cbc:InvoiceTypeCode", "389"))
case("ibr-cl-01-b", EXT, ("set", "/*/cbc:InvoiceTypeCode", "380"))
case("ibr-cl-01-c", "Credit", ("set", "/*/cbc:CreditNoteTypeCode", "261"))
case("ibr-cl-01-d", "Credit", ("set", "/*/cbc:CreditNoteTypeCode", "381"))
case("ibr-090", EXT, ("add", "/*", PR % 1 + PR % 2))
case("ibr-095", EXT, ("add", "/*", "<cac:ReceiptDocumentReference><cbc:ID>R1</cbc:ID></cac:ReceiptDocumentReference><cac:ReceiptDocumentReference><cbc:ID>R2</cbc:ID></cac:ReceiptDocumentReference>"))
case("ibr-107", EXT, ("dup", "/*/cac:Delivery"))
case("ibr-108", EXT, ("add", "/*/cac:Delivery", "<cac:DeliveryParty><cac:PartyName><cbc:Name>a</cbc:Name></cac:PartyName><cac:PartyName><cbc:Name>b</cbc:Name></cac:PartyName></cac:DeliveryParty>"))
case("ibr-017", EXT, ("add", "/*", "<cac:PayeeParty><cac:PartyIdentification><cbc:ID>999</cbc:ID></cac:PartyIdentification></cac:PayeeParty>"))
case("ibr-018", EXT, ("del", "/*/cac:TaxRepresentativeParty/cac:PartyName"))
case("ibr-019", EXT, ("del", "/*/cac:TaxRepresentativeParty/cac:PostalAddress"))
case("ibr-056", EXT, ("del", "/*/cac:TaxRepresentativeParty/cac:PartyTaxScheme"))
case("ibr-075", EXT, ("add", "/*", "<cac:AdditionalDocumentReference><cbc:ID>O1</cbc:ID><cbc:DocumentTypeCode>130</cbc:DocumentTypeCode><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode='application/pdf'>QUJD</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>"))
case("ibr-196-ae", EXT, ("add", "/*", "<cac:DeliveryTerms/>"))
case("ibr-196-ae-b", EXT, ("del", "/*/cac:DeliveryTerms/cbc:ID"))
case("ibr-172-ae", EXT, ("attr", S + "/cac:PartyLegalEntity/cbc:CompanyID", "schemeAgencyID", "TL"), ("delattr", S + "/cac:PartyLegalEntity/cbc:CompanyID", "schemeAgencyName"))
case("ibr-167-ae", EXT, ("set", "/*/cac:InvoiceLine[1]/cac:Item/cac:ClassifiedTaxCategory/cbc:ID", "E"), ("del", "/*/cac:InvoiceLine[1]/cac:Item/cac:ClassifiedTaxCategory/cbc:TaxExemptionReasonCode"))
case("ibr-167-ae-b", EXT, ("set", "/*/cac:InvoiceLine[2]/cac:Item/cac:ClassifiedTaxCategory/cbc:ID", "E"), ("del", "/*/cac:InvoiceLine[2]/cac:Item/cac:ClassifiedTaxCategory/cbc:TaxExemptionReasonCode"))
case("ibr-111-ae", EXT, ("set", "/*/cac:InvoiceLine[1]/cac:Item/cac:ClassifiedTaxCategory/cbc:ID", "N"), ("set", "/*/cac:InvoiceLine[1]/cac:Item/cac:ClassifiedTaxCategory/cbc:Percent", "0"))
case("ibr-108-ae", EXT, ("set", "/*/cac:TaxTotal/cac:TaxSubtotal[1]/cac:TaxCategory/cbc:ID", "N"))
case("ibr-103-ae", EXT, ("set", "/*/cac:InvoiceLine[1]/cac:Item/cac:ClassifiedTaxCategory/cbc:ID", "AE"), ("del", B + "/cac:PartyTaxScheme"))
# ---- passport (PAS) identifier
for who, p in (("011", B), ("013", S)):
    case("ibr-%s-ae" % who, EXT, ("attr", p + "/cac:PartyLegalEntity/cbc:CompanyID", "schemeAgencyID", "PAS"), ("attr", p + "/cac:PartyLegalEntity/cbc:CompanyID", "schemeAgencyName", "QQ"))
    case("ibr-%s-ae-ok" % who, EXT, ("attr", p + "/cac:PartyLegalEntity/cbc:CompanyID", "schemeAgencyID", "PAS"), ("attr", p + "/cac:PartyLegalEntity/cbc:CompanyID", "schemeAgencyName", "FR"))
    case("ibr-%s-ae-none" % who, EXT, ("attr", p + "/cac:PartyLegalEntity/cbc:CompanyID", "schemeAgencyID", "PAS"), ("delattr", p + "/cac:PartyLegalEntity/cbc:CompanyID", "schemeAgencyName"))
# ---- code lists
case("ibr-cl-07", EXT, ("add", "/*", "<cac:AdditionalDocumentReference><cbc:ID schemeID='QQQ'>O1</cbc:ID><cbc:DocumentTypeCode>130</cbc:DocumentTypeCode></cac:AdditionalDocumentReference>"))
case("ibr-cl-07-ok", EXT, ("add", "/*", "<cac:AdditionalDocumentReference><cbc:ID schemeID='ABL'>O1</cbc:ID><cbc:DocumentTypeCode>130</cbc:DocumentTypeCode></cac:AdditionalDocumentReference>"))
case("ibr-cl-11", EXT, ("attr", S + "/cac:PartyLegalEntity/cbc:CompanyID", "schemeID", "ZZZZ"))
case("ibr-cl-11-ok", EXT, ("attr", S + "/cac:PartyLegalEntity/cbc:CompanyID", "schemeID", "0002"))
# ---- identifier schemes of other countries (their check digits)
ID_CASES = {"0007": ["1234567890", "12345", "abcdefghij"], "0192": ["123456785", "123456789", "12345"], "0184": ["DK12345678", "DK1234", "XX12345678"],
            "0208": ["0123456749", "0123456789", "12"], "0201": ["ABC123", "AB", "ABC12!"], "0210": ["RSSMRA85T10A562S", "123", "12345678901"],
            "0211": ["IT00743110157", "IT123", "FR00743110157"], "9906": ["IT00743110157", "IT123"], "9907": ["RSSMRA85T10A562S", "123"],
            "0151": ["12345678901", "123"], "0088": ["1234567890128", "1234567890123", "123"], "0060": ["123456789", "12345678"], "0235": ["112345678900003", "212345678900003", "1234", "X"]}
for scheme, values in ID_CASES.items():
    for i, v in enumerate(values):
        case("ibr-id-%s-ep-%d" % (scheme, i), EXT, ("attr", S + "/cbc:EndpointID", "schemeID", scheme), ("set", S + "/cbc:EndpointID", v))
        case("ibr-id-%s-bep-%d" % (scheme, i), EXT, ("attr", B + "/cbc:EndpointID", "schemeID", scheme), ("set", B + "/cbc:EndpointID", v))
        case("ibr-id-%s-pi-%d" % (scheme, i), EXT, ("add", S, "<cac:PartyIdentification><cbc:ID schemeID='%s'>%s</cbc:ID></cac:PartyIdentification>" % (scheme, v)))
        case("ibr-id-%s-co-%d" % (scheme, i), EXT, ("attr", S + "/cac:PartyLegalEntity/cbc:CompanyID", "schemeID", scheme), ("set", S + "/cac:PartyLegalEntity/cbc:CompanyID", v))



generate(cases, out, src, logfile)
