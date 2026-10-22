#!/usr/bin/env node
// The specification rules of the Italian invoice (rules/it-spec.js) on the sample invoice with one change each: the rule named must fail, and no other.
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
(async () => {
  const base = fs.readFileSync(path.join(__dirname, "sample-td01.xml"), "utf8");
  const R = (from, to) => { if (!base.includes(from)) throw new Error("not in the sample: " + from); return base.replace(from, to); };
  const cases = [
    ["the sample", base, []],
    ["PEC with a recipient code", R("<CodiceDestinatario>ABCDEFG</CodiceDestinatario>", "<CodiceDestinatario>ABCDEFG</CodiceDestinatario><PECDestinatario>a@pec.it</PECDestinatario>"), ["01"]],
    ["PEC with 0000000", R("<CodiceDestinatario>ABCDEFG</CodiceDestinatario>", "<CodiceDestinatario>0000000</CodiceDestinatario><PECDestinatario>a@pec.it</PECDestinatario>"), []],
    ["FPR12 with 6 characters", R("ABCDEFG", "ABCDEF"), ["02"]],
    ["FPA12 with 7 characters", R("<FormatoTrasmissione>FPR12", "<FormatoTrasmissione>FPA12"), ["02"]],
    ["FPA12 with 6 characters", R("<FormatoTrasmissione>FPR12", "<FormatoTrasmissione>FPA12").replace("ABCDEFG", "ABCDEF"), []],
    ["buyer without any identification", R("<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>09876543210</IdCodice></IdFiscaleIVA>", ""), ["03"]],
    ["buyer with a tax code only", R("<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>09876543210</IdCodice></IdFiscaleIVA>", "<CodiceFiscale>RSSMRA80A01H501U</CodiceFiscale>"), []],
    ["buyer representative in FPA12", R("<FormatoTrasmissione>FPR12", "<FormatoTrasmissione>FPA12").replace("ABCDEFG", "ABCDEF").replace("</CessionarioCommittente>", "<RappresentanteFiscale><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>1</IdCodice></IdFiscaleIVA><Denominazione>X</Denominazione></RappresentanteFiscale></CessionarioCommittente>"), ["04"]],
    ["seller province outside Italy", R("<Provincia>RM</Provincia><Nazione>IT</Nazione>", "<Provincia>RM</Provincia><Nazione>DE</Nazione>"), ["05"]],
    ["seller abroad without province", R("<Provincia>RM</Provincia><Nazione>IT</Nazione>", "<Nazione>DE</Nazione>"), []],
    ["Natura without a legal reference", R("<RiferimentoNormativo>Art. 10</RiferimentoNormativo>", ""), ["06"]],
    ["an empty element", R("<Causale>Fornitura</Causale>", "<Causale></Causale>"), ["07"]],
  ];
  const b = await chromium.launch(), p = await b.newPage();
  await p.setContent("<html></html>");
  for (const f of ["rules/it-spec.js"]) await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "..", "..", f), "utf8") });
  let bad = 0;
  for (const [label, xml, want] of cases) {
    const got = await p.evaluate((t) => { const d = new DOMParser().parseFromString(t, "application/xml"); return Array.from(new Set(ItSpec.check(d.documentElement).map((f) => f.kind))).sort(); }, xml);
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) bad++;
    console.log((ok ? "ok   " : "FAIL ") + label + "  " + JSON.stringify(got));
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
