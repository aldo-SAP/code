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
| UBL 2.1 schema | the OASIS UBL 2.1 XSDs, run with libxml2 | the viewer's structure check and libxml2 agree on every document (see below) |
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
./run.sh par        # the same in four parts at the same time (EN 16931 + Peppol, France, UAE, Germany); logs in .cache/log-<part>.txt
SECTIONS="ae de" ./run.sh   # only some parts (en, fr, ae, de)
MUTANTS=1500 SEED=7 ./run.sh   # more or different mutants
```

Output ends with `ALL CONFORMANT` (exit code 0) or `DIFFERENCES FOUND`. A difference is listed as
*official only* (the engine misses a rule) or *engine only* (the engine reports a rule the official one does not), with the
changes made to the mutant that caused it.

`run-unit.js`, `differential.js` (also `--workers=N` to use several browser tabs), `ereport-gen.js`, `ereport-differential.js`, `check-rules.js`, `check-translations.js`, `gen-schematron.py` and `coverage.py` can also be run alone; their headers say how.

## UBL 2.1 schema (the structure of the document)

The official validators check a document against the OASIS UBL 2.1 XML Schema before any business rule; the business rules do not look at the order of the elements, so a
document with its elements in the wrong place passes them. `../rules/ubl-schema.js` does that check in the browser: `gen-ubl-schema.py` turns the OASIS schemas (taken from the
KoSIT XRechnung validator configuration release, checked by `fetch-artefacts.sh` against a fixed SHA-256, because docs.oasis-open.org is not reachable from here) into
`../rules/ubl-schema-data.js`, the content model of every element of an invoice and credit note. It reports six rules, `UBL-XSD-01` to `UBL-XSD-06` (an element out of place or unknown, a
required element missing, too many of one, a value of the wrong form, an attribute missing or not allowed, text next to elements).

1. `run.sh` regenerates the data and compares it with the committed file.
2. `xsd-verdicts.py` asks libxml2 (through lxml) whether each document is valid; `xsd-differential.js` runs the viewer's check on the same documents. They must agree on every one,
   on the examples of every country and on `mutate-xsd.py` documents: from the examples, one change each of the kinds the schema is about (two neighbours swapped, an element
   repeated, removed or unknown, text or an element in the wrong place, and every leaf value replaced by good and bad forms of its type: numbers, dates, times, true/false, base64,
   languages, URIs). About 30,000 documents were compared while building it: the only difference found was the year 0000, which XML Schema 1.0 does not allow (fixed).
3. Known limit: libxml2 is stricter than the Java validators about `anyURI` (a lone `%`, an open `[`); the viewer does not check URIs, and such errors are not counted in the comparison.
   libxml2 is also the only schema validator used here: a second one (Xerces, as in KoSIT's validator) would be a further check.

## EN 16931 and PEPPOL

Same approach as every other rule set: the viewer does not re-write the rules. `../rules/en16931-rules.js` holds the 981 asserts of the CEN EN 16931 UBL schematron
(`ConnectingEurope/eInvoicing-EN16931`, tag `validation-1.3.17`: the business rules `BR-`, `BR-CO-`, `BR-DEC-`, the VAT category rules, the syntax rules `UBL-CR/DT/SR` and the code
lists `BR-CL-`) and `../rules/peppol-rules.js` the 159 of Peppol BIS Billing 3.0 (`OpenPEPPOL/peppol-bis-invoice-3`, tag `v3.0.20`: `PEPPOL-EN16931-`, `PEPPOL-COMMON-` and the
national rules). `gen-en16931.py` writes both from the schematron; `lib/schematron.js` evaluates them. `../rules/en16931.js` keeps the viewer's own `CHK-` consistency checks
and, for the failed amount rules, adds the calculation with its numbers to the detail ("BT-106 … ≠ …").

1. `check-rules.js EN16931` and `check-rules.js PeppolRules`: the viewer has every official assert id, and no other.
2. `run-unit.js`: the official unit tests (1,131 EN 16931 documents; the Peppol and national ones), each naming the rule that must or must not fail.
3. `differential.js --sets=peppol`: the official stylesheets and the viewer report the same rules on the example invoices and on 600 mutants of them, with nothing left out.
4. `gen-en-messages.js` rebuilds `../rules/messages.js` from `en-it.tsv` and `pp-it.tsv`; `check-all-translations.js` fails when any message of any rule set has no Italian text.

## How to fix lines

`../lib/help.js` shows a plain-language "how to fix" line under each failed rule, in English and Italian. The lines are data: `tests/help-<set>.tsv` (`id<TAB>English<TAB>Italian`) and
`gen-help.js`, which also writes the generic line for the 678 `UBL-CR-` rules ("delete X: EN 16931 has no field for it"). They are written from the assert's test and message, not
invented; a rule whose message already names its field and value has none. `check-help.js` fails for a line that belongs to no rule or lacks one of the languages.

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

- France: the French copy of the EN 16931 schematron is older than CEN's 1.3.17, so `UBL-SR-25`, `UBL-SR-58`, `UBL-SR-59` and `BR-CO-09` differ. The viewer follows 1.3.17
  (the CEN stylesheet, run on the same documents, agrees with the viewer).
- PINT AE: `ibr-011-ae` and `ibr-013-ae` have an attribute as context, which the compiled official stylesheets never visit; the viewer's own check of them is tested separately.
- Documents on which an official stylesheet stops with a type error (two seller names where a rule expects one, say) are skipped and counted in the output. A rule whose context
  cannot be evaluated on a node does not match it, as in XSLT.

## Generated files

`../rules/en16931-rules.js`, `../rules/peppol-rules.js`, `../countries/*/…-rules.js`, the `messages.js` files and `../rules/help.js` are generated; edit the sources, not the output:

```
python3 gen-en16931.py .cache                          # both the EN 16931 and the Peppol data file
node gen-en-messages.js && node gen-help.js
```

When the official artefacts are updated, change the pinned tags in `fetch-artefacts.sh`, delete `.cache/`, run `./run.sh par`, regenerate, and look at what differs.

## Screen regression snapshot

`node snapshot.js OUT.json DIR…` loads the two sample invoices and the first six XML files of each folder, in English and Italian, and writes the
rendered verdict, hero, fields and raw XML. Run it before and after a change that must not alter the screen (a refactoring) and compare the two files with `cmp`.

## Italy (FatturaPA)

- `gen-it-schema.py OUT.js XSD…` builds `rules/it-schema-data.js` from the official XSDs (`Schema_VFPA12_V1.2.3.xsd`, which is the same file as `Schema_VFPR12_v1.2.3.xsd`, and `Schema_VFSM10v_1.0.2.xsd`); keep them in `.cache/it-fatturapa/`.
- `it/mutate.py` makes documents from a sample invoice with one change each and takes libxml2's schema verdict; `it/differential.js` compares the viewer's structure check (`rules/it-schema.js`) with it (needs the XSD with the XMLDSig import pointed at a local stub).
- `it/check-spec.js` tests the specification rules (`rules/it-spec.js`, from the technical specification v1.4).
- `it/check-sdi.js` tests the controls of the Sistema di Interscambio (`rules/it-sdi.js`, from "Elenco dei controlli" v2.0 and the SdI specifications 1.8.4): every code on the sample invoice with one change each.
