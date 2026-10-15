/*
 * Which fields the viewer shows, and in which order: [path, label, BT number (a string or {role: BT}), options].
 * The paths are relative to the document, party, line … element they are used in. Rows that belong to one country's format (the UAE
 * transaction type, for example) are not here: a country adds them in its profile (countries/<id>/profile.js).
 *
 * EdocSpecs(h) needs the helpers of the viewer: { esc, txt, T, val, first, renderValue }.
 */
window.EdocSpecs = function (h) {
  "use strict";
  const { esc, txt, T, val, first, renderValue } = h;
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
    "DocumentCurrencyCode", "TaxCurrencyCode", "BuyerReference", "AccountingCost", "Note", "ProfileID", "CustomizationID", "UBLVersionID", "ProfileExecutionID"];

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

  function itemProperty(el) {
    return "<b>" + esc(val(el, "Name")) + "</b>: " + esc(val(el, "Value")) +
      (first(el, "ValueQuantity") ? " " + renderValue(first(el, "ValueQuantity")) : "");
  }

  // Fields EN 16931 requires (cardinality 1..1 in their group): shown even when empty fields are hidden.
  const REQUIRED = new Set(("BT-1 BT-2 BT-3 BT-5 BT-24 BT-27 BT-40 BT-44 BT-55 BT-106 BT-109 BT-112 BT-115 " +
    "BT-126 BT-129 BT-130 BT-131 BT-146 BT-151 BT-153").split(" "));
  return { DOC_SPEC, DOC_CLAIMS, REF_SPEC, REF_CLAIMS, ADR_SPEC, PARTY_SPEC, PARTY_ROLE_FIELDS, DELIVERY_SPEC, PAYMEANS_SPEC, PAYTERMS_SPEC, AC_SPEC, LINE_AC_SPEC, TOTAL_SPEC, LINE_SPEC, REQUIRED };
};
