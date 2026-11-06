/*
 * What to change in the request. For the checks that fail on the converted XML and are about amounts, the figures are worked out again from the request's own
 * fields (the formulas of the rules, EN 16931 BR-CO-10 … BR-CO-17, the VAT breakdown rules and the line amount rule R120) and the field to change is named with
 * the value that would make the rule pass. Only the request fields are used; nothing is guessed: when a figure the rule needs is missing, no value is proposed.
 *
 * RequestFixes.suggest(parsedInput, failedIds) → [{ rule, field, now, should, text, args }]   (text is an English template, args fill its {…})
 */
(function () {
  "use strict";
  const SCALE = 1e6;
  const num = (s) => (s === undefined || s === null || String(s).trim() === "" || isNaN(Number(s)) ? null : Math.round(Number(s) * SCALE));
  const f2 = (n) => { const v = Math.round(n / (SCALE / 100)); return (v / 100).toFixed(2); };        // to 2 decimals (the amounts of a request)
  const str = (o, k) => (o && o[k] !== undefined && o[k] !== null ? String(o[k]) : "");
  const arr = (x) => (Array.isArray(x) ? x : []);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);

  function suggest(input, failed) {
    const list = input && Array.isArray(input.req) ? input.req : Array.isArray(input) ? input : [input];
    const inv = list[0];
    if (!inv || typeof inv !== "object") return [];
    const ov = {};                                    // the values proposed so far: the next figure is worked out from them, so one change is not followed by a second surprise
    const has = (id, deps) => failed.includes(id) || (deps || []).some((d) => ov[d] !== undefined || d === "x");
    const out = [];
    const add = (rule, field, now, should, text, args, where) => {
      if (should === null || should === undefined || should === "") return;
      const a = num(now), b = num(should);
      if (a !== null && b !== null && Math.abs(a - b) < SCALE / 200) return;        // already the same to 2 decimals
      if (!where) ov[field] = should; else ov[where.replace(/\[\d+\]/, "") + "." + field] = should;
      out.push({ rule, field, where: where || "", now: str({ n: now }, "n"), should: String(should), text, args: Object.assign({ field, now: now === "" ? "–" : now, should }, args || {}) });
    };
    const lines = arr(inv.InvoiceLineList), head = arr(inv.InvoiceHeaderItemList);

    const lineFix = {};
    // line net amount = quantity × net price / base quantity − allowances + charges (R120)
    if (has("PEPPOL-EN16931-R120")) lines.forEach((L, i) => {
      const q = num(str(L, "LineQuantity")), p = num(str(L, "LineItemNetPrice")), base = str(L, "LineItemBaseQuantity") === "" ? 1 : Number(str(L, "LineItemBaseQuantity"));
      if (q === null || p === null || !(base > 0)) return;
      const rowsL = arr(L.InvoiceLineItemList), s = (k) => sum(rowsL.map((r) => num(str(r, k)) || 0));
      const should = (q / SCALE) * (p / base) - s("LineAllowanceAmount") + s("LineChargeAmount");
      const before = out.length;
      add("PEPPOL-EN16931-R120", "LineNetAmount", str(L, "LineNetAmount"), f2(should), "{field} is {now}; quantity {q} × price {p}{b} less allowances {a} plus charges {c} = {should}.",
        { q: f2(q).replace(/\.00$/, ""), p: f2(p), b: base !== 1 ? " / " + base : "", a: f2(s("LineAllowanceAmount")), c: f2(s("LineChargeAmount")) }, "InvoiceLineList[" + (i + 1) + "]");
      if (out.length > before) lineFix[i] = num(out[out.length - 1].should);
    });
    // the sum of the lines (BT-106)
    const lineNets = lines.map((L, i) => (lineFix[i] !== undefined ? lineFix[i] : num(str(L, "LineNetAmount"))));
    const linesTotal = lineNets.every((x) => x !== null) && lineNets.length ? sum(lineNets) : null;
    if (has("BR-CO-10", Object.keys(lineFix).length ? ["x"] : []) && linesTotal !== null)
      add("BR-CO-10", "DocumentNetAmount", str(inv, "DocumentNetAmount"), f2(linesTotal), "{field} is {now}; the {n} lines (LineNetAmount) add up to {should}.", { n: lines.length });

    // total without VAT (BT-109) = lines − document allowances + document charges
    const g = (k) => num(ov[k] !== undefined ? ov[k] : str(inv, k));
    const docNet = g("DocumentNetAmount"), allow = g("DocumentTotalAllowance") || 0, charge = g("DocumentTotalCharge") || 0;
    if (has("BR-CO-13", ["DocumentNetAmount"]) && docNet !== null)
      add("BR-CO-13", "DocumentTotalWithoutVAT", str(inv, "DocumentTotalWithoutVAT"), f2(docNet - allow + charge), "{field} is {now}; DocumentNetAmount {net} − allowances {allow} + charges {charge} = {should}.", { net: f2(docNet), allow: f2(allow), charge: f2(charge) });

    // the VAT breakdown rows: taxable amount of a category (BR-<cat>-08), VAT amount of a row (BR-CO-17), total VAT (BT-110), in that order, each from the one before
    const rows = head.map((r) => ({ r, taxable: num(str(r, "TaxableAmount")), tax: num(str(r, "TaxAmount")), rate: Number(str(r, "TaxRate")), cat: str(r, "TaxCategoryID") })).filter((x) => x.taxable !== null || x.tax !== null || x.cat);
    const catIds = ["BR-S-08", "BR-Z-08", "BR-E-08", "BR-AE-08", "BR-K-08", "BR-G-08", "BR-O-08", "BR-AF-08", "BR-AG-08"];
    const rowAt = (x) => "InvoiceHeaderItemList[" + (head.indexOf(x.r) + 1) + "]";
    if (catIds.some((id) => has(id)) || Object.keys(lineFix).length) rows.forEach((x) => {
      const same = lines.filter((L) => str(L, "LineVATCategory") === x.cat && Number(str(L, "LineVATRate") || 0) === (isNaN(x.rate) ? 0 : x.rate));
      if (!same.length) return;
      const nets = same.map((L) => (lineFix[lines.indexOf(L)] !== undefined ? lineFix[lines.indexOf(L)] : num(str(L, "LineNetAmount"))));
      if (nets.some((n) => n === null)) return;
      const dc = (kind) => sum(head.filter((r) => str(r, "Document" + kind + "TaxCategory") === x.cat && str(r, "Document" + kind + "Amount") !== "").map((r) => num(str(r, "Document" + kind + "Amount")) || 0));
      const should = sum(nets) - dc("Allowance") + dc("Charge");
      const before = out.length;
      add("BR-" + (x.cat || "S") + "-08", "TaxableAmount", str(x.r, "TaxableAmount"), f2(should), "{field} is {now}; the {n} line(s) of category {cat} at {rate} % add up to {lines}{ac}, giving {should}.",
        { n: same.length, cat: x.cat, rate: isNaN(x.rate) ? 0 : x.rate, lines: f2(sum(nets)), ac: dc("Allowance") || dc("Charge") ? " (less allowances " + f2(dc("Allowance")) + ", plus charges " + f2(dc("Charge")) + ")" : "" }, rowAt(x));
      if (out.length > before) x.taxable = num(f2(should));
    });
    let changedTax = false;
    rows.forEach((x) => {
      if (x.taxable === null || isNaN(x.rate) || str(x.r, "TaxRate") === "") return;
      if (!has("BR-CO-17") && !out.some((o) => o.where === rowAt(x) && o.field === "TaxableAmount")) return;
      const before = out.length;
      add("BR-CO-17", "TaxAmount", str(x.r, "TaxAmount"), f2(Math.round(x.taxable * x.rate / 100)), "{field} is {now}; the taxable amount {base} at {rate} % gives {should}.", { base: f2(x.taxable), rate: x.rate }, rowAt(x));
      if (out.length > before) { x.tax = num(out[out.length - 1].should); changedTax = true; }
    });
    const taxSum = rows.length && rows.every((x) => x.tax !== null || !x.cat) ? sum(rows.map((x) => x.tax || 0)) : null;
    if ((has("BR-CO-14") || changedTax) && taxSum !== null)
      add("BR-CO-14", "DocumentTotalTaxAmount", str(inv, "DocumentTotalTaxAmount"), f2(taxSum), "{field} is {now}; the TaxAmount of the VAT breakdown rows add up to {should}.");

    // total with VAT (BT-112), amount due (BT-115)
    const exVat = g("DocumentTotalWithoutVAT"), vat = g("DocumentTotalTaxAmount");
    if (has("BR-CO-15", ["DocumentTotalWithoutVAT", "DocumentTotalTaxAmount"]) && exVat !== null && vat !== null)
      add("BR-CO-15", "DocumentTotalWithVAT", str(inv, "DocumentTotalWithVAT"), f2(exVat + vat), "{field} is {now}; DocumentTotalWithoutVAT {ex} + DocumentTotalTaxAmount {vat} = {should}.", { ex: f2(exVat), vat: f2(vat) });
    const inc = g("DocumentTotalWithVAT"), paid = g("DocumentPaidAmount") || 0, round = g("DocumentRoundingAmount") || 0;
    if (has("BR-CO-16", ["DocumentTotalWithVAT", "DocumentPaidAmount"]) && inc !== null)
      add("BR-CO-16", "DocumentDueAmount", str(inv, "DocumentDueAmount"), f2(inc - paid + round), "{field} is {now}; DocumentTotalWithVAT {inc} − paid {paid} + rounding {round} = {should}.", { inc: f2(inc), paid: f2(paid), round: f2(round) });

    // the sums of document allowances and charges (BT-107, BT-108)
    const dsum = (kind) => { const xs = head.filter((r) => str(r, "Document" + kind + "Amount") !== "").map((r) => num(str(r, "Document" + kind + "Amount"))); return xs.length && xs.every((x) => x !== null) ? sum(xs) : null; };
    if (has("BR-CO-11") && dsum("Allowance") !== null)
      add("BR-CO-11", "DocumentTotalAllowance", str(inv, "DocumentTotalAllowance"), f2(dsum("Allowance")), "{field} is {now}; the DocumentAllowanceAmount rows add up to {should}.");
    if (has("BR-CO-12") && dsum("Charge") !== null)
      add("BR-CO-12", "DocumentTotalCharge", str(inv, "DocumentTotalCharge"), f2(dsum("Charge")), "{field} is {now}; the DocumentChargeAmount rows add up to {should}.");

    return out;
  }

  // ---------- hints for the other rules: which request field stands behind the BT numbers a failing rule names ----------
  // [field, scope]: "head" = the header, "item" = a row of InvoiceHeaderItemList, "line" = a line, "row" = a row of the line's InvoiceLineItemList
  const FIELD_OF = {};
  const put = (scope, pairs) => pairs.split(/\s+/).forEach((p) => { const [bt, f] = p.split("="); FIELD_OF[bt] = [f, scope]; });
  put("head", "BT-1=InvoiceNumber BT-2=InvoiceDate BT-3=InvoiceType BT-5=InvoiceCurrencyCode BT-6=VATCurrencyCode BT-7=VATPointDate BT-8=VATPointCode BT-9=DueDate BT-10=BuyerReference BT-11=ProjectReference " +
    "BT-12=ContractReference BT-13=PurchaseOrderReference BT-14=SalesOrderReference BT-15=ReceptionReference BT-16=ShippingReference BT-19=BuyerAccountingReference BT-23=BusinessProcessType BT-24=ProfileType " +
    "BT-27=SellerLegalName BT-28=SellerTradingName BT-30=SellerLegalID BT-31=SellerVATID BT-32=SellerTaxID BT-34=SellerEndpoint BT-35=SellerAddress1 BT-37=SellerCity BT-38=SellerPostcode BT-39=SellerSubdivision " +
    "BT-40=SellerCountry BT-41=SellerContactName BT-42=SellerContactNumber BT-43=SellerEmail BT-44=BuyerLegalName BT-45=BuyerTradingName BT-47=BuyerLegalID BT-48=BuyerVATID BT-49=BuyerEndpoint " +
    "BT-50=BuyerAddress1 BT-52=BuyerCity BT-53=BuyerPostcode BT-54=BuyerSubdivision BT-55=BuyerCountry BT-56=BuyerContactName BT-57=BuyerContactNumber BT-58=BuyerEmail BT-59=PayeeName BT-61=PayeeLegalID " +
    "BT-62=TaxRepresentativeName BT-63=TaxRepresentativeVATID BT-70=DeliveryPartyName BT-71=DeliveryLocationID BT-72=DeliveryDateEffective BT-73=InvoiceStartDate BT-74=InvoiceEndDate BT-75=DeliveryAddress1 " +
    "BT-77=DeliveryCity BT-78=DeliveryPostcode BT-80=DeliveryCountry BT-81=PaymentMeansCode BT-82=PaymentMeansText BT-83=PaymentID BT-84=BankAccountID BT-85=PaymentAccountName BT-86=PaymentServiceProviderID " +
    "BT-87=CardPaymentAccountID BT-88=CardPaymentAccountName BT-89=DirectDebitID BT-90=DirectBankIdentifier BT-91=DirectDebitAccount BT-106=DocumentNetAmount BT-107=DocumentTotalAllowance BT-108=DocumentTotalCharge " +
    "BT-109=DocumentTotalWithoutVAT BT-110=DocumentTotalTaxAmount BT-111=DocumentTotalTaxAmount_TaxCurrency BT-112=DocumentTotalWithVAT BT-113=DocumentPaidAmount BT-114=DocumentRoundingAmount BT-115=DocumentDueAmount");
  put("item", "BT-20=PaymentTerms BT-22=InvoiceNote BT-25=PreviousInvoiceIssueID BT-26=PreviousInvoiceIssueDate BT-29=SellerID BT-46=BuyerID BT-60=PayeeID BT-92=DocumentAllowanceAmount BT-93=DocumentAllowanceBaseAmount " +
    "BT-94=DocumentAllowancePercentage BT-95=DocumentAllowanceTaxCategory BT-97=DocumentAllowanceReason BT-98=DocumentAllowanceReasonCode BT-99=DocumentChargeAmount BT-100=DocumentChargeBaseAmount " +
    "BT-101=DocumentChargePercentage BT-102=DocumentChargeTaxCategory BT-103=DocumentChargeVATRate BT-104=DocumentChargeReason BT-105=DocumentChargeReasonCode BT-116=TaxableAmount BT-117=TaxAmount " +
    "BT-118=TaxCategoryID BT-119=TaxRate BT-120=TaxExemptionReason BT-121=TaxExemptionCode BT-122=InvoicedDocumentReference BT-123=AdditionalDocDescription BT-124=AdditionalDocURL BT-125=AdditionalDocEmbedded");
  put("line", "BT-126=InvoiceLineID BT-128=InvoiceLineObjectID BT-129=LineQuantity BT-130=LineUOMCode BT-131=LineNetAmount BT-132=LinePurchaseOrderReference BT-133=LineBuyerAccountingReference BT-134=LineStartDate " +
    "BT-135=LineEndDate BT-146=LineItemNetPrice BT-148=LineItemGrossPrice BT-149=LineItemBaseQuantity BT-150=LineItemUoM BT-151=LineVATCategory BT-152=LineVATRate BT-153=ItemName BT-154=ItemDescription " +
    "BT-155=LineItemSellerIdentifier BT-156=LineItemBuyerIdentifier BT-157=LineItemStandardIdentifier BT-158=LineItemClassification BT-159=LineItemOriginCountry");
  put("row", "BT-127=LineNote BT-136=LineAllowanceAmount BT-137=LineAllowanceBaseAmount BT-138=LineAllowancePercentage BT-139=LineAllowanceReason BT-140=LineAllowanceReasonCode BT-141=LineChargeAmount " +
    "BT-142=LineChargeBaseAmount BT-143=LineChargePercentage BT-144=LineChargeReason BT-145=LineChargeReasonCode BT-147=LineItemDiscount BT-160=LineItemAttributeName BT-161=LineItemAttributeValue");

  // checks: [{ id, text }] of the failing rules; skip: rule ids already answered with a figure. → [{ rule, bt, field, where, now, state }]  state: "missing" | "present"
  function hints(input, checks, skip) {
    const list = input && Array.isArray(input.req) ? input.req : Array.isArray(input) ? input : [input];
    const inv = list[0];
    if (!inv || typeof inv !== "object") return [];
    const filled = (o, k) => o && o[k] !== undefined && o[k] !== null && String(o[k]) !== "";
    const items = arr(inv.InvoiceHeaderItemList), lines = arr(inv.InvoiceLineList);
    const out = [], seen = new Set();
    (checks || []).forEach((c) => {
      // the amount rules are answered by suggest() (a wrong figure makes the rules after it fail too, and optional figures such as the prepaid amount are not "missing")
      if ((skip || []).includes(c.id) || /^BR-CO-1[0-7]$|^BR-[A-Z]+-08$|^PEPPOL-EN16931-R120$/.test(c.id)) return;
      const bts = (c.only ? Array.from(c.only) : []).concat(String(c.text || "").match(/\bBT-\d+\b/g) || []).filter((b, i, a) => /^BT-/.test(b) && a.indexOf(b) === i);
      bts.forEach((bt) => {
        const m = FIELD_OF[bt];
        if (!m) return;
        const [field, scope] = m;
        const key = c.id + "|" + field;
        if (seen.has(key)) return;
        seen.add(key);
        const add = (where, now, st) => out.push({ rule: c.id, bt, field, where, now, state: st });
        if (scope === "head") { add("", filled(inv, field) ? String(inv[field]) : "", filled(inv, field) ? "present" : "missing"); return; }
        const groups = scope === "item" ? [["InvoiceHeaderItemList", items]] : scope === "line" ? [["InvoiceLineList", lines]] :
          [lines.map((L, i) => ["InvoiceLineList[" + (i + 1) + "].InvoiceLineItemList", arr(L.InvoiceLineItemList)])].reduce((a, b) => a.concat(b), []);
        if (scope === "item" || scope === "row") {
          // optional rows: missing only when no row has the field
          const rows = groups.reduce((a, g) => a.concat(g[1].map((r, i) => [g[0] + "[" + (i + 1) + "]", r])), []);
          const hit = rows.find(([, r]) => filled(r, field));
          if (hit) add(hit[0], String(hit[1][field]), "present"); else add(groups.length === 1 ? groups[0][0] : "", "", "missing");
        } else {
          const gone = lines.map((L, i) => [i, L]).filter(([, L]) => !filled(L, field));
          if (gone.length) gone.slice(0, 5).forEach(([i]) => add("InvoiceLineList[" + (i + 1) + "]", "", "missing"));
          else add("InvoiceLineList[1]", String(lines[0][field]), "present");
        }
      });
    });
    return out;
  }
  window.RequestFixes = { suggest, hints };
})();
