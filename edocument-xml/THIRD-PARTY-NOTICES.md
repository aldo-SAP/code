# Third-party sources and licences

The eDocument XML Viewer is a small internal helper tool, not a product. It checks UBL, FatturaPA and the related XML files against the published rules of each country.
The checking code, the viewer and the sample invoices are original work (the samples contain invented data only). The rules, schemas and fonts below belong to their authors.
This file says where each comes from, under which licence it is published, and what was changed. If you are an author and want something changed or removed, please open an issue.

## Rules and schemas

| What | Used in | Source (version) | Licence |
|---|---|---|---|
| EN 16931 validation rules (CEN TC 434) | `rules/en16931-rules.js` | ConnectingEurope/eInvoicing-EN16931, validation artefacts 1.3.17 | EUPL v1.2 |
| Peppol BIS Billing 3.0 rules | `rules/peppol-rules.js` | OpenPEPPOL/peppol-bis-invoice-3, release 3.0.20 | no licence text in the repository; published openly by OpenPeppol |
| XRechnung rules (Germany) | `countries/de/xrechnung-rules.js` | itplr-kosit/xrechnung-schematron 2.6.0 for XRechnung 3.0.2 (includes Peppol BIS Billing 3.0.21 rules) | Apache License 2.0 |
| UBL 2.1 XML schemas (structure check) | `rules/ubl-schema-data.js` | OASIS UBL 2.1, as shipped in the KoSIT XRechnung validator configuration (itplr-kosit/validator-configuration-xrechnung) | OASIS (copyright notice below) |
| France rules (BR-FR, e-reporting) | `countries/fr/*-rules.js` | fnfempe/France_RFE, FNFE-MPE schematron for AFNOR XP Z12-012, UBL 1.4.0.04 | Apache License 2.0 |
| PINT AE rules (UAE) | `countries/ae/pint-ae-rules.js` | Peppol PINT AE 1.0.4, taken from phax/phive-rules (`phive-rules-peppol-pint`) | phive-rules: Apache License 2.0; the PINT AE rules themselves are published by OpenPeppol |
| FatturaPA XML schemas (Italy) | `rules/it-schema-data.js` | Schema_VFPA12_V1.2.3.xsd (the ordinary invoice, same file as Schema_VFPR12_v1.2.3.xsd) and Schema_VFSM10v_1.0.2.xsd, from fatturapa.gov.it | public documentation of the Italian tax authority |
| FatturaPA specification rules | `rules/it-spec.js` | "Specifiche tecniche operative del formato della fattura del Sistema di Interscambio" (Allegato A del DM 55/2013), version 1.4 | public documentation of the Italian tax authority |
| SdI controls (Italy) | `rules/it-sdi.js` | "Elenco dei controlli effettuati sul file fattura del Sistema di Interscambio", version 2.0 (31/01/2025), and "Specifiche tecniche relative al Sistema di Interscambio", version 1.8.4 (31/03/2026) | public documentation of the Italian tax authority |

What was changed: the Schematron files were converted into data (`tests/gen-schematron.py`, `tests/gen-pint-ae.py`) so that a small engine can run them in the browser. The rules (their
ids, conditions and messages) are kept as published. English and Italian translations of the messages and the "how to fix" lines were added. The Italian rules were written from the
documents named above, together with English wording; the Italian code descriptions are the schema's own text. No text of the AFNOR standard itself is included.

The viewer's own checks (`FR-CHK-*`, `CHK-*`, the structure rules `UBL-XSD-*` and `IT-XSD-*`, `IT-SPEC-*`) are not part of any official rule set and are marked as such.

## Code and fonts included in the page

| What | Where | Licence |
|---|---|---|
| fontoxpath 3.34.0 (XPath 3.1), with xspattern and prsc | `lib/vendor/fontoxpath.js` | MIT, see `lib/vendor/fontoxpath.LICENSE.md` |
| Instrument Sans (font) | `fonts/instrument-sans.woff2` | SIL Open Font License 1.1, see `fonts/OFL-InstrumentSans.txt` |
| JetBrains Mono (font) | `fonts/jetbrains-mono.woff2` | SIL Open Font License 1.1, see `fonts/OFL-JetBrainsMono.txt` |

## Notices

- OASIS UBL 2.1: Copyright © OASIS Open 2001-2013. All Rights Reserved. The OASIS schemas are used under the OASIS IPR policy; this tool is not endorsed by OASIS.
- Peppol, PINT, XRechnung, FatturaPA, EN 16931 and the other names are used only to say which format a check is for. They belong to their owners; this tool is not an official validator
  and is not endorsed by any of them. A result here does not replace the official validators or the platforms' own checks.
- EUPL v1.2 (EN 16931 rules): the text of the licence is at https://eupl.eu/1.2/en. The rule data derived from the CEN artefacts is made available here, as readable source, under the same licence.
- Apache License 2.0 (KoSIT, FNFE-MPE, phive-rules): https://www.apache.org/licenses/LICENSE-2.0. The notices of the original projects are kept in their repositories (linked by name above).
- This tool runs in the browser and sends nothing anywhere: the documents you open stay on your computer.
