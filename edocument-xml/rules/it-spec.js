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
    ["02", "The buyer's StabileOrganizzazione and RappresentanteFiscale may only be used in an invoice to private parties (FPR12) (specification 3.5.3 and 3.5.4)"],
    ["03", "The seller's Provincia may only be given for a seat in Italy (specification 1.2)"],
    ["04", "A VAT summary with a Natura must give RiferimentoNormativo (specification 2.2)"],
    ["05", "An element without a value must be left out of the file, not written empty (specification 3)"]
  ];

  function check(root) {
    const found = [];
    const add = (kind, el, detail) => found.push({ kind, el, detail });
    if (!root || root.localName !== "FatturaElettronica") return found;
    const hdr = one(root, "FatturaElettronicaHeader"), dt = one(hdr, "DatiTrasmissione");
    const fmt = val(dt, "FormatoTrasmissione"), code = val(dt, "CodiceDestinatario"), pec = at(dt, "PECDestinatario");
    if (pec && code !== "0000000") add("01", pec, "PECDestinatario is given, but CodiceDestinatario is " + (code ? "“" + code + "”" : "empty") + ", not 0000000");
    const buyer = one(hdr, "CessionarioCommittente");
    if (fmt === "FPA12") {
      const so = one(buyer, "StabileOrganizzazione"), rf = one(buyer, "RappresentanteFiscale");
      if (so) add("02", so, "The buyer's StabileOrganizzazione is given in an FPA12 invoice");
      if (rf) add("02", rf, "The buyer's RappresentanteFiscale is given in an FPA12 invoice");
    }
    const sede = at(hdr, "CedentePrestatore/Sede"), prov = one(sede, "Provincia"), nation = val(sede, "Nazione");
    if (prov && nation && nation !== "IT") add("03", prov, "The seller's Provincia is given, but the seat is in " + nation + ", not IT");
    kids(root, "FatturaElettronicaBody").forEach((body) => kids(one(body, "DatiBeniServizi"), "DatiRiepilogo").forEach((r) => {
      if (one(r, "Natura") && !val(r, "RiferimentoNormativo")) add("04", r, "The VAT summary with Natura " + val(r, "Natura") + " has no RiferimentoNormativo");
    }));
    Array.from(root.getElementsByTagName("*")).forEach((e) => {
      if (e.children.length || e.namespaceURI === "http://www.w3.org/2000/09/xmldsig#" || e.closest("Signature")) return;
      if (e.textContent.trim() === "") add("05", e, e.localName + " is empty");
    });
    return found;
  }
  window.ItSpec = { check, rules: RULES.map((r) => "IT-SPEC-" + r[0]), texts: RULES };
})();
