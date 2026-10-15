#!/usr/bin/env python3
"""Hand-aimed XRechnung test documents: one or two edits of an official example that are meant to break one particular rule.

usage: targeted-de.py OUTDIR SRCDIR [--log=FILE]

mutate-single.py changes every element one at a time; the XRechnung rules that depend on the profile (Extension, CVD), on a group that no example has
or on the exact text of a value (IBAN, e-mail, telephone, Skonto, URL) get documents here. Which official rules the whole set reaches is counted by
coverage.py. See lib/targeted.py for the edit syntax.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from targeted import generate

out, src = sys.argv[1], sys.argv[2]
opt = {a.split("=")[0][2:]: a.split("=")[1] for a in sys.argv[3:] if a.startswith("--") and "=" in a}
logfile = opt.get("log", os.path.join(os.path.dirname(os.path.abspath(out)), "mutlog-de-targeted.json"))

STD, EXT, EXT2, CVD = "01.03a-INVOICE_ubl", "04.01a-INVOICE_ubl", "05.01a-INVOICE_ubl", "02.01a-cvd_INVOICE_ubl"
S, B = "/*/cac:AccountingSupplierParty/cac:Party", "/*/cac:AccountingCustomerParty/cac:Party"
PM = "/*/cac:PaymentMeans"
cases = []


def case(name, base, *edits):
    cases.append((name, base, list(edits)))


# ---- Peppol rules carried by XRechnung
case("PEPPOL-EN16931-R005", STD, ("add", "/*", "<cbc:TaxCurrencyCode>EUR</cbc:TaxCurrencyCode>"))
# ---- Extension (BR-DEX): third party payment, sub lines, attachments
case("BR-DEX-13", EXT2, ("set", "/*/cac:PrepaidPayment/cbc:PaidAmount", "19.961"))
case("BR-DEX-13-ok", EXT2, ("set", "/*/cac:PrepaidPayment/cbc:PaidAmount", "19.96"))
case("BR-DEX-10", EXT2, ("del", "/*/cac:PrepaidPayment/cbc:ID"))
case("BR-DEX-11", EXT2, ("del", "/*/cac:PrepaidPayment/cbc:PaidAmount"))
case("BR-DEX-12", EXT2, ("del", "/*/cac:PrepaidPayment/cbc:InstructionID"))
case("BR-DEX-14", EXT2, ("attr", "/*/cac:PrepaidPayment/cbc:PaidAmount", "currencyID", "USD"))
case("BR-DEX-09", EXT2, ("set", "/*/cac:LegalMonetaryTotal/cbc:PayableAmount", "1.00"))
for i, mime in enumerate(["application/xml", "application/pdf", "text/xml", "image/png", "application/zip", "x/y", ""]):
    case("BR-DEX-01-%d" % i, EXT, ("add", "/*", "<cac:AdditionalDocumentReference><cbc:ID>A%d</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode='%s' filename='f%d.bin'>QUJD</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>" % (i, mime, i)))
# ---- CVD (Clean Vehicles Directive)
case("BR-DE-CVD-01", CVD, ("del", "/*/cac:ContractDocumentReference"))
case("BR-DE-CVD-02", CVD, ("del", "/*/cac:OriginatorDocumentReference"))
case("BR-DE-CVD-03", CVD, ("del", "//cac:InvoiceLine/cac:Item/cac:AdditionalItemProperty[cbc:Name='cva']"))
case("BR-DE-CVD-04", CVD, ("set", "//cac:InvoiceLine/cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode[@listID='CVD']", "X9"))
case("BR-DE-CVD-05", CVD, ("set", "//cac:InvoiceLine/cac:Item/cac:AdditionalItemProperty[cbc:Name='cva']/cbc:Value", "diesel"))
case("BR-DE-CVD-06-a", CVD, ("del", "//cac:InvoiceLine/cac:Item/cac:AdditionalItemProperty[cbc:Name='cva']"))
case("BR-DE-CVD-06-a2", CVD, ("dup", "//cac:InvoiceLine/cac:Item/cac:AdditionalItemProperty[cbc:Name='cva']"))
case("BR-DE-CVD-06-b", CVD, ("attr", "//cac:InvoiceLine/cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode[@listID='CVD']", "listID", "XYZ"))
case("BR-TMP-CVD-01", CVD, ("attr", "//cac:InvoiceLine/cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode[@listID='CVD']", "listID", "ZZZZ"))
# ---- payment means: which groups go with which code
CT = "<cac:PaymentMandate><cbc:ID>M1</cbc:ID><cac:PayerFinancialAccount><cbc:ID>DE79000000001234567890</cbc:ID></cac:PayerFinancialAccount></cac:PaymentMandate>"
CARD = "<cac:CardAccount><cbc:PrimaryAccountNumberID>1234</cbc:PrimaryAccountNumberID><cbc:NetworkID>VISA</cbc:NetworkID></cac:CardAccount>"
for code in ["30", "58", "48", "54", "55", "59", "10", "42", "1", "ZZZ"]:
    case("pm-%s" % code, STD, ("set", PM + "/cbc:PaymentMeansCode", code))
    case("pm-%s-mandate" % code, STD, ("set", PM + "/cbc:PaymentMeansCode", code), ("add", PM, CT))
    case("pm-%s-card" % code, STD, ("set", PM + "/cbc:PaymentMeansCode", code), ("add", PM, CARD))
    case("pm-%s-no-account" % code, STD, ("set", PM + "/cbc:PaymentMeansCode", code), ("del", PM + "/cac:PayeeFinancialAccount"))
    case("pm-%s-both" % code, STD, ("set", PM + "/cbc:PaymentMeansCode", code), ("add", PM, CT + CARD))
    case("pm-%s-mandate-noaccount" % code, STD, ("set", PM + "/cbc:PaymentMeansCode", code), ("del", PM + "/cac:PayeeFinancialAccount"), ("add", PM, CT))
case("BR-DE-30", STD, ("set", PM + "/cbc:PaymentMeansCode", "59"), ("del", PM + "/cac:PayeeFinancialAccount"), ("add", PM, "<cac:PaymentMandate><cbc:ID>M1</cbc:ID></cac:PaymentMandate>"))
case("BR-DE-31", STD, ("set", PM + "/cbc:PaymentMeansCode", "59"), ("del", PM + "/cac:PayeeFinancialAccount"), ("add", PM, "<cac:PaymentMandate><cbc:ID>M1</cbc:ID></cac:PaymentMandate>"), ("add", S, "<cac:PartyIdentification><cbc:ID schemeID='SEPA'>DE98ZZZ09999999999</cbc:ID></cac:PartyIdentification>"))
# ---- IBAN check digits and format (BR-DE-19, BR-DE-20)
for i, iban in enumerate(["DE79000000001234567890", "DE79000000001234567891", "DE7900000000123456789", "de79000000001234567890", "DE79 0000 0000 1234 5678 90", "XX00", "", "DE89370400440532013000", "GB82WEST12345698765432", "DE89370400440532013001"]):
    case("iban-pay-%d" % i, STD, ("set", PM + "/cbc:PaymentMeansCode", "58"), ("set", PM + "/cac:PayeeFinancialAccount/cbc:ID", iban))
    case("iban-debit-%d" % i, STD, ("set", PM + "/cbc:PaymentMeansCode", "59"), ("del", PM + "/cac:PayeeFinancialAccount"),
         ("add", PM, "<cac:PaymentMandate><cbc:ID>M1</cbc:ID><cac:PayerFinancialAccount><cbc:ID>%s</cbc:ID></cac:PayerFinancialAccount></cac:PaymentMandate>" % iban),
         ("add", S, "<cac:PartyIdentification><cbc:ID schemeID='SEPA'>DE98ZZZ09999999999</cbc:ID></cac:PartyIdentification>"))
# ---- seller contact (BR-DE-2, 5, 6, 7, 27, 28) and addresses (BR-DE-3, 4, 8, 9, 10, 11)
for i, mail in enumerate(["info@service.de", "a@b", "ab@cd.de", "a b@cd.de", "ab@@cd.de", "ab@cd", ".ab@cd.de", "ab@cd.de.", "ab@.cd.de", "ab.@cd.de", "ab@cd..de", "", "x" * 40 + "@example.de", "ü@example.de", "ab@cd.d"]):
    case("mail-%d" % i, STD, ("set", S + "/cac:Contact/cbc:ElectronicMail", mail))
for i, tel in enumerate(["012-3456789", "12", "123", "tel", "+49 (0) 30 / 12 34 56", "1 2 3", "", "a1b2c3"]):
    case("tel-%d" % i, STD, ("set", S + "/cac:Contact/cbc:Telephone", tel))
for name, xp in [("BR-DE-2", S + "/cac:Contact"), ("BR-DE-3", S + "/cac:PostalAddress/cbc:CityName"), ("BR-DE-4", S + "/cac:PostalAddress/cbc:PostalZone"), ("BR-DE-5", S + "/cac:Contact/cbc:Name"),
                 ("BR-DE-6", S + "/cac:Contact/cbc:Telephone"), ("BR-DE-7", S + "/cac:Contact/cbc:ElectronicMail"), ("BR-DE-8", B + "/cac:PostalAddress/cbc:CityName"),
                 ("BR-DE-9", B + "/cac:PostalAddress/cbc:PostalZone"), ("BR-DE-1", "/*/cac:PaymentMeans"), ("BR-DE-15", "/*/cbc:BuyerReference"), ("BR-DE-14", "/*/cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:Percent")]:
    case(name + "-del", STD, ("del", xp))
    case(name + "-empty", STD, ("set", xp, " "))
case("BR-DE-10", STD, ("add", "/*", "<cac:Delivery><cac:DeliveryLocation><cac:Address><cbc:StreetName>x</cbc:StreetName><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:Address></cac:DeliveryLocation></cac:Delivery>"))
case("BR-DE-10-ok", STD, ("add", "/*", "<cac:Delivery><cac:DeliveryLocation><cac:Address><cbc:CityName>Berlin</cbc:CityName><cbc:PostalZone>10115</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:Address></cac:DeliveryLocation></cac:Delivery>"))
# ---- seller identification (BR-DE-16) and the VAT categories it depends on
for cat in ["S", "Z", "E", "AE", "K", "G", "L", "M", "O", "B", "X"]:
    case("vat-%s-noid" % cat, STD, ("set", "//cac:InvoiceLine[1]/cac:Item/cac:ClassifiedTaxCategory/cbc:ID", cat), ("del", S + "/cac:PartyTaxScheme"))
    case("vat-%s-taxrep" % cat, STD, ("set", "//cac:InvoiceLine[1]/cac:Item/cac:ClassifiedTaxCategory/cbc:ID", cat), ("del", S + "/cac:PartyTaxScheme"),
         ("add", "/*", "<cac:TaxRepresentativeParty><cac:PartyName><cbc:Name>R</cbc:Name></cac:PartyName></cac:TaxRepresentativeParty>"))
# ---- document level: type code, specification id, buyer reference, dates, notes, filenames, URLs
for t in ["326", "380", "384", "389", "381", "875", "876", "877", "383", "751", "71"]:
    case("type-%s" % t, STD, ("set", "/*/cbc:InvoiceTypeCode", t))
for i, spec in enumerate(["urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0", "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_2.3", "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.1",
                          "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0", "urn:cen.eu:en16931:2017", "xrechnung_3.0", "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0 ",
                          "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#compliant#urn:xeinkauf.de:kosit:xrechnung:cvd_0.9"]):
    case("spec-%d" % i, STD, ("set", "/*/cbc:CustomizationID", spec))
for i, d in enumerate(["2022-10-04", "2022-1-4", "20221004", "04.10.2022", "2022-10-04Z", "2022-02-30", "", "2022-10-04T10:00:00"]):
    case("date-issue-%d" % i, STD, ("set", "/*/cbc:IssueDate", d))
    case("date-due-%d" % i, STD, ("add", "/*", "<cbc:DueDate>%s</cbc:DueDate>" % d))
case("BR-DE-TMP-32-ok-delivery", STD, ("add", "/*", "<cac:Delivery><cbc:ActualDeliveryDate>2022-10-04</cbc:ActualDeliveryDate></cac:Delivery>"))
case("BR-DE-TMP-32-ok-period", STD, ("add", "/*", "<cac:InvoicePeriod><cbc:StartDate>2022-10-01</cbc:StartDate><cbc:EndDate>2022-10-31</cbc:EndDate></cac:InvoicePeriod>"))
case("BR-DE-26", STD, ("set", "/*/cbc:InvoiceTypeCode", "384"))
case("BR-DE-26-ok", STD, ("set", "/*/cbc:InvoiceTypeCode", "384"), ("add", "/*", "<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>R1</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>"))
SK = ["#SKONTO#TAGE=14#PROZENT=2.00#", "#SKONTO#TAGE=14#PROZENT=2.00#BASISBETRAG=100.00#", "#SKONTO#TAGE=14#PROZENT=2.0#", "#SKONTO#TAGE=14#PROZENT=2,00#", "#skonto#TAGE=14#PROZENT=2.00#", "#SKONTO#TAGE=14#PROZENT=2.00",
      "#SKONTO#TAGE=14#PROZENT=-2.00#", "#SKONTO#TAGE=#PROZENT=2.00#", "#SKONTO#TAGE=14#PROZENT=2.00# ", " #SKONTO#TAGE=14#PROZENT=2.00#", "#SKONTO#TAGE=14#PROZENT=2.00#BASISBETRAG=100#", "#SKONTO#TAGE=14#PROZENT=2.00#BASISBETRAG=-100.00#",
      "Zahlbar in 14 Tagen\n#SKONTO#TAGE=14#PROZENT=2.00#\n#SKONTO#TAGE=30#PROZENT=1.00#", "#SKONTO#TAGE=14#PROZENT=2.00#\n", "text #SKONTO#TAGE=14#PROZENT=2.00#", "#SKONTO#PROZENT=2.00#TAGE=14#", "#VERZUG#TAGE=14#PROZENT=2.00#", "SKONTO"]
for i, t in enumerate(SK):
    case("skonto-%d" % i, STD, ("set", "/*/cac:PaymentTerms/cbc:Note", t))
for i, (a, b) in enumerate([("a.pdf", "b.pdf"), ("a.pdf", "a.pdf"), ("A.pdf", "a.pdf"), ("", ""), ("a.pdf", "")]):
    case("filename-%d" % i, STD, ("add", "/*", "<cac:AdditionalDocumentReference><cbc:ID>D1</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode='application/pdf' filename='%s'>QUJD</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>"
                                  "<cac:AdditionalDocumentReference><cbc:ID>D2</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode='application/pdf' filename='%s'>QUJD</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>" % (a, b)))
for i, u in enumerate(["https://example.de/doc", "http://example.de", "ftp://example.de/x", "example.de/doc", "mailto:a@b.de", "1http://x", "://x", "x:", "x:y", "HTTP://X.DE", "", "http:/x", "urn:isbn:1"]):
    case("uri-%d" % i, STD, ("add", "/*", "<cac:AdditionalDocumentReference><cbc:ID>D1</cbc:ID><cac:Attachment><cac:ExternalReference><cbc:URI>%s</cbc:URI></cac:ExternalReference></cac:Attachment></cac:AdditionalDocumentReference>" % u))
# ---- Extension profile: sub invoice lines
case("BR-DEX-02", EXT, ("set", "//cac:InvoiceLine[1]/cac:SubInvoiceLine[1]/cbc:LineExtensionAmount", "1.00"))
case("BR-DEX-03", EXT, ("del", "//cac:SubInvoiceLine[1]/cac:Item/cac:ClassifiedTaxCategory"))
case("BR-DEX-03-2", EXT, ("dup", "//cac:SubInvoiceLine[1]/cac:Item/cac:ClassifiedTaxCategory"))
for who, xp in (("04", S + "/cac:PartyIdentification/cbc:ID"), ("05", S + "/cac:PartyLegalEntity/cbc:CompanyID"), ("06", B + "/cac:PartyIdentification/cbc:ID"), ("07", S + "/cbc:EndpointID"), ("08", "/*/cac:Delivery/cac:DeliveryLocation/cbc:ID")):
    for i, sch in enumerate(["0204", "0088", "XR01", "XR02", "XR03", "9999", "0060", "ZZZ"]):
        case("BR-DEX-%s-%d" % (who, i), EXT, ("attr", xp, "schemeID", sch))
        case("BR-DEX-%s-%d-std" % (who, i), STD, ("attr", xp, "schemeID", sch))

generate(cases, out, src, logfile)
