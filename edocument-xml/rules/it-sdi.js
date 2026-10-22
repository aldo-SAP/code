/*
 * The controls of the Sistema di Interscambio (SdI) that can be made on the file alone: the invoice is rejected with the error code when one fails.
 * Source: "Elenco dei controlli effettuati sul file fattura del Sistema di Interscambio", version 2.0 (31/01/2025), which gives each control as a rule with its
 * pseudo-code and tolerances, and "Specifiche tecniche relative al Sistema di Interscambio" version 1.8.4 (31/03/2026) for the file name (2.2).
 * Not here: the controls that need something the file does not hold: the registries (IndicePA, Anagrafe Tributaria: 00300 to 00324, 00398, 00399), the invoices sent before
 * (00002, 00404), the declarations of intent (00477), the signature (00100 to 00107), the size of the file (00003), and the format errors count (00201).
 * 00200 (the file does not follow the format) is what the schema check (it-schema.js) reports.
 */
(function () {
  "use strict";
  const DSIG = "http://www.w3.org/2000/09/xmldsig#";
  const kids = (el, name) => Array.from(el ? el.children : []).filter((k) => k.localName === name);
  const one = (el, name) => kids(el, name)[0] || null;
  const at = (el, path) => { let c = el; for (const s of path.split("/")) { c = one(c, s); if (!c) return null; } return c; };
  const val = (el, path) => { const e = at(el, path); return e ? e.textContent.trim() : ""; };
  const num = (s) => (s === "" || s == null ? NaN : parseFloat(s));
  const cents = (x) => Math.round(x * 1e6) / 1e6;
  // the list gives "Tolleranza: 1 centesimo" (and 1 euro for 00422); a difference of exactly the tolerance counts as within it
  const within = (a, b, tol) => cents(Math.abs(a - b)) <= tol;
  const key = (r) => (isNaN(r) ? "" : r.toFixed(2));      // rates compared as numbers

  // code, English text, the official Italian text
  const RULES = [
    ["00001", "The file name must be the country code, the transmitter's fiscal identifier, an underscore and a progressive of up to 5 letters or digits, then .xml (specification 2.2)", "Nome file non valido"],
    ["00400", "2.2.1.14 <Natura> is missing although 2.2.1.12 <AliquotaIVA> is zero", "2.2.1.14 <Natura> non presente a fronte di 2.2.1.12 <AliquotaIVA> pari a zero"],
    ["00401", "2.2.1.14 <Natura> is present although 2.2.1.12 <AliquotaIVA> is not zero", "2.2.1.14 <Natura> presente a fronte di 2.2.1.12 <AliquotaIVA> diversa da zero"],
    ["00403", "2.1.1.3 <Data> is later than the date of reception", "2.1.1.3 <Data> successiva alla data di ricezione"],
    ["00409", "The invoice is a duplicate within the batch", "Fattura duplicata nel lotto"],
    ["00411", "2.1.1.5 <DatiRitenuta> is missing although a 2.2.1 <DettaglioLinee> has 2.2.1.13 <Ritenuta> SI", "2.1.1.5 <DatiRitenuta> non presente a fronte di almeno un blocco 2.2.1 <DettaglioLinee> con 2.2.1.13 <Ritenuta> uguale a SI"],
    ["00413", "2.1.1.7.7 <Natura> is missing although 2.1.1.7.5 <AliquotaIVA> is zero", "2.1.1.7.7 <Natura> non presente a fronte di 2.1.1.7.5 <AliquotaIVA> pari a zero"],
    ["00414", "2.1.1.7.7 <Natura> is present although 2.1.1.7.5 <AliquotaIVA> is not zero", "2.1.1.7.7 <Natura> presente a fronte di 2.1.1.7.5 <Aliquota IVA> diversa da zero"],
    ["00415", "2.1.1.5 <DatiRitenuta> is missing although 2.1.1.7.6 <Ritenuta> is SI", "2.1.1.5 <DatiRitenuta> non presente a fronte di 2.1.1.7.6 <Ritenuta> uguale a SI"],
    ["00417", "1.4.1.1 <IdFiscaleIVA> and 1.4.1.2 <CodiceFiscale> are both missing (at least one must be given)", "1.4.1.1 <IdFiscaleIVA> e 1.4.1.2 <CodiceFiscale> non valorizzati (almeno uno dei due deve essere valorizzato)"],
    ["00418", "2.1.1.3 <Data> is earlier than 2.1.6.3 <Data>", "2.1.1.3 <Data> antecedente a 2.1.6.3 <Data>"],
    ["00419", "2.2.2 <DatiRiepilogo> is missing for at least one value of 2.1.1.7.5 <AliquotaIVA> or 2.2.1.12 <AliquotaIVA>", "2.2.2 <DatiRiepilogo> non presente in corrispondenza di almeno un valore di 2.1.1.7.5 <AliquotaIVA> o 2.2.1.12 <AliquotaIVA>"],
    ["00420", "2.2.2.2 <Natura> of type N6 with 2.2.2.7 <EsigibilitaIVA> S (split payment)", "2.2.2.2 <Natura> con valore di tipo N6 a fronte di 2.2.2.7 <EsigibilitaIVA> uguale a S (scissione pagamenti)"],
    ["00421", "2.2.2.6 <Imposta> is not calculated by the rules of the technical specifications (tolerance 0.01)", "2.2.2.6 <Imposta> non calcolato secondo le regole definite nelle specifiche tecniche"],
    ["00422", "2.2.2.5 <ImponibileImporto> is not calculated by the rules of the technical specifications (tolerance 1)", "2.2.2.5 <ImponibileImporto> non calcolato secondo le regole definite nelle specifiche tecniche"],
    ["00423", "2.2.1.11 <PrezzoTotale> is not calculated by the rules of the technical specifications (tolerance 0.01)", "2.2.1.11 <PrezzoTotale> non calcolato secondo le regole definite nelle specifiche tecniche"],
    ["00424", "2.2.1.12, 2.2.2.1 or 2.1.1.7.5 <AliquotaIVA> is not given as a percentage", "2.2.1.12 <AliquotaIVA> o 2.2.2.1 <AliquotaIVA> o 2.1.1.7.5 <AliquotaIVA> non indicata in termini percentuali"],
    ["00425", "2.1.1.4 <Numero> contains no digit", "2.1.1.4 <Numero> non contenente caratteri numerici"],
    ["00427", "1.1.4 <CodiceDestinatario> has 7 characters with 1.1.3 <FormatoTrasmissione> FPA12, or 6 characters with FPR12 or FSM10", "1.1.4 <CodiceDestinatario> di 7 caratteri non ammesso a fronte di 1.1.3 <FormatoTrasmissione> con valore FPA12 o 1.1.4 <CodiceDestinatario> di 6 caratteri non ammesso a fronte di 1.1.3 <FormatoTrasmissione> con valore FPR12 o FSM10"],
    ["00428", "1.1.3 <FormatoTrasmissione> does not match the attribute versione", "1.1.3 <FormatoTrasmissione> non coerente con il valore dell'attributo VERSIONE"],
    ["00429", "2.2.2.2 <Natura> is missing although 2.2.2.1 <AliquotaIVA> is zero", "2.2.2.2 <Natura> non presente a fronte di 2.2.2.1 <AliquotaIVA> pari a zero"],
    ["00430", "2.2.2.2 <Natura> is present although 2.2.2.1 <AliquotaIVA> is not zero", "2.2.2.2 <Natura> presente a fronte di 2.2.2.1 <AliquotaIVA> diversa da zero"],
    ["00437", "2.1.1.8.2 <Percentuale> and 2.1.1.8.3 <Importo> are both missing although 2.1.1.8.1 <Tipo> is given", "2.1.1.8.2 <Percentuale> e 2.1.1.8.3 <Importo> non presenti a fronte di 2.1.1.8.1 <Tipo> valorizzato"],
    ["00438", "2.2.1.10.2 <Percentuale> and 2.2.1.10.3 <Importo> are both missing although 2.2.1.10.1 <Tipo> is given", "2.2.1.10.2 <Percentuale> e 2.2.1.10.3 <Importo> non presenti a fronte di 2.2.1.10.1 <Tipo> valorizzato"],
    ["00443", "The values of 2.2.1.12 <AliquotaIVA> or 2.1.1.7.5 <AliquotaIVA> do not match those of 2.2.2.1 <AliquotaIVA>", "Non c'è corrispondenza tra i valori indicati nell'elemento 2.2.1.12 <AliquotaIVA> o 2.1.1.7.5 <AliquotaIVA> e quelli dell'elemento 2.2.2.1 <AliquotaIVA>"],
    ["00444", "The values of 2.2.1.14 <Natura> or 2.1.1.7.7 <Natura> do not match those of 2.2.2.2 <Natura>", "Non c'è corrispondenza tra i valori indicati nell'elemento 2.2.1.14 <Natura> o 2.1.1.7.7 <Natura> e quelli dell'elemento 2.2.2.2 <Natura>"],
    ["00445", "The generic value N2, N3 or N6 is no longer allowed as the nature of the operation", "Non è più ammesso il valore generico N2, N3 o N6 come codice natura dell'operazione"],
    ["00471", "For this 2.1.1.1 <TipoDocumento> the seller cannot be the same as the buyer", "Per il valore indicato nell'elemento 2.1.1.1 <TipoDocumento> il cedente/prestatore non può essere uguale al cessionario/committente"],
    ["00472", "For this 2.1.1.1 <TipoDocumento> the seller must be the same as the buyer", "Per il valore indicato nell'elemento 2.1.1.1 <TipoDocumento> il cedente/prestatore deve essere uguale al cessionario/committente"],
    ["00473", "For this 2.1.1.1 <TipoDocumento> the value of 1.2.1.1.1 <IdPaese> is not allowed", "Per il valore indicato nell'elemento 2.1.1.1 <TipoDocumento> il valore nell'elemento 1.2.1.1.1 <IdPaese> non è ammesso"],
    ["00474", "For this 2.1.1.1 <TipoDocumento> no line may have 2.2.1.12 <AliquotaIVA> zero", "Per il valore indicato nell'elemento 2.1.1.1 <TipoDocumento> non sono ammesse linee di dettaglio con l'elemento 2.2.1.12 <AliquotaIVA> contenente valore zero"],
    ["00475", "For this 2.1.1.1 <TipoDocumento> the buyer's 1.4.1.1 <IdFiscaleIVA> must be present", "Per il valore indicato nell'elemento 2.1.1.1 <TipoDocumento> deve essere presente l'elemento 1.4.1.1 <IdFiscaleIVA> del cessionario/committente"],
    ["00476", "1.2.1.1.1 <IdPaese> and 1.4.1.1.1 <IdPaese> cannot both be a country other than IT", "Gli elementi 1.2.1.1.1 <IdPaese> e 1.4.1.1.1 <IdPaese> non possono essere entrambi valorizzati con codice diverso da IT"]
  ];
  const TEXT = {}; RULES.forEach((r) => { TEXT[r[0]] = r[1]; });

  // the sentences of the details, English and Italian ({_x}: a value left as written)
  const D = {
    name: ["“{_a}” does not follow the pattern", "“{_a}” non rispetta lo schema del nome"],
    date: ["Data {_a} is after today ({_b}); the SdI compares it with the date it receives the file", "Data {_a} è successiva a oggi ({_b}); il SdI la confronta con la data in cui riceve il file"],
    line: ["Line {_a}", "Linea {_a}"],
    dupeYear: ["Invoices {_a} and {_b} have the same number and the same year", "Le fatture {_a} e {_b} hanno lo stesso numero e lo stesso anno"],
    dupeDate: ["Invoices {_a} and {_b} have the same number and the same date", "Le fatture {_a} e {_b} hanno lo stesso numero e la stessa data"],
    ritenuta: ["No DatiRitenuta in the document", "Nessun DatiRitenuta nel documento"],
    credit: ["Data {_a} is before the Data {_b} of the related invoice", "Data {_a} è precedente alla Data {_b} della fattura collegata"],
    rates: ["{_a} different rates are used, but there are {_b} DatiRiepilogo", "Sono usate {_a} aliquote diverse, ma ci sono {_b} DatiRiepilogo"],
    split: ["Natura {_a} with EsigibilitaIVA S", "Natura {_a} con EsigibilitaIVA S"],
    imposta: ["Imposta {_a}, but {_b} × {_c} / 100 = {_d}", "Imposta {_a}, ma {_b} × {_c} / 100 = {_d}"],
    imponibile: ["For the rate {_a}: ImponibileImporto {_b}, but the lines, contributions and rounding add up to {_c}", "Per l'aliquota {_a}: ImponibileImporto {_b}, ma righe, contributi e arrotondamento sommano {_c}"],
    total: ["PrezzoTotale {_a} in line {_c}, but the calculation gives {_b}", "PrezzoTotale {_a} nella riga {_c}, ma il calcolo dà {_b}"],
    pct: ["AliquotaIVA {_a}", "AliquotaIVA {_a}"],
    numero: ["Numero “{_a}”", "Numero “{_a}”"],
    dest: ["CodiceDestinatario “{_a}” has {_b} characters with FormatoTrasmissione {_c}", "CodiceDestinatario “{_a}” ha {_b} caratteri con FormatoTrasmissione {_c}"],
    versione: ["FormatoTrasmissione is {_a}, the attribute versione is {_b}", "FormatoTrasmissione è {_a}, l'attributo versione è {_b}"],
    tipo: ["Tipo {_a} without Percentuale or Importo", "Tipo {_a} senza Percentuale né Importo"],
    noMatch: ["{_a} has no DatiRiepilogo with the same value", "{_a} non ha un DatiRiepilogo con lo stesso valore"],
    generic: ["Natura {_a}", "Natura {_a}"],
    same: ["The seller and the buyer are both {_a}", "Cedente e cessionario sono entrambi {_a}"],
    differ: ["The seller {_a} and the buyer {_b} differ", "Il cedente {_a} e il cessionario {_b} sono diversi"],
    country: ["TipoDocumento {_a} with seller IdPaese {_b}", "TipoDocumento {_a} con IdPaese del cedente {_b}"],
    zero: ["TipoDocumento {_a} with a line at rate 0", "TipoDocumento {_a} con una riga con aliquota 0"],
    nobuyer: ["TipoDocumento {_a} without the buyer's IdFiscaleIVA", "TipoDocumento {_a} senza IdFiscaleIVA del cessionario"],
    both: ["Seller {_a}, buyer {_b}", "Cedente {_a}, cessionario {_b}"]
  };
  const say = (k, vars) => D[k][0].replace(/\{_(\w)\}/g, (m, v) => (vars && v in vars ? vars[v] : m));
  const f2 = (x) => (isNaN(x) ? "?" : x.toFixed(2));

  // the file name of the transmission (specification 2.2): country code, the transmitter's identifier, "_", a progressive of up to 5 letters or digits, .xml
  function nameOk(name) {
    const m = /^([A-Z]{2})([A-Za-z0-9]+)_([A-Za-z0-9]{1,5})\.xml(\.p7m)?$/.exec(name) || /^([A-Z]{2})([A-Za-z0-9]+)_([A-Za-z0-9]{1,5})\.zip$/.exec(name);
    if (!m) return false;
    const len = m[2].length;
    return m[1] === "IT" ? len >= 11 && len <= 16 : len >= 2 && len <= 28;
  }

  function check(root, opts) {
    opts = opts || {};
    const found = [];
    const add = (kind, el, detail) => found.push({ kind, el, detail });
    if (!root) return found;
    const simple = root.localName === "FatturaElettronicaSemplificata";
    if (opts.name && !nameOk(opts.name.split(/[\\/]/).pop())) add("00001", root, say("name", { a: opts.name.split(/[\\/]/).pop() }));
    const hdr = one(root, "FatturaElettronicaHeader"), dt = one(hdr, "DatiTrasmissione");
    const fmt = val(dt, "FormatoTrasmissione"), dest = one(dt, "CodiceDestinatario");
    if (dest) {
      const len = dest.textContent.trim().length;
      if (fmt === "FPA12" ? len === 7 : len === 6) add("00427", dest, say("dest", { a: dest.textContent.trim(), b: len, c: fmt }));
    }
    const versione = root.getAttribute("versione");
    if (versione != null && fmt && fmt !== versione) add("00428", one(dt, "FormatoTrasmissione"), say("versione", { a: fmt, b: versione }));
    if (simple) return found;

    const seller = one(hdr, "CedentePrestatore"), buyer = one(hdr, "CessionarioCommittente");
    const sellerId = at(seller, "DatiAnagrafici/IdFiscaleIVA"), buyerId = at(buyer, "DatiAnagrafici/IdFiscaleIVA");
    const idOf = (e) => (e ? val(e, "IdPaese") + val(e, "IdCodice") : "");
    if (buyer && !buyerId && !at(buyer, "DatiAnagrafici/CodiceFiscale")) add("00417", at(buyer, "DatiAnagrafici") || buyer, "");
    const sellerCountry = val(sellerId, "IdPaese"), buyerCountry = val(buyerId, "IdPaese");
    if (sellerCountry && buyerCountry && sellerCountry !== "IT" && buyerCountry !== "IT") add("00476", sellerId, say("both", { a: sellerCountry, b: buyerCountry }));

    const bodies = kids(root, "FatturaElettronicaBody");
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const info = bodies.map((body, bi) => {
      const dgd = at(body, "DatiGenerali/DatiGeneraliDocumento");
      return { body, dgd, tipo: val(dgd, "TipoDocumento"), numero: val(dgd, "Numero"), data: val(dgd, "Data"), art73: val(dgd, "Art73") === "SI", bi };
    });
    const label = (i) => (i.numero || "#" + (i.bi + 1));

    info.forEach((I) => {
      const { body, dgd, tipo } = I;
      const lines = kids(at(body, "DatiBeniServizi"), "DettaglioLinee"), riep = kids(at(body, "DatiBeniServizi"), "DatiRiepilogo");
      const cassa = kids(dgd, "DatiCassaPrevidenziale");
      if (I.data && I.data > today) add("00403", at(dgd, "Data"), say("date", { a: I.data, b: today }));
      if (I.numero && !/[0-9]/.test(I.numero)) add("00425", at(dgd, "Numero"), say("numero", { a: I.numero }));
      // rate and nature of a line, of a contribution and of a summary
      lines.forEach((ln, i) => {
        const rate = num(val(ln, "AliquotaIVA")), nat = one(ln, "Natura"), where = say("line", { a: val(ln, "NumeroLinea") || i + 1 });
        if (!isNaN(rate)) {
          if (rate === 0 && !nat) add("00400", ln, where);
          if (rate !== 0 && nat) add("00401", nat, where);
        }
      });
      cassa.forEach((c) => {
        const rate = num(val(c, "AliquotaIVA")), nat = one(c, "Natura");
        if (!isNaN(rate)) {
          if (rate === 0 && !nat) add("00413", c, "");
          if (rate !== 0 && nat) add("00414", nat, "");
        }
      });
      riep.forEach((r) => {
        const rate = num(val(r, "AliquotaIVA")), nat = one(r, "Natura");
        if (!isNaN(rate)) {
          if (rate === 0 && !nat) add("00429", r, "");
          if (rate !== 0 && nat) add("00430", nat, "");
        }
        if (nat && /^N6/.test(nat.textContent.trim()) && val(r, "EsigibilitaIVA") === "S") add("00420", nat, say("split", { a: nat.textContent.trim() }));
        // 00421: Imposta = AliquotaIVA * ImponibileImporto / 100, tolerance 0.01
        const imposta = num(val(r, "Imposta")), base = num(val(r, "ImponibileImporto"));
        if (!isNaN(rate) && !isNaN(base) && !isNaN(imposta)) {
          const calc = rate * base / 100;
          if (!within(imposta, calc, 0.01)) add("00421", one(r, "Imposta"), say("imposta", { a: f2(imposta), b: f2(rate), c: f2(base), d: f2(calc) }));
        }
      });
      // 00411, 00415: DatiRitenuta
      const hasRitenuta = !!one(dgd, "DatiRitenuta");
      if (!hasRitenuta) {
        const withR = lines.filter((ln) => val(ln, "Ritenuta") === "SI");
        if (withR.length) add("00411", withR[0], say("ritenuta"));
        const cR = cassa.filter((c) => val(c, "Ritenuta") === "SI");
        if (cR.length) add("00415", cR[0], say("ritenuta"));
      }
      // 00418: a credit note is not older than the invoice it refers to
      if (tipo === "TD04") kids(at(body, "DatiGenerali"), "DatiFattureCollegate").forEach((fc) => {
        const d = val(fc, "Data");
        if (d && I.data && I.data < d) add("00418", at(dgd, "Data"), say("credit", { a: I.data, b: d }));
      });
      // 00419, 00443: the summaries against the rates of the lines and the contributions
      const used = [];
      cassa.concat(lines).forEach((e) => { const k = key(num(val(e, "AliquotaIVA"))); if (k && used.indexOf(k) < 0) used.push(k); });
      if (riep.length < used.length) add("00419", at(body, "DatiBeniServizi") || body, say("rates", { a: used.length, b: riep.length }));
      const riepRates = riep.map((r) => key(num(val(r, "AliquotaIVA"))));
      cassa.concat(lines).forEach((e) => { const k = key(num(val(e, "AliquotaIVA"))); if (k && riepRates.indexOf(k) < 0) add("00443", one(e, "AliquotaIVA"), say("noMatch", { a: "AliquotaIVA " + k })); });
      // 00444, 00445: the natures
      const riepNat = riep.map((r) => val(r, "Natura")).filter(Boolean);
      cassa.concat(lines).forEach((e) => { const n = one(e, "Natura"); if (n && riepNat.indexOf(n.textContent.trim()) < 0) add("00444", n, say("noMatch", { a: "Natura " + n.textContent.trim() })); });
      cassa.concat(lines, riep).forEach((e) => { const n = one(e, "Natura"); if (n && /^N[236]$/.test(n.textContent.trim())) add("00445", n, say("generic", { a: n.textContent.trim() })); });
      // 00424: a rate other than zero below 1 is not a percentage
      cassa.concat(lines, riep).forEach((e) => { const r = one(e, "AliquotaIVA"), v = r ? num(r.textContent.trim()) : NaN; if (!isNaN(v) && v !== 0 && v < 1) add("00424", r, say("pct", { a: r.textContent.trim() })); });
      // 00437, 00438
      kids(dgd, "ScontoMaggiorazione").forEach((s) => { if (one(s, "Tipo") && !one(s, "Percentuale") && !one(s, "Importo")) add("00437", s, say("tipo", { a: val(s, "Tipo") })); });
      lines.forEach((ln) => kids(ln, "ScontoMaggiorazione").forEach((s) => { if (one(s, "Tipo") && !one(s, "Percentuale") && !one(s, "Importo")) add("00438", s, say("tipo", { a: val(s, "Tipo") })); }));
      // 00423: PrezzoTotale = (PrezzoUnitario with each discount or surcharge applied in turn) * Quantita (1 when absent), tolerance 0.01
      lines.forEach((ln, i) => {
        const pt = num(val(ln, "PrezzoTotale")), pu = num(val(ln, "PrezzoUnitario")), q = one(ln, "Quantita") ? num(val(ln, "Quantita")) : 1;
        if (isNaN(pt) || isNaN(pu) || isNaN(q)) return;
        let price = pu;
        kids(ln, "ScontoMaggiorazione").forEach((s) => {
          const imp = num(val(s, "Importo")), pct = num(val(s, "Percentuale"));
          const delta = !isNaN(imp) ? imp : !isNaN(pct) ? price * pct / 100 : 0;     // both given: only the amount counts
          price += val(s, "Tipo") === "MG" ? delta : val(s, "Tipo") === "SC" ? -delta : 0;
        });
        const calc = price * q;
        if (!within(pt, calc, 0.01)) add("00423", one(ln, "PrezzoTotale"), say("total", { a: f2(pt), b: calc.toFixed(5).replace(/0+$/, "").replace(/\.$/, ".0"), c: val(ln, "NumeroLinea") || i + 1 }));
      });
      // 00422: for each rate, the taxable amounts of the summaries = the line totals + the contributions + the rounding of the summaries, tolerance 1
      const rates = [];
      riep.concat(lines, cassa).forEach((e) => { const k = key(num(val(e, "AliquotaIVA"))); if (k && rates.indexOf(k) < 0) rates.push(k); });
      rates.forEach((k) => {
        const sel = (arr) => arr.filter((e) => key(num(val(e, "AliquotaIVA"))) === k);
        const sum = (arr, p) => arr.reduce((t, e) => t + (num(val(e, p)) || 0), 0);
        const taxable = sum(sel(riep), "ImponibileImporto"), rest = sum(sel(lines), "PrezzoTotale") + sum(sel(cassa), "ImportoContributoCassa") + sum(sel(riep), "Arrotondamento");
        if (sel(riep).length && !within(taxable, rest, 1)) add("00422", one(sel(riep)[0], "ImponibileImporto"), say("imponibile", { a: k, b: f2(taxable), c: f2(rest) }));
      });
      // the document types that tie the seller and the buyer together
      const sid = idOf(sellerId), bid = idOf(buyerId);
      if (/^TD(16|17|18|19|20|29)$/.test(tipo) && sid && bid && sid === bid) add("00471", buyerId, say("same", { a: sid }));
      if (tipo === "TD21" && sid && bid && sid !== bid) add("00472", buyerId, say("differ", { a: sid, b: bid }));
      if (/^TD(17|18|19|28)$/.test(tipo) && sellerCountry === "IT") add("00473", sellerId, say("country", { a: tipo, b: sellerCountry }));
      if (tipo === "TD29" && sellerCountry && sellerCountry !== "IT") add("00473", sellerId, say("country", { a: tipo, b: sellerCountry }));
      if (tipo === "TD21") lines.forEach((ln) => { if (num(val(ln, "AliquotaIVA")) === 0) add("00474", ln, say("zero", { a: tipo })); });
      if (/^TD(16|17|18|19|20|22|23|28|29)$/.test(tipo) && buyer && !buyerId) add("00475", at(buyer, "DatiAnagrafici") || buyer, say("nobuyer", { a: tipo }));
    });
    // 00409: the same invoice twice in a batch (the year of the date, or the whole date when Art73 is SI; a credit note only against the same type)
    info.forEach((F) => info.forEach((Fn) => {
      if (Fn === F) return;
      const same = F.art73 ? F.data === Fn.data : F.data.slice(0, 4) === Fn.data.slice(0, 4);
      if (F.numero !== Fn.numero || !same) return;
      const credit = F.tipo === "TD04" || Fn.tipo === "TD04";
      if (credit ? F.tipo === Fn.tipo : true) {
        if (!found.some((x) => x.kind === "00409" && x.el === at(F.dgd, "Numero"))) add("00409", at(F.dgd, "Numero"), say(F.art73 ? "dupeDate" : "dupeYear", { a: label(F), b: label(Fn) }));
      }
    }));
    return found;
  }

  if (window.I18N && I18N.addItalian) {
    const exact = {};
    RULES.forEach((r) => { exact[r[1]] = r[2]; });
    exact["The file name must be the country code, the transmitter's fiscal identifier, an underscore and a progressive of up to 5 letters or digits, then .xml (specification 2.2)"] =
      "Nome file non valido: codice paese, identificativo fiscale del trasmittente, underscore, progressivo di al massimo 5 lettere o cifre, poi .xml (specifiche 2.2)";
    exact["Controls of the Sistema di Interscambio that need the registries, the invoices sent before or the signature are not checked here."] =
      "I controlli del Sistema di Interscambio che richiedono le anagrafiche, le fatture inviate in precedenza o la firma non sono verificati qui.";
    I18N.addItalian(exact, Object.keys(D).map((k) => [D[k][0], D[k][1]]));
  }
  window.ItSdi = { check, nameOk, rules: RULES.map((r) => "SDI-" + r[0]), texts: RULES.map((r) => [r[0], r[1]]), details: Object.keys(D).map((k) => D[k][0]) };
})();
