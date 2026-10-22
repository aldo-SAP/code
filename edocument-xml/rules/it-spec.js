/*
 * The content rules of the Italian electronic invoice that the technical specification states in words (Specifiche tecniche operative del formato della fattura del Sistema
 * di Interscambio, Allegato A del DM 55/2013, version 1.4): what the XML schema cannot say, such as "PECDestinatario only when CodiceDestinatario is 0000000".
 * Each rule names the paragraph it comes from. They apply to the ordinary invoice (FatturaElettronica); the controls of the Sistema di Interscambio itself (the error
 * codes 00xxx) are not here.
 */
(function () {
  "use strict";
  const kids = (el, name) => Array.from(el ? el.children : []).filter((k) => k.localName === name);
  const one = (el, name) => kids(el, name)[0] || null;
  const val = (el, path) => { let c = el; for (const s of path.split("/")) { c = one(c, s); if (!c) return ""; } return c.textContent.trim(); };
  const at = (el, path) => { let c = el; for (const s of path.split("/")) { c = one(c, s); if (!c) return null; } return c; };

  const RULES = [
    ["01", "PECDestinatario may only be given when CodiceDestinatario is 0000000 (specification 1.1)"],
    ["02", "CodiceDestinatario has 6 characters for an invoice to the public administration (FPA12) and 7 for an invoice to private parties (FPR12) (specification 1.1)"],
    ["03", "The buyer must be identified by IdFiscaleIVA, by CodiceFiscale, or by both (specification 1.4)"],
    ["04", "The buyer's StabileOrganizzazione and RappresentanteFiscale may only be used in an invoice to private parties (FPR12) (specification 3.5.3 and 3.5.4)"],
    ["05", "The seller's Provincia may only be given for a seat in Italy (specification 1.2)"],
    ["06", "A VAT summary with a Natura must give RiferimentoNormativo (specification 2.2)"],
    ["07", "An element without a value must be left out of the file, not written empty (specification 3)"]
  ];

  function check(root) {
    const found = [];
    const add = (kind, el, detail) => found.push({ kind, el, detail });
    if (!root || root.localName !== "FatturaElettronica") return found;
    const hdr = one(root, "FatturaElettronicaHeader"), dt = one(hdr, "DatiTrasmissione");
    const fmt = val(dt, "FormatoTrasmissione"), code = val(dt, "CodiceDestinatario"), pec = at(dt, "PECDestinatario");
    if (pec && code !== "0000000") add("01", pec, "PECDestinatario is given, but CodiceDestinatario is " + (code ? "“" + code + "”" : "empty") + ", not 0000000");
    if (code && fmt === "FPA12" && code.length !== 6) add("02", at(dt, "CodiceDestinatario"), "FPA12 needs a CodiceDestinatario of 6 characters, but “" + code + "” has " + code.length);
    if (code && fmt === "FPR12" && code.length !== 7) add("02", at(dt, "CodiceDestinatario"), "FPR12 needs a CodiceDestinatario of 7 characters, but “" + code + "” has " + code.length);
    const buyer = one(hdr, "CessionarioCommittente"), da = one(buyer, "DatiAnagrafici");
    if (buyer && da && !one(da, "IdFiscaleIVA") && !one(da, "CodiceFiscale")) add("03", da, "The buyer has neither IdFiscaleIVA nor CodiceFiscale");
    if (fmt === "FPA12") {
      const so = one(buyer, "StabileOrganizzazione"), rf = one(buyer, "RappresentanteFiscale");
      if (so) add("04", so, "The buyer's StabileOrganizzazione is given in an FPA12 invoice");
      if (rf) add("04", rf, "The buyer's RappresentanteFiscale is given in an FPA12 invoice");
    }
    const sede = at(hdr, "CedentePrestatore/Sede"), prov = one(sede, "Provincia"), nation = val(sede, "Nazione");
    if (prov && nation && nation !== "IT") add("05", prov, "The seller's Provincia is given, but the seat is in " + nation + ", not IT");
    kids(root, "FatturaElettronicaBody").forEach((body) => kids(one(body, "DatiBeniServizi"), "DatiRiepilogo").forEach((r) => {
      if (one(r, "Natura") && !val(r, "RiferimentoNormativo")) add("06", r, "The VAT summary with Natura " + val(r, "Natura") + " has no RiferimentoNormativo");
    }));
    Array.from(root.getElementsByTagName("*")).forEach((e) => {
      if (e.children.length || e.namespaceURI === "http://www.w3.org/2000/09/xmldsig#" || e.closest("Signature")) return;
      if (e.textContent.trim() === "") add("07", e, e.localName + " is empty");
    });
    return found;
  }
  window.ItSpec = { check, rules: RULES.map((r) => "IT-SPEC-" + r[0]), texts: RULES };
})();
