#!/usr/bin/env node
// The controls of the Sistema di Interscambio (rules/it-sdi.js) on the sample invoice with one change each: the codes named must be found, and no others.
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
(async () => {
  const base = fs.readFileSync(path.join(__dirname, "sample-td01.xml"), "utf8");
  const R = (from, to, all) => { if (!base.includes(from)) throw new Error("not in the sample: " + from); return all ? base.split(from).join(to) : base.replace(from, to); };
  const SELLER = "<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>";
  const BUYER = "<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>09876543210</IdCodice></IdFiscaleIVA>";
  const cassa = (extra) => "<DatiCassaPrevidenziale><TipoCassa>TC01</TipoCassa><AlCassa>4.00</AlCassa><ImportoContributoCassa>0.00</ImportoContributoCassa>" + extra + "</DatiCassaPrevidenziale>";
  const doc = (xml, name) => [xml, name];
  const cases = [
    ["the sample", base, [], "IT01234567890_00001.xml"],
    ["file name not valid", base, ["00001"], "fattura.xml"],
    ["date after today", R("<Data>2026-05-20</Data>", "<Data>2999-01-01</Data>") , null],
    ["Natura missing at rate 0", R("<Natura>N4</Natura>\n      </DettaglioLinee>", "</DettaglioLinee>"), ["00400"]],
    ["Natura on a taxed line", R("<AliquotaIVA>22.00</AliquotaIVA>\n      </DettaglioLinee>", "<AliquotaIVA>22.00</AliquotaIVA><Natura>N4</Natura>\n      </DettaglioLinee>"), ["00401"]],
    ["contribution at rate 0 without Natura", R("<ImportoTotaleDocumento>", cassa("<AliquotaIVA>0.00</AliquotaIVA>") + "<ImportoTotaleDocumento>"), ["00413"]],
    ["contribution at 22 with Natura", R("<ImportoTotaleDocumento>", cassa("<AliquotaIVA>22.00</AliquotaIVA><Natura>N4</Natura>") + "<ImportoTotaleDocumento>"), ["00414"]],
    ["Ritenuta on a line without DatiRitenuta", R("<AliquotaIVA>22.00</AliquotaIVA>\n      </DettaglioLinee>", "<AliquotaIVA>22.00</AliquotaIVA><Ritenuta>SI</Ritenuta>\n      </DettaglioLinee>"), ["00411"]],
    ["Ritenuta on the contribution without DatiRitenuta", R("<ImportoTotaleDocumento>", cassa("<AliquotaIVA>22.00</AliquotaIVA><Ritenuta>SI</Ritenuta>") + "<ImportoTotaleDocumento>"), ["00415"]],
    ["buyer without identification", R(BUYER, ""), ["00417"]],
    ["credit note older than the invoice", R("<TipoDocumento>TD01", "<TipoDocumento>TD04").replace("</DatiOrdineAcquisto>", "</DatiOrdineAcquisto><DatiFattureCollegate><IdDocumento>F1</IdDocumento><Data>2026-06-01</Data></DatiFattureCollegate>"), ["00418"]],
    ["no summary for rate 0", R(/<DatiRiepilogo><AliquotaIVA>0.00.*<\/DatiRiepilogo>\n/.exec(base)[0], ""), ["00419", "00443", "00444"]],
    ["reverse charge with split payment", R("<Natura>N4</Natura>", "<Natura>N6.9</Natura>", true).replace("<Imposta>0.00</Imposta>", "<Imposta>0.00</Imposta><EsigibilitaIVA>S</EsigibilitaIVA>"), ["00420"]],
    ["Imposta wrong", R("<Imposta>19.80</Imposta>", "<Imposta>19.90</Imposta>"), ["00421"]],
    ["Imposta within the tolerance", R("<Imposta>19.80</Imposta>", "<Imposta>19.81</Imposta>"), []],
    ["ImponibileImporto wrong", R("<ImponibileImporto>90.00</ImponibileImporto><Imposta>19.80</Imposta>", "<ImponibileImporto>95.00</ImponibileImporto><Imposta>20.90</Imposta>"), ["00422"]],
    ["PrezzoTotale wrong", R("<PrezzoTotale>90.00000000</PrezzoTotale>", "<PrezzoTotale>80.00000000</PrezzoTotale>"), ["00422", "00423"]],
    ["rate as a fraction", R("<AliquotaIVA>22.00</AliquotaIVA>", "<AliquotaIVA>0.22</AliquotaIVA>", true).replace("<Imposta>19.80</Imposta>", "<Imposta>0.20</Imposta>"), ["00424"]],
    ["Numero without a digit", R("<Numero>1/2026</Numero>", "<Numero>ABC</Numero>"), ["00425"]],
    ["FPR12 with 6 characters", R("ABCDEFG", "ABCDEF"), ["00427"]],
    ["FPA12 with 7 characters", R("<FormatoTrasmissione>FPR12", "<FormatoTrasmissione>FPA12"), ["00427", "00428"]],
    ["versione differs", R('versione="FPR12"', 'versione="FPA12"'), ["00428"]],
    ["summary at rate 0 without Natura", R("<AliquotaIVA>0.00</AliquotaIVA><Natura>N4</Natura><ImponibileImporto>", "<AliquotaIVA>0.00</AliquotaIVA><ImponibileImporto>"), ["00429", "00444"]],
    ["summary at 22 with Natura", R("<AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>", "<AliquotaIVA>22.00</AliquotaIVA><Natura>N4</Natura><ImponibileImporto>"), ["00430"]],
    ["document discount without a value", R("<ImportoTotaleDocumento>", "<ScontoMaggiorazione><Tipo>SC</Tipo></ScontoMaggiorazione><ImportoTotaleDocumento>"), ["00437"]],
    ["line discount without a value", R("<PrezzoUnitario>10.00</PrezzoUnitario>\n        <PrezzoTotale>", "<PrezzoUnitario>10.00</PrezzoUnitario><ScontoMaggiorazione><Tipo>SC</Tipo></ScontoMaggiorazione>\n        <PrezzoTotale>"), ["00438"]],
    ["line rate without a summary", R("<AliquotaIVA>22.00</AliquotaIVA>\n      </DettaglioLinee>", "<AliquotaIVA>21.00</AliquotaIVA>\n      </DettaglioLinee>"), ["00422", "00443"]],
    ["line Natura not in the summary", R("<Natura>N4</Natura>\n      </DettaglioLinee>", "<Natura>N5</Natura>\n      </DettaglioLinee>"), ["00444"]],
    ["generic Natura N3", R("<Natura>N4</Natura>", "<Natura>N3</Natura>", true), ["00445"]],
    ["TD16 with the same seller and buyer", R("<TipoDocumento>TD01", "<TipoDocumento>TD16").replace(BUYER, SELLER), ["00471"]],
    ["TD21 with different parties", R("<TipoDocumento>TD01", "<TipoDocumento>TD21"), ["00472", "00474"]],
    ["TD17 with an Italian seller", R("<TipoDocumento>TD01", "<TipoDocumento>TD17"), ["00473"]],
    ["TD29 with a foreign seller", R("<TipoDocumento>TD01", "<TipoDocumento>TD29").replace("<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>\n        <Anagrafica><Denominazione>Alfa", "<IdFiscaleIVA><IdPaese>DE</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>\n        <Anagrafica><Denominazione>Alfa"), ["00473"]],
    ["TD16 without the buyer's VAT number", R("<TipoDocumento>TD01", "<TipoDocumento>TD16").replace(BUYER, "<CodiceFiscale>RSSMRA80A01H501U</CodiceFiscale>"), ["00475"]],
    ["both parties abroad", R("<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>09876543210</IdCodice></IdFiscaleIVA>", "<IdFiscaleIVA><IdPaese>FR</IdPaese><IdCodice>09876543210</IdCodice></IdFiscaleIVA>").replace("<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>\n        <Anagrafica><Denominazione>Alfa", "<IdFiscaleIVA><IdPaese>DE</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>\n        <Anagrafica><Denominazione>Alfa"), ["00476"]],
    ["the same invoice twice in a batch", (() => { const m = /<FatturaElettronicaBody>[\s\S]*<\/FatturaElettronicaBody>/.exec(base)[0]; return base.replace(m, m + m); })(), ["00409"]],
  ];
  const b = await chromium.launch(), p = await b.newPage();
  await p.setContent("<html></html>");
  await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "..", "..", "rules", "it-sdi.js"), "utf8") });
  let bad = 0;
  for (const [label, xml, want, name] of cases) {
    const got = await p.evaluate(([t, n]) => { const d = new DOMParser().parseFromString(t, "application/xml"); return Array.from(new Set(ItSdi.check(d.documentElement, { name: n || "", today: "2026-10-22" }).map((f) => f.kind))).sort(); }, [xml, name]);
    const w = want || ["00403"];
    const ok = JSON.stringify(got) === JSON.stringify(w);
    if (!ok) bad++;
    console.log((ok ? "ok   " : "FAIL ") + label + "  " + JSON.stringify(got) + (ok ? "" : "  expected " + JSON.stringify(w)));
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
