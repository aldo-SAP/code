# Conformance tests

These tests check the viewer's rule engine (`../rules/`) against the **official validators**, so a rule change that breaks
something shows up before it reaches the page. Nothing here is needed to use the viewer.

## What is compared

| Step | Official source | What it checks |
|---|---|---|
| EN 16931 unit tests | `ConnectingEurope/eInvoicing-EN16931` `test/*-unit-UBL` | 1,131 small test documents, each naming a rule that must or must not fail |
| PEPPOL unit tests | `OpenPEPPOL/peppol-bis-invoice-3` `rules/unit-UBL-PEPPOL` | the same for PEPPOL BIS Billing 3.0 |
| Example invoices | the three repositories' own examples | the engine and the official stylesheet must report the same rules |
| French examples | `fnfempe/France_RFE` (XP Z12-012 / Z12-014 annex examples) | same, with the French (`BR-FR-`) schematron |
| E-reporting (Flux 10) | `fnfempe/France_RFE` `Flux10/Flux10.xslt` and `Flux10/xsd` | the UBL is turned into a Flux 10 report (`ereport-gen.js`); the official schematron checks that report and must report the same rules as the engine, on the examples and on mutants |
| Mutated invoices | the example invoices, randomly broken (`mutate.py`) | same, on documents with missing or wrong data |

The official stylesheets are run with Saxon (Java); the engine runs in headless Chromium (Playwright), loading the page
from disk.

## Running

Needs `git`, `java`, `curl`, `unzip`, `python3` with `lxml`, and Node with Playwright (`npm i -g playwright`).

```
cd edocument-xml/tests
./run.sh            # everything; first run downloads the artefacts into .cache/ (about 100 MB)
./run.sh quick      # unit tests and examples only
MUTANTS=1500 SEED=7 ./run.sh   # more or different mutants
```

Output ends with `ALL CONFORMANT` (exit code 0) or `DIFFERENCES FOUND`. A difference is listed as
*official only* (the engine misses a rule) or *engine only* (the engine reports a rule the official one does not), with the
changes made to the mutant that caused it.

`run-unit.js`, `differential.js`, `ereport-gen.js` and `ereport-differential.js` can also be run alone; their headers say how.

## Known differences

Listed at the top of `run.sh` and left out of the comparison on purpose:

- National PEPPOL rule sets this tool does not implement: Germany, Greece, Iceland, Italy, and Denmark/Sweden beyond the first rules.
- `BR-CO-09`: the official list rejects the Greek VAT prefix `EL`; the viewer accepts it, as it is the EU prefix.
- France: the multi-vendor and sub-line rules of the extended profiles (`BR-FR-MV-`, `BR-FR-BD-`).
- France, `extended-ctc-fr` invoices: they are compared with that profile's own schematron. Its replacement rules (`BR-FREXT-`, `UBL-FREXT-`) are not implemented.
  The viewer applies only one relaxation of that profile, the line-level order, despatch, receipt and previous-invoice references (`UBL-CR-528` to `531`);
  the other rules the profile switches off (for example `UBL-SR-16`, one buyer identifier) stay on, on purpose.
- Mutants only: a VAT tax category written **without** the VAT scheme. The primary rules (`BR-CO-04`, `BR-32`, `BR-37`,
  `BR-47`, `BR-48`) match; the secondary S/B/O/IG/IP rules treat it differently in a few documents.

## Generated files

`../rules/codelists.js` and `../rules/ubl-structure.js` are generated from the official stylesheets; edit the generators
(`gen-codelists.py`, `gen-ubl-structure.py`, `ubl-structure.tmpl.js`), not the output:

```
python3 gen-codelists.py .cache/en16931/ubl/xslt/EN16931-UBL-validation.xslt .cache/peppol/rules/sch/PEPPOL-EN16931-UBL.sch
python3 gen-ubl-structure.py .cache/en16931/ubl/xslt/EN16931-UBL-validation.xslt
```

When the official artefacts are updated, delete `.cache/`, run `./run.sh`, regenerate the two files, and look at what differs.
