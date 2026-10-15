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
| PINT AE (UAE) | the official Peppol PINT AE 1.0.4 package (billing and self-billing): schematron, compiled XSLT, examples | the viewer runs the 302 official asserts themselves; every assert must be present, and the failures must equal the official stylesheet's on the examples, on documents aimed at single rules, on documents with one change each and on random breaks; a coverage count shows which asserts the documents reach |

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

`run-unit.js`, `differential.js` (also `--workers=N` to use several browser tabs), `ereport-gen.js`, `ereport-differential.js`, `check-ae-rules.js` and `coverage-ae.py` can also be run alone; their headers say how.

## PINT AE (UAE)

The PINT AE rules are not re-written: `../rules/pint-ae-rules.js` holds all 302 official asserts (170 PINT layer, 132 UAE layer) exactly as published and
`../rules/ae.js` evaluates them with [fontoxpath](../rules/vendor/README.md) the way the official stylesheet does. Because of that the tests ask three things:

1. `check-ae-rules.js`: the viewer has every official assert id, and no other.
2. `differential.js --sets=ae`: the failed asserts equal the official stylesheet's, on
   - the official examples (invoices, credit notes, self-billing);
   - `mutate-ae-targeted.py`: documents aimed at single rules (a second copy, a missing element, a code with its reason removed, identifiers of other schemes with good and wrong check digits …);
   - `mutate-ae.py`: every element and attribute of the examples changed one at a time (deleted, duplicated, emptied, set to values of its kind), a share of them (`AE_RATE`, default 0.12);
   - `mutate.py`: random breaks (`AE_RANDOM`, default 400 per variant).
3. `coverage-ae.py`: how many of the 302 asserts the official stylesheet actually fails on these documents. An assert that is never reached is a rule the tests did
   not exercise; the few that cannot be reached are listed in the script with the reason.

`gen-pint-ae.py` regenerates `../rules/pint-ae-rules.js` from the unpacked release (`python3 gen-pint-ae.py .cache/pint-ae`).

## Known differences

Listed at the top of `run.sh` and left out of the comparison on purpose:

- National PEPPOL rule sets this tool does not implement: Germany, Greece, Iceland, Italy, and Denmark/Sweden beyond the first rules.
- `BR-CO-09`: the official list rejects the Greek VAT prefix `EL`; the viewer accepts it, as it is the EU prefix.
- PINT AE: documents on which the official stylesheet stops with a type error (for example two seller names, where a rule expects one) are skipped; the viewer reports the same documents with a failed rule that says it could not be evaluated.
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
