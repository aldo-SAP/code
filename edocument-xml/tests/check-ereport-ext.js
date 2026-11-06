#!/usr/bin/env node
// E-report built from a document that carries the report's details in a header extension (key/value pairs) and the billing framework in the type code's name attribute.
// The document is the French example with those two changes; the report must take BT-23 from the name attribute and the id and period from the extension.
"use strict";
const { open } = require("./lib/engine");
(async () => {
  const e = await open();
  const r = await e.page.evaluate(() => {
    const NS = "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2";
    const make = (withInfo) => {
      const d = new DOMParser().parseFromString(window.FR_SAMPLE_XML, "application/xml"), R = d.documentElement;
      const cn = R.localName === "CreditNote", tc = R.getElementsByTagNameNS("*", cn ? "CreditNoteTypeCode" : "InvoiceTypeCode")[0];
      const pid = R.getElementsByTagNameNS("*", "ProfileID")[0];
      if (withInfo) {
        tc.setAttribute("name", "S1"); pid.textContent = "urn:example:profile:1.0";
        const mk = (k, v) => "<x:RestrictedInformation xmlns:x='urn:x'><x:Key>" + k + "</x:Key><x:Value>" + v + "</x:Value></x:RestrictedInformation>";
        const ext = new DOMParser().parseFromString("<ext:UBLExtensions xmlns:ext='" + NS + "'><ext:UBLExtension><ext:ExtensionContent><x:Ext xmlns:x='urn:x'>" +
          mk("entryType", "INVOICE") + mk("issuerAssignedReportId", "RPT-0001") + mk("reportPeriodStart", "2026-10-11") + mk("reportPeriodEnd", "2026-10-20") +
          "</x:Ext></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>", "application/xml").documentElement;
        R.insertBefore(d.importNode(ext, true), R.firstChild);
      }
      return EReport.build(R, R.localName).xml;
    };
    return { plain: make(false), ext: make(true) };
  });
  const has = (x, t) => x.includes(t);
  const problems = [];
  if (!has(r.ext, "<ID>S1</ID>")) problems.push("BT-23 not taken from the type code's name attribute");
  if (!has(r.ext, "<TypeID>urn.cpro.gouv.fr:1p0:ereporting</TypeID>")) problems.push("specification identifier not set for a document with report details");
  if (!has(r.ext, "<Id>RPT-0001</Id>")) problems.push("report id not taken from the extension");
  if (!has(r.ext, "<StartDate>20261011</StartDate>") || !has(r.ext, "<EndDate>20261020</EndDate>")) problems.push("report period not taken from the extension");
  if (has(r.plain, "RPT-0001") || has(r.plain, "<ID>S1</ID>") && !/<ID>(B1|S1)<\/ID>/.test(r.plain)) problems.push("a plain document changed");
  console.log(problems.length ? "FAIL " + problems.join("\n     ") : "ok   report details and billing framework read from the extension");
  // the checks on the extension's own elements: a document with the elements wrong must fail them, the French example with one extension added must not
  const c = await e.page.evaluate(() => {
    const run = (xmlFix) => {
      const d = new DOMParser().parseFromString(window.FR_SAMPLE_XML, "application/xml"), R = d.documentElement;
      xmlFix(d, R);
      return EN16931.check(R, R.localName, EN16931.detect(R)).filter((x) => !x.ok).map((x) => x.id);
    };
    const add = (d, R, xml) => R.insertBefore(d.importNode(new DOMParser().parseFromString("<ext:UBLExtensions xmlns:ext='urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2' xmlns:x='urn:x' xmlns:cbc='urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'><ext:UBLExtension><ext:ExtensionContent>" + xml + "</ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>", "application/xml").documentElement, true), R.firstChild);
    const cac = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
    return {
      good: run((d, R) => add(d, R, "<x:RegistrationData><cbc:ID>1</cbc:ID><x:IDType listID='PUF-001-REGISTRATIONDATA'>FR:APE</x:IDType></x:RegistrationData>")),
      badType: run((d, R) => add(d, R, "<x:RegistrationData><cbc:ID>1</cbc:ID><x:IDType listID='PUF-001-REGISTRATIONDATA'>XX:Nope</x:IDType></x:RegistrationData>")),
      badList: run((d, R) => add(d, R, "<x:ADAID><cbc:ID>1</cbc:ID><x:IDType listID='OTHER'>GEN:UnitCode</x:IDType></x:ADAID>")),
      badInKind: run((d, R) => add(d, R, "<x:PaymentInKind><x:Amount currencyID='USD'>1</x:Amount></x:PaymentInKind>")),
      badTaxCur: run((d, R) => add(d, R, "<x:RegistrationData><cbc:ID>1</cbc:ID><x:IDType listID='PUF-001-REGISTRATIONDATA'>FR:APE</x:IDType></x:RegistrationData><x:TaxCurrencyTaxAmount currencyID='USD'>1</x:TaxCurrencyTaxAmount>"))
    };
  });
  const need = (name, list, id, want) => { if (list.includes(id) !== want) problems.push(name + ": " + id + (want ? " should fail" : " should not fail") + " (failing: " + list + ")"); };
  need("registration data ok", c.good, "CHK-30", false); need("unknown registration type", c.badType, "CHK-30", true); need("wrong list id", c.badList, "CHK-31", true);
  need("payment in kind currency", c.badInKind, "CHK-29", true); need("tax currency amount", c.badTaxCur, "CHK-28", true);
  console.log(problems.length ? "FAIL " + problems.join("\n     ") : "ok   the checks on the extension's elements");
  await e.close();
  process.exit(problems.length ? 1 : 0);
})();
