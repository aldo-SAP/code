# Conformance tests

These tests check the viewer's rule engine (`../rules/`) against the **official validators**, so a rule change that breaks
something shows up before it reaches the page. Nothing here is needed to use the viewer.

## What is compared

| Step | Official source | What it checks |
|---|---|---|
| EN 16931 unit tests | `ConnectingEurope/eInvoicing-EN16931` `test/*-unit-UBL` | 1,131 small test documents, each naming a rule that must or must not fail |
| PEPPOL unit tests | `OpenPEPPOL/peppol-bis-invoice-3` `rules/unit-UBL-PEPPOL` | the same for PEPPOL BIS Billing 3.0 |
| Example invoices | the three repositories' own examples | the engine and the official stylesheet must report the same rules |
| French examples | `fnfempe/France_RFE` (XP Z12-012 / Z12-014 annex examples) | the viewer runs the official `BR-FR-` asserts (and for EXTENDED-CTC-FR the `BR-FREXT-` ones) themselves; same comparison with the official stylesheets, on the examples and on mutants |
| E-reporting (Flux 10) | `fnfempe/France_RFE` `Flux10/Flux10.xslt` and `Flux10/xsd` | the UBL is turned into a Flux 10 report (`ereport-gen.js`); the official schematron checks that report and must report the same rules as the engine, on the examples and on mutants |
| Mutated invoices | the example invoices, randomly broken (`mutate.py`) | same, on documents with missing or wrong data |
| XRechnung (Germany) | KoSIT `xrechnung-schematron` 2.6.0 (XRechnung 3.0.2) with the Peppol rules it integrates, and the `xrechnung-testsuite` | the viewer runs the 77 official asserts themselves, compared with the official stylesheet on the test suite, aimed documents and mutants (see below) |
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

`run-unit.js`, `differential.js` (also `--workers=N` to use several browser tabs), `ereport-gen.js`, `ereport-differential.js`, `check-rules.js`, `check-translations.js`, `gen-schematron.py` and `coverage.py` can also be run alone; their headers say how.

## PINT AE (UAE)

The PINT AE rules are not re-written: `../countries/ae/pint-ae-rules.js` holds all 302 official asserts (170 PINT layer, 132 UAE layer) exactly as published and
`../lib/schematron.js` evaluates them with [fontoxpath](../lib/vendor/README.md) the way the official stylesheet does. Because of that the tests ask three things:

1. `check-rules.js`: the viewer has every official assert id, and no other.
2. `differential.js --sets=ae`: the failed asserts equal the official stylesheet's, on
   - the official examples (invoices, credit notes, self-billing);
   - `targeted-ae.py`: documents aimed at single rules (a second copy, a missing element, a code with its reason removed, identifiers of other schemes with good and wrong check digits …);
   - `mutate-single.py`: every element and attribute of the examples changed one at a time (deleted, duplicated, emptied, set to values of its kind), a share of them (`AE_RATE`, default 0.12);
   - `mutate.py`: random breaks (`AE_RANDOM`, default 400 per variant).
3. `coverage.py`: how many of the 302 asserts the official stylesheet actually fails on these documents. An assert that is never reached is a rule the tests did
   not exercise; the few that cannot be reached are listed in the script with the reason.

`gen-pint-ae.py` regenerates `../countries/ae/pint-ae-rules.js` from the unpacked release (`python3 gen-pint-ae.py .cache/pint-ae`).

## XRechnung (Germany)

Same approach as PINT AE: `../countries/de/xrechnung-rules.js` holds the 77 official asserts (56 of the XRechnung schematron for the CIUS, Extension and CVD profiles, 21 Peppol
rules the XRechnung build integrates) and `../lib/schematron.js` runs them. `fetch-artefacts.sh` rebuilds the official merged schematron the way KoSIT's `build.xml` does
(`peppol-into-xr.xsl`, with the Peppol BIS 3.0.21 rules pinned by commit) and compiles it with the ISO Schematron skeleton (KoSIT uses SchXslt, whose host is not reachable
from here; the rules are the same, and the comparison below shows the viewer agrees with the compiled result).

1. `check-rules.js XRechnung`: the viewer has every official assert id, and no other.
2. `differential.js --sets=de` against the XRechnung stylesheet (only its asserts are compared; the EN 16931 rules the viewer also runs are compared in the EN 16931 steps) on
   - the 271 UBL documents of the official test suite and rule unit tests (`xrechnung-testsuite`, `xrechnung-schematron/test/instances`);
   - `targeted-de.py`: documents aimed at single rules (Extension and CVD profiles, payment means and groups, IBAN check digits, e-mail, telephone, Skonto, URL and date forms …);
   - `mutate-single.py --profile=de`: every element and attribute changed one at a time, a share of them (`DE_RATE`, default 0.004; 0.02 was run once: 15,906 documents, no difference);
   - `mutate.py`: random breaks (`DE_RANDOM`, default 400).
3. `coverage.py de`: the official asserts the documents actually fail (77 of 77).
4. `gen-de-messages.js` rebuilds `countries/de/messages.js` from `de-en.tsv` and `de-it.tsv`: the official messages are German (or English for the Peppol rules); every message must have
   an Italian text and every German one an English text.

`fontoxpath` adds decimals as floating point where Saxon adds them exactly, so `lib/schematron.js` evaluates `sum()` with its own exact function (`u:sum`).

## France

Same approach as PINT AE and XRechnung: `../countries/fr/br-fr-rules.js` (the 175 asserts of `BR-FR-Flux2-Schematron-UBL.sch`) and `../countries/fr/frext-rules.js`
(for the EXTENDED-CTC-FR profile: the 66 asserts only `EXTENDED-CTC-FR-UBL.sch` has, plus `FR_EXT_OFF`, the 92 EN 16931 asserts it leaves out) are generated by
`gen-france.py` and run by `../lib/schematron.js`. The `_WARNING` copy of the French schematron has the same asserts with other severities and is not used. The assert ids
are the official ones (`BR-FR-01_BT-1-1`), and `differential.js` compares them one to one. The messages are French in the source: `gen-fr-messages.js` builds the English and
Italian text from `fr-en.tsv` and `fr-it.tsv`, and `check-translations.js` fails when a failed rule of the test documents has no translation (it is also used for the UAE and Germany).
The viewer adds its own `FR-CHK-` warnings (check digits and legal mentions of French identifiers) that are not in the official rules.

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

## Screen regression snapshot

`node snapshot.js OUT.json DIR…` loads the two sample invoices and the first six XML files of each folder, in English and Italian, and writes the
rendered verdict, hero, fields and raw XML. Run it before and after a change that must not alter the screen (a refactoring) and compare the two files with `cmp`.
