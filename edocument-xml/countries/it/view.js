/*
 * Italy (FatturaPA): what the viewer shows for an Italian electronic invoice. The document is not UBL, so this file builds the fields view from the
 * FatturaPA elements themselves (header, body, lines, VAT summary, payment) in the same cards, tables and check list as the other countries;
 * no EN 16931 field numbers are shown, the XML tag is. The checks come from rules/it-schema.js. The Italian text is in it.js, the English
 * names of the coded values in labels-en.js.
 */
(function () {
  "use strict";
  let h = null;
  const init = (helpers) => { h = helpers; };
  const isIt = (root) => !!root && (root.localName === "FatturaElettronica" || root.localName === "FatturaElettronicaSemplificata");
  const simple = (root) => !!root && root.localName === "FatturaElettronicaSemplificata";
  const kids = (el, name) => Array.from(el ? el.children : []).filter((k) => k.localName === name);
  const one = (el, name) => kids(el, name)[0] || null;
  const text = (el, path) => { let c = el; for (const s of path.split("/")) { c = one(c, s); if (!c) return ""; } return c.textContent.trim(); };
  const at = (el, path) => { let c = el; for (const s of path.split("/")) { c = one(c, s); if (!c) return null; } return c; };
  const bodies = (root) => kids(root, "FatturaElettronicaBody");
  const nameOf = (anag) => text(anag, "Denominazione") || [text(anag, "Nome"), text(anag, "Cognome")].filter(Boolean).join(" ");
  const partyName = (root, role) => simple(root) ? partyNameSimple(root, role) : nameOf(one(one(one(root, "FatturaElettronicaHeader"), role), "DatiAnagrafici") && one(one(one(one(root, "FatturaElettronicaHeader"), role), "DatiAnagrafici"), "Anagrafica"));

  // the simplified invoice: the seller's name sits directly in CedentePrestatore, the buyer's in AltriDatiIdentificativi
  const partyNameSimple = (root, role) => { const p = one(one(root, "FatturaElettronicaHeader"), role); return nameOf(role === "CedentePrestatore" ? p : one(p, "AltriDatiIdentificativi")); };

  // ---- the coded values: the schema's own description (Italian), and an English one
  const labelOf = (elName, code) => {
    const it = window.IT_SCHEMA.labels[elName] && window.IT_SCHEMA.labels[elName][code];
    if (!it) return "";
    return window.I18N.lang === "it" ? it : ((window.IT_LABELS_EN && window.IT_LABELS_EN[elName] && window.IT_LABELS_EN[elName][code]) || it);
  };

  // ---- how a value is written
  const AMOUNTS = new Set(["PrezzoUnitario", "PrezzoTotale", "ImportoTotaleDocumento", "ImponibileImporto", "Imposta", "ImportoPagamento", "ImportoBollo", "ImportoContributoCassa",
    "ImponibileCassa", "ImportoRitenuta", "Arrotondamento", "Importo", "ScontoPagamentoAnticipato", "PenalitaPagamentiRitardati", "SpeseAccessorie", "Ritenuta", "ImportoCauzione"]);
  const PERCENT = new Set(["AliquotaIVA", "Percentuale", "AliquotaRitenuta", "AlCassa"]);
  const isDate = (n) => n === "Data" || /^Data[A-Z]/.test(n);
  const currency = () => (h.state.root && text(one(bodies(h.state.root)[0], "DatiGenerali"), "DatiGeneraliDocumento/Divisa")) || "";
  // returns the HTML of a leaf value, or null to let the viewer write it as usual
  function value(el, raw) {
    const n = el.localName;
    if (n === "Attachment") return '<span class="chip">' + h.esc(h.T("Attached data")) + " · " + h.formatSize(Math.floor(raw.replace(/\s+/g, "").length * 3 / 4)) + "</span>";
    if (AMOUNTS.has(n) && h.num(raw) !== null && (n !== "Ritenuta")) return h.fmtAmount(raw, currency());
    if (PERCENT.has(n) && h.num(raw) !== null) return '<span class="amt">' + h.esc(raw) + "</span> %";
    if (isDate(n) && /^\d{4}-\d{2}-\d{2}/.test(raw)) return h.fmtDate(raw);
    return null;
  }
  function decode(el, raw) {
    const n = el.localName, p = el.parentElement ? el.parentElement.localName : "";
    const l = labelOf(n, raw);
    if (l) return ' <span class="dec">· ' + h.esc(l) + "</span>";
    if ((n === "Nazione" || (n === "IdPaese")) && h.countryName) { const c = h.countryName(raw); if (c && c !== raw) return ' <span class="dec">· ' + h.esc(c) + "</span>"; }
    if (n === "Divisa" && h.currencyName) { const c = h.currencyName(raw); if (c) return ' <span class="dec">· ' + h.esc(c) + "</span>"; }
    return "";
  }

  // ---- the fields of each block: [path, label, "", options]
  const vatId = (el) => h.esc(text(el, "IdPaese") + text(el, "IdCodice"));
  const PARTY = (seller) => [
    ["DatiAnagrafici/IdFiscaleIVA", "VAT number", "", { fmt: vatId }], ["DatiAnagrafici/CodiceFiscale", "Tax code", ""],
    ["DatiAnagrafici/Anagrafica/Denominazione", "Name", ""], ["DatiAnagrafici/Anagrafica/Nome", "First name", ""], ["DatiAnagrafici/Anagrafica/Cognome", "Last name", ""],
    ["DatiAnagrafici/Anagrafica/Titolo", "Title", ""], ["DatiAnagrafici/Anagrafica/CodEORI", "EORI code", ""]
  ].concat(seller ? [["DatiAnagrafici/RegimeFiscale", "Tax regime", ""]] : [])
   .concat([["Sede/Indirizzo", "Street", ""], ["Sede/NumeroCivico", "Number", ""], ["Sede/CAP", "Postcode", ""], ["Sede/Comune", "City", ""], ["Sede/Provincia", "Province", ""], ["Sede/Nazione", "Country", ""]]);
  const DOC_FIELDS = [["TipoDocumento", "Document type", ""], ["Numero", "Document number", ""], ["Data", "Issue date", ""], ["Divisa", "Currency", ""],
    ["ImportoTotaleDocumento", "Document total", ""], ["Arrotondamento", "Rounding", ""], ["Causale", "Reason", ""], ["Art73", "Separate numbering (art. 73)", ""]];
  const TRANS_FIELDS = [["IdTrasmittente", "Sender", "", { fmt: vatId }], ["ProgressivoInvio", "Progressive number", ""], ["FormatoTrasmissione", "Transmission format", ""],
    ["CodiceDestinatario", "Recipient code", ""], ["PECDestinatario", "Recipient PEC", ""]];
  const REF_GROUPS = [["DatiOrdineAcquisto", "Purchase order"], ["DatiContratto", "Contract"], ["DatiConvenzione", "Agreement"], ["DatiRicezione", "Receipt"],
    ["DatiFattureCollegate", "Related invoices"], ["DatiSAL", "Work progress"], ["DatiDDT", "Delivery note"], ["DatiTrasporto", "Transport"], ["FatturaPrincipale", "Main invoice"]];

  const stripHead = (html) => html.replace('<div class="extras-h">' + h.T("More fields") + "</div>", "");
  const sfx = (b) => (b ? "-b" + (b + 1) : "");
  const bodyTitle = (title, b, n) => (n > 1 ? title + " · " + (b + 1) + "/" + n : title);
  const wrapped = (html) => html;

  const SIMPLE_SELLER = [["IdFiscaleIVA", "VAT number", "", { fmt: vatId }], ["CodiceFiscale", "Tax code", ""], ["Denominazione", "Name", ""], ["Nome", "First name", ""], ["Cognome", "Last name", ""], ["RegimeFiscale", "Tax regime", ""]]
    .concat(["Indirizzo", "NumeroCivico", "CAP", "Comune", "Provincia", "Nazione"].map((n, i) => ["Sede/" + n, ["Street", "Number", "Postcode", "City", "Province", "Country"][i], ""]));
  const SIMPLE_BUYER = [["IdentificativiFiscali/IdFiscaleIVA", "VAT number", "", { fmt: vatId }], ["IdentificativiFiscali/CodiceFiscale", "Tax code", ""], ["AltriDatiIdentificativi/Denominazione", "Name", ""],
    ["AltriDatiIdentificativi/Nome", "First name", ""], ["AltriDatiIdentificativi/Cognome", "Last name", ""]]
    .concat(["Indirizzo", "NumeroCivico", "CAP", "Comune", "Provincia", "Nazione"].map((n, i) => ["AltriDatiIdentificativi/Sede/" + n, ["Street", "Number", "Postcode", "City", "Province", "Country"][i], ""]));
  const SIMPLE_DOC = [["TipoDocumento", "Document type", ""], ["Numero", "Document number", ""], ["Data", "Issue date", ""], ["Divisa", "Currency", ""], ["BolloVirtuale", "Virtual stamp duty", ""]];

  // the simplified invoice (FatturaElettronicaSemplificata): header and parties, the document, each DatiBeniServizi as a row, attachments
  function simpleSections() {
    const R = h.state.root, out = [], hdr = one(R, "FatturaElettronicaHeader"), bs = bodies(R);
    const push = (id, title, html, count) => out.push({ id, title, count: count || null, html });
    const dt = one(hdr, "DatiTrasmissione"), ut = new Set();
    push("transmission", "Transmission", h.card("transmission", "Transmission", dt ? h.renderFields(dt, TRANS_FIELDS, null, ut) + h.extras([dt], ut) : ""));
    const party = (id, title, role, spec) => { const el = one(hdr, role); if (!el) return; const u = new Set(); push(id, title, h.card(id, title, h.renderFields(el, spec, null, u) + h.extras([el], u))); };
    party("seller", "Seller", "CedentePrestatore", SIMPLE_SELLER);
    party("buyer", "Buyer", "CessionarioCommittente", SIMPLE_BUYER);
    party("issuer", "Issuer", "SoggettoEmittente", []);
    bs.forEach((body, b) => {
      const s = sfx(b), n = bs.length, ttl = (t) => bodyTitle(t, b, n);
      const dgd = one(one(body, "DatiGenerali"), "DatiGeneraliDocumento"), u = new Set();
      push("doc" + s, ttl("Document"), h.card("doc" + s, ttl("Document"), (dgd ? h.renderFields(dgd, SIMPLE_DOC, null, u) + h.extras([dgd], u) : "") + kids(one(body, "DatiGenerali"), "DatiFatturaRettificata").map((e) => h.sub("Corrected invoice", stripHead(h.extras([e], new Set())))).join("")));
      const gs = kids(body, "DatiBeniServizi");
      if (gs.length) {
        const th = (label, tag, r) => "<th" + (r ? ' class="r"' : "") + ">" + h.T(label) + h.xtag("DatiBeniServizi/" + tag) + "</th>";
        let html = '<div class="tablewrap"><table><thead><tr>' + th("Description", "Descrizione") + th("Amount", "Importo", true) + th("VAT", "DatiIVA/Imposta", true) + th("Rate", "DatiIVA/Aliquota", true) + th("Nature", "Natura") + th("Legal reference", "RiferimentoNormativo") + "</tr></thead><tbody>";
        gs.forEach((g) => {
          const v = (p) => { const e = at(g, p); return e ? h.renderValue(e) : "—"; };
          html += '<tr class="frow"><td>' + (one(g, "Descrizione") ? h.esc(text(g, "Descrizione")) : "—") + '</td><td class="r">' + v("Importo") + '</td><td class="r">' + v("DatiIVA/Imposta") + '</td><td class="r">' + v("DatiIVA/Aliquota") + "</td><td>" + v("Natura") + "</td><td>" + (one(g, "RiferimentoNormativo") ? h.esc(text(g, "RiferimentoNormativo")) : "") + "</td></tr>";
        });
        push("goods" + s, ttl("Goods and services"), h.card("goods" + s, ttl("Goods and services"), html + "</tbody></table></div>", { full: true, count: gs.length > 1 ? gs.length : null }), gs.length > 1 ? gs.length : null);
      }
      const att = kids(body, "Allegati");
      if (att.length) push("attachments" + s, ttl("Attachments"), h.card("attachments" + s, ttl("Attachments"), att.map((a, i) => h.sub(h.T("Attachment") + " " + (i + 1), stripHead(h.extras([a], new Set())))).join(""), { full: true }));
    });
    const rest = Array.from(R.children).filter((k) => !["FatturaElettronicaHeader", "FatturaElettronicaBody"].includes(k.localName));
    if (rest.length) push("other", "Other elements", h.card("other", "Other elements", rest.map((e) => h.row(e.localName === "Signature" ? h.T("Signature") : e.localName, "", e.children.length ? '<span class="dec">' + h.T("(group)") + "</span>" : h.renderValue(e), "extra", h.tagPath(e))).join(""), { full: true }));
    if (h.state.checks.length) { const bad = h.state.checks.filter((c) => !c.ok && !c.warn).length; push("checks", "Checks", h.card("checks", "Checks", h.checksHtml(h.state.checks), { count: bad ? h.T("{n} failing", { n: bad }) : h.T("all pass") })); }
    const order = [].concat(...nav(R).map((g) => g[1]));
    return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  function sections() {
    if (simple(h.state.root)) return simpleSections();
    const R = h.state.root, out = [], hdr = one(R, "FatturaElettronicaHeader"), bs = bodies(R);
    const push = (id, title, html, count) => out.push({ id, title, count: count || null, html });
    // header: transmission and parties
    {
      const dt = one(hdr, "DatiTrasmissione"), u = new Set();
      const body = dt ? h.renderFields(dt, TRANS_FIELDS, null, u) + h.extras([dt], u) : "";
      push("transmission", "Transmission", h.card("transmission", "Transmission", body));
    }
    const party = (id, title, role, seller) => {
      const el = one(hdr, role);
      if (!el) return;
      const u = new Set();
      push(id, title, h.card(id, title, h.renderFields(el, PARTY(seller), null, u) + h.extras([el], u)));
    };
    party("seller", "Seller", "CedentePrestatore", true);
    party("buyer", "Buyer", "CessionarioCommittente", false);
    party("taxrep", "Seller tax representative", "RappresentanteFiscale", false);
    party("intermediary", "Intermediary", "TerzoIntermediarioOSoggettoEmittente", false);
    party("issuer", "Issuer", "SoggettoEmittente", false);
    let lineNo = 0;
    bs.forEach((body, b) => {
      const s = sfx(b), n = bs.length, ttl = (t) => bodyTitle(t, b, n);
      const dg = one(body, "DatiGenerali"), dgd = one(dg, "DatiGeneraliDocumento");
      // document
      {
        const u = new Set();
        const fields = dgd ? h.renderFields(dgd, DOC_FIELDS, null, u) + h.extras([dgd], u) : "";
        push("doc" + s, ttl("Document"), h.card("doc" + s, ttl("Document"), fields));
      }
      // references
      {
        let html = "";
        REF_GROUPS.forEach(([tag, label]) => kids(dg, tag).forEach((el, i, all) => {
          html += h.sub(all.length > 1 ? h.T(label) + " " + (i + 1) : label, stripHead(h.extras([el], new Set())) || "");
        }));
        if (html) push("refs" + s, ttl("References"), h.card("refs" + s, ttl("References"), html, { full: true }));
      }
      // payment
      {
        let html = "";
        kids(body, "DatiPagamento").forEach((dp) => {
          const u = new Set();
          const det = kids(dp, "DettaglioPagamento");
          html += h.renderFields(dp, [["CondizioniPagamento", "Payment terms", ""]], null, u);
          if (det.length) {
            const th = (label, tag, r) => "<th" + (r ? ' class="r"' : "") + ">" + h.T(label) + h.xtag(tag) + "</th>";
            html += '<div class="tablewrap"><table><thead><tr>' + th("Payment method", "ModalitaPagamento") + th("Due date", "DataScadenzaPagamento") + th("Amount", "ImportoPagamento", true) + th("Account", "IBAN") + th("Recipient", "Beneficiario") +
              "</tr></thead><tbody>" + det.map((d) => {
                const g = (p) => { const e = one(d, p); if (e) u.add(e); return e; };
                const mp = g("ModalitaPagamento"), due = g("DataScadenzaPagamento"), amt = g("ImportoPagamento"), ib = g("IBAN"), be = g("Beneficiario");
                return '<tr class="frow"><td>' + (mp ? h.renderValue(mp) : "—") + "</td><td>" + (due ? h.renderValue(due) : "—") + '</td><td class="r">' + (amt ? h.renderValue(amt) : "—") + "</td><td>" +
                  (ib ? h.iban(h.txt(ib)) : "—") + "</td><td>" + (be ? h.esc(h.txt(be)) : "—") + "</td></tr>";
              }).join("") + "</tbody></table></div>";
            det.forEach((d) => { html += h.extras([d], new Set(Array.from(d.children).filter((k) => ["ModalitaPagamento", "DataScadenzaPagamento", "ImportoPagamento", "IBAN", "Beneficiario"].includes(k.localName))), false); });
          }
          html += h.extras([dp], u);
        });
        if (html) push("payment" + s, ttl("Payment"), h.card("payment" + s, ttl("Payment"), html, { full: true }));
      }
      // VAT summary
      {
        const rs = kids(one(body, "DatiBeniServizi"), "DatiRiepilogo");
        if (rs.length) {
          const th = (label, tag, r) => "<th" + (r ? ' class="r"' : "") + ">" + h.T(label) + h.xtag("DatiRiepilogo/" + tag) + "</th>";
          let inner = '<div class="tablewrap"><table><thead><tr>' + th("Rate", "AliquotaIVA", true) + th("Nature", "Natura") + th("Taxable", "ImponibileImporto", true) + th("VAT", "Imposta", true) + th("Exigibility", "EsigibilitaIVA") +
            th("Legal reference", "RiferimentoNormativo") + "</tr></thead><tbody>";
          let sumT = 0, sumV = 0;
          const u = new Set();
          rs.forEach((r) => {
            const g = (p) => { const e = one(r, p); if (e) u.add(e); return e; };
            const rate = g("AliquotaIVA"), nat = g("Natura"), tb = g("ImponibileImporto"), vt = g("Imposta"), ex = g("EsigibilitaIVA"), rn = g("RiferimentoNormativo");
            sumT += h.num(h.txt(tb)) || 0; sumV += h.num(h.txt(vt)) || 0;
            inner += '<tr class="frow"><td class="r">' + (rate ? h.renderValue(rate) : "—") + "</td><td>" + (nat ? h.renderValue(nat) : "—") + '</td><td class="r">' + (tb ? h.renderValue(tb) : "—") + '</td><td class="r">' +
              (vt ? h.renderValue(vt) : "—") + "</td><td>" + (ex ? h.renderValue(ex) : "—") + "</td><td>" + (rn ? h.esc(h.txt(rn)) : "") + "</td></tr>";
          });
          inner += '</tbody><tfoot><tr><td colspan="2">' + h.T("Total") + '</td><td class="r">' + h.fmtAmount(sumT.toFixed(2), "") + '</td><td class="r">' + h.fmtAmount(sumV.toFixed(2), "") + "</td><td></td><td></td></tr></tfoot></table></div>";
          inner += h.extras(rs, u);
          push("vat" + s, ttl("VAT summary"), h.card("vat" + s, ttl("VAT summary"), inner, { full: true }));
        }
      }
      // vehicles and attachments
      {
        const dv = one(body, "DatiVeicoli");
        if (dv) push("vehicles" + s, ttl("Vehicles"), h.card("vehicles" + s, ttl("Vehicles"), h.extras([dv], new Set(), false)));
        const at = kids(body, "Allegati");
        if (at.length) push("attachments" + s, ttl("Attachments"), h.card("attachments" + s, ttl("Attachments"), at.map((a, i) => h.sub(h.T("Attachment") + " " + (i + 1), stripHead(h.extras([a], new Set())))).join(""), { full: true, count: at.length > 1 ? at.length : null }));
      }
      // lines
      {
        const lines = kids(one(body, "DatiBeniServizi"), "DettaglioLinee");
        let html = "";
        if (lines.length) {
          const th = (label, tag, r) => "<th" + (r ? ' class="r"' : "") + ">" + h.T(label) + h.xtag("DettaglioLinee/" + tag) + "</th>";
          html = '<div class="tablewrap"><table><thead><tr>' + th("Line", "NumeroLinea") + th("Item", "Descrizione") + th("Quantity", "Quantita", true) + th("Unit price", "PrezzoUnitario", true) + th("VAT", "AliquotaIVA") + th("Total", "PrezzoTotale", true) +
            '<th class="lgo"></th></tr></thead><tbody>';
          lines.forEach((ln) => {
            const i = lineNo++;
            const u = new Set();
            const used = (e) => { if (e) u.add(e); return e; };
            const qty = used(one(ln, "Quantita")), um = used(one(ln, "UnitaMisura")), pu = used(one(ln, "PrezzoUnitario")), pt = used(one(ln, "PrezzoTotale")), rate = used(one(ln, "AliquotaIVA")), nat = used(one(ln, "Natura")), desc = used(one(ln, "Descrizione")), no = used(one(ln, "NumeroLinea"));
            const code = one(ln, "CodiceArticolo") ? text(one(ln, "CodiceArticolo"), "CodiceValore") : "";
            const detail = h.extras([ln], u);
            const lineChecks = h.state.checks.filter((c) => !c.ok && c.lines && c.lines.includes(i));
            const nBad = lineChecks.filter((c) => !c.warn).length;
            const flag = lineChecks.length ? '<span class="lerr' + (nBad ? "" : " warn") + '" title="' + h.esc(lineChecks.map((c) => c.id).join(", ")) + '">' + (nBad ? h.T(nBad > 1 ? "✗ {n} errors" : "✗ {n} error", { n: nBad }) : "! " + lineChecks.length) + "</span>" : "";
            const lineLabel = String(h.txt(no) || i + 1);
            const nature = nat ? h.txt(nat) : "";
            html += '<tr class="line frow' + (nBad ? " has-err" : "") + '" data-line="' + i + '" style="--idw:' + Math.min(lineLabel.length, 12) + 'ch" tabindex="0" aria-expanded="false"><td>' + h.esc(lineLabel) + flag + "</td><td>" +
              h.esc(h.txt(desc) || "—") + (code ? '<div class="small">' + h.esc(code) + "</div>" : "") + '</td><td class="r">' +
              (qty ? h.fmtAmount(h.txt(qty), "") + (um ? ' <span class="unit">' + h.esc(h.txt(um)) + "</span>" : "") : "—") + '</td><td class="r">' + (pu ? h.fmtAmount(h.txt(pu), "") : "—") + "</td><td>" +
              (rate ? h.esc(h.txt(rate)) + " %" : "") + (nature ? ' <span class="vatc" data-cat="' + h.esc(nature) + '">' + h.esc(nature) + "</span>" : "") + '</td><td class="r">' + (pt ? h.fmtAmount(h.txt(pt), "") : "—") + '</td><td class="lgo" aria-hidden="true"></td></tr>' +
              h.lineErrRow(i, 7) + '<tr class="detail" data-detail="' + i + '" hidden><td colspan="7"><div class="detail-grid">' + detail + "</div></td></tr>";
          });
          html += "</tbody></table></div>";
        }
        const badLines = Object.keys(h.state.issues.lines).filter((k) => h.state.issues.lines[k].bad.size && lines.some((_, j) => String(lineNo - lines.length + j) === k)).length;
        const count = lines.length + (badLines ? " · " + h.T("{n} with errors", { n: badLines }) : "");
        push("lines" + s, ttl("Lines"), h.card("lines" + s, ttl("Lines"), html, { full: true, count,
          act: lines.length ? '<button class="mini" type="button" data-act="expand">' + h.T("Expand all") + '</button><button class="mini" type="button" data-act="collapse">' + h.T("Collapse all") + "</button>" : "" }), count);
      }
    });
    // the signature and anything else directly under the root
    {
      const rest = Array.from(R.children).filter((k) => !["FatturaElettronicaHeader", "FatturaElettronicaBody"].includes(k.localName));
      if (rest.length) push("other", "Other elements", h.card("other", "Other elements", rest.map((e) => h.row(e.localName === "Signature" ? h.T("Signature") : e.localName, "", e.children.length ? '<span class="dec">' + h.T("(group)") + "</span>" : h.renderValue(e), "extra", h.tagPath(e))).join(""), { full: true }));
    }
    const checks = h.state.checks;
    if (checks.length) {
      const bad = checks.filter((c) => !c.ok && !c.warn).length;
      push("checks", "Checks", h.card("checks", "Checks", h.checksHtml(checks), { count: bad ? h.T("{n} failing", { n: bad }) : h.T("all pass") }));
    }
    // in the order of the navigation: the document first, then the parties, payment, lines, amounts
    const order = [].concat(...nav(R).map((g) => g[1]));
    return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  // the left navigation: the ids of the sections that exist, in groups
  function nav(root) {
    const n = bodies(root).length, ids = (base) => Array.from({ length: n }, (_, b) => base + sfx(b));
    if (simple(root)) return [["Document", ids("doc")], ["Parties", ["transmission", "seller", "buyer", "issuer"]], ["Lines", ids("goods")], ["Amounts", ["checks"]], ["More", ids("attachments").concat(["other"])]];
    return [["Document", ids("doc").concat(ids("refs"))], ["Parties", ["transmission", "seller", "buyer", "taxrep", "intermediary", "issuer"]], ["Payment", ids("payment")],
      ["Lines", ids("lines")], ["Amounts", ids("vat").concat(["checks"])], ["More", ids("vehicles").concat(ids("attachments"), ["other"])]];
  }

  // which block (and which line) an element belongs to, so failed checks can be pinned on it
  function locate(el) {
    const R = h.state.root;
    let top = el;
    while (top && top.parentElement && top.parentElement !== R) top = top.parentElement;
    if (!top || top === R || top.parentElement !== R) return { sec: "doc" };
    const n = top.localName;
    if (n === "FatturaElettronicaHeader") {
      const c = el === top ? null : (() => { let x = el; while (x.parentElement !== top) x = x.parentElement; return x; })();
      const m = { DatiTrasmissione: "transmission", CedentePrestatore: "seller", CessionarioCommittente: "buyer", RappresentanteFiscale: "taxrep", TerzoIntermediarioOSoggettoEmittente: "intermediary", SoggettoEmittente: "issuer" };
      return { sec: (c && m[c.localName]) || "transmission" };
    }
    if (n === "FatturaElettronicaBody") {
      const bi = bodies(R).indexOf(top), s = sfx(bi);
      if (el === top) return { sec: "doc" + s };
      let c = el; while (c.parentElement !== top) c = c.parentElement;
      const g = c.localName;
      if (g === "DatiBeniServizi" && simple(R)) return { sec: "goods" + s };
      if (g === "DatiBeniServizi") {
        let d = el; while (d.parentElement !== c) d = d.parentElement;
        if (d.localName === "DettaglioLinee") {
          let idx = 0; bodies(R).forEach((x, j) => { if (j < bi) idx += kids(one(x, "DatiBeniServizi"), "DettaglioLinee").length; });
          return { sec: "lines" + s, line: idx + kids(c, "DettaglioLinee").indexOf(d) };
        }
        return { sec: "vat" + s };
      }
      if (g === "DatiGenerali") {
        let d = el; while (d.parentElement !== c) d = d.parentElement;
        return { sec: d.localName === "DatiGeneraliDocumento" ? "doc" + s : "refs" + s };
      }
      if (simple(R)) return { sec: (g === "Allegati" ? "attachments" : "doc") + s };
      return { sec: ({ DatiPagamento: "payment", DatiVeicoli: "vehicles", Allegati: "attachments" }[g] || "doc") + s };
    }
    return { sec: "other" };
  }

  // ---- the checks, in the shape of the other countries' results: { id, text, ok, detail, at: [elements] }
  function checks(root) {
    if (!window.ItSchema) return [];
    const out = [];
    const run = (api, prefix) => {
      const found = api.check(root);
      api.texts.forEach(([n, text]) => {
        const mine = found.filter((f) => f.kind === n);
        out.push({ id: prefix + n, text, ok: !mine.length, detail: mine.length ? mine[0].detail + (mine.length > 1 ? " (+" + (mine.length - 1) + ")" : "") : "", at: mine.length ? mine.map((f) => f.el) : [root] });
      });
    };
    run(ItSchema, "IT-XSD-");
    if (window.ItSpec && !simple(root)) run(ItSpec, "IT-SPEC-");     // the specification's rules are for the ordinary invoice
    return out;
  }

  // ---- the top of the page
  function hero() {
    const R = h.state.root, T = h.T, esc = h.esc, sim = simple(R);
    const body = bodies(R)[0], dg = one(body, "DatiGenerali"), dgd = one(dg, "DatiGeneraliDocumento");
    const code = text(dgd, "TipoDocumento"), cur = text(dgd, "Divisa"), total = text(dgd, "ImportoTotaleDocumento");
    const credit = code === "TD04" || code === "TD08";
    const dues = kids(body, "DatiPagamento").flatMap((dp) => kids(dp, "DettaglioPagamento")).map((d) => text(d, "DataScadenzaPagamento")).filter(Boolean).sort();
    const di = h.parseDate(text(dgd, "Data")), dd = h.parseDate(dues[0]);
    const days = di && dd ? Math.round((dd - di) / 86400000) : null;
    const rs = sim ? [] : kids(one(body, "DatiBeniServizi"), "DatiRiepilogo");
    const sum = (tag) => rs.reduce((t, r) => t + (h.num(text(r, tag)) || 0), 0);
    const vatSimple = sim ? kids(body, "DatiBeniServizi").reduce((t, g) => t + (h.num(text(g, "DatiIVA/Imposta")) || 0), 0) : 0;
    const lbl = code ? labelOf("TipoDocumento", code) : "";
    const m = (x) => h.fmtMoney(x.toFixed(2));
    document.getElementById("hero").innerHTML =
      '<div class="hero-main"><div class="eyebrow"><span class="badge' + (credit ? " cn" : "") + '">' + T(credit ? "Credit note" : "Invoice") + "</span>" +
      (code ? "<span>" + esc(code) + (lbl ? " · " + esc(lbl) : "") + "</span>" : "") + (R.getAttribute("versione") ? "<span>" + esc(R.getAttribute("versione")) + "</span>" : "") + "</div>" +
      '<div class="docno">' + esc(text(dgd, "Numero") || T("(no number)")) + "</div>" +
      '<div class="flow"><div class="who from"><small>' + T("From") + "</small><span>" + esc(partyName(R, "CedentePrestatore") || T("Unknown seller")) + "</span></div>" +
      '<span class="arrow" aria-hidden="true">→</span><div class="who to"><small>' + T("To") + "</small><span>" + esc(partyName(R, "CessionarioCommittente") || T("Unknown buyer")) + "</span></div></div></div>" +
      '<div class="hero-amount">' + (total ? '<div class="lbl">' + T(credit ? "Amount credited" : "Document total") + '</div><div class="big">' + h.fmtMoney(total) + '<span class="cur">' + esc(cur) + "</span></div>" : "") +
      (sim && text(dgd, "Data") ? '<div class="due">' + T("Issue date") + " <b>" + h.fmtDate(text(dgd, "Data")) + "</b></div>" : "") +
      (sim && vatSimple ? '<div class="sums"><div><span>' + T("VAT") + "</span><b>" + m(vatSimple) + "</b></div></div>" : "") +
      (dues[0] ? '<div class="due">' + T("Due") + " <b>" + h.fmtDate(dues[0]) + "</b>" + (days !== null ? " · " + T("{n} days after issue", { n: days }) : "") + "</div>" : "") +
      (rs.length ? '<div class="sums"><div><span>' + T("Taxable") + "</span><b>" + m(sum("ImponibileImporto")) + "</b></div><div><span>" + T("VAT") + "</span><b>" + m(sum("Imposta")) + "</b></div></div>" : "") + "</div>";
  }

  // the facts for the PDF report: document number, type and date
  function facts() {
    const dgd = one(one(bodies(h.state.root)[0], "DatiGenerali"), "DatiGeneraliDocumento");
    return { number: text(dgd, "Numero"), type: text(dgd, "TipoDocumento"), date: text(dgd, "Data") };
  }

  window.ItView = { init, isIt, value, decode, sections, nav, locate, checks, hero, facts, labelOf };
})();
