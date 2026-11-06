# eDocument XML Viewer

A static page (no server, nothing leaves the browser) that reads a UBL invoice or credit note, shows it the way an invoice reads, and checks it against the
rules of the format it declares: EN 16931, PEPPOL BIS, France (Flux 2 / e-reporting Flux 10), Germany (XRechnung) and the UAE (PINT AE). It also reads the Italian
electronic invoice (FatturaPA, ordinary and simplified, which is not UBL) and checks it in three layers: the XML schema, the rules of the format specification and the
controls of the Sistema di Interscambio (SdI) that can be made on the file alone. English and Italian; every example on the start screen is made of invented data.

The rules, schemas, code lists and fonts come from their publishers: `THIRD-PARTY-NOTICES.md` (and the "Sources and licences" page, `notices.html`, generated from it) says
where each comes from, in which version and under which licence.

## Layout

| Folder / file | What is in it |
|---|---|
| `index.html`, `style.css` | the page and its styles; `index.html` lists every script, in load order |
| `app.js` | the screen: loading, state, the sections, the Checks list, issue navigation |
| `notices.html`, `THIRD-PARTY-NOTICES.md` | sources and licences of everything that is not ours (`tests/gen-notices.py` makes the page from the file) |
| `i18n.js` | the language layer (English, Italian): `T()` for screen text, `tr()` for rule messages |
| `lib/` | pieces the screen uses: `specs.js` (which fields are shown), `codes.js` (code lists), `profiles.js` (the country extension point), `schematron.js` (runs an official Schematron in the browser; `vendor/` is the XPath engine), `help.js` (the how-to-fix lines), `attachments.js`, `request-to-ubl.js` (the `{ req: […] }` request), `request-document.js` (the `{ id, document: […] }` request of the German and UAE templates: the placements are guesses from the field names and the PINT AE rules, listed in the converter's assumptions until the real mapping replaces them), `units-data.js` and `currency-data.js` (all the UN/ECE Recommendation 20 unit codes and the ISO 4217 currency codes, generated), `request-check.js` with `request-structure-fr.js` (compares a French request with the structure the platform provider gave: field names only), `request-fixes.js` (for the amount rules that fail, the value each request field should have), `sample.js` |
| `rules/` | the rule engine and the rules every country shares: `en16931.js` (engine, the viewer's own checks, checking in slices), `ubl-schema.js` and `ubl-schema-data.js` (the UBL 2.1 structure check, from the OASIS schemas), `en16931-rules.js` and `peppol-rules.js` (the official CEN and Peppol asserts as data, generated), `peppol.js`, `messages.js` (Italian), `help.js` (how-to-fix lines) |
| `countries/<id>/` | everything one country adds: its rules, its screen extras (`profile.js`), its Italian text, its example. Italy is the exception in shape: its document is not UBL, so `countries/it/view.js` builds the fields view itself, and its checks are in `rules/it-schema.js` (the XML schema, from generated data), `rules/it-spec.js` (the format specification) and `rules/it-sdi.js` (the SdI controls) |
| `tests/` | the tests against the official validators (see `tests/README.md`) |

## How a country plugs in

A country is a folder `countries/<id>/` with up to five files, each registering itself; `app.js` and `rules/en16931.js` never name a country.

1. **Rules** (`rules.js`): `EN16931.register("<id>", { label, name, detect(R), run({ R, cn, rule }), standalone? })`.
   `detect` decides from the document (usually its CustomizationID) that the rule set applies; `run` reports with `rule(id, elements, ok, text, detail, warn)`.
   `standalone: true` is for a format that is not EN 16931 and replaces it (PINT AE); otherwise the set is added on top of EN 16931.
   When the country publishes a Schematron, run the official asserts unchanged (`countries/ae/` and `countries/de/` do; `lib/schematron.js` is the shared engine and
   `tests/gen-pint-ae.py` / `tests/gen-xrechnung.py` turn the official `.sch` into the data file) rather than rewriting them.
2. **Screen extras** (`profile.js`, optional): `EdocProfiles.register((h) => ({ id, detect(R), docFields, lineFields, refLabels, sample }))`
   for fields that exist only in that format (the UAE transaction type) and the example button. The format is described in `lib/profiles.js`.
3. **Translations** (`it.js`, optional): `I18N.addItalian({ "English": "Italiano" }, [["pattern {x}", "modello {x}"]])`; `I18N.addEnglish` does the same for rules whose official
   text is not English (Germany: `messages.js`). Large generated message lists go in their own file (`it-messages.js`, `messages.js`).
   **How to fix** (`help.js`, optional): `EdocHelp.add({ "rule-id": ["English", "Italiano"] })`, shown under a failed rule; `tests/gen-help.js` builds them from `tests/help-<id>.tsv`.
4. **Example** (`sample.js`, optional): `window.<ID>_SAMPLE_XML`, used by `profile.js`.
5. **Tests**: a differential test that runs the official stylesheet and the viewer on the same documents (`tests/differential.js`), with the examples
   of the country, aimed documents and mutants. `tests/README.md` shows how the UAE ones are built.

Then add the `<script>` lines to `index.html` (after `rules/en16931.js`, before `app.js`).

## Checking a change

* `tests/check.sh` is the one to run before every push: the quick checks (no downloads, about a minute). It regenerates the service worker (`sw.js`, which lists the page's files and must be current),
  and checks the help lines, the translations, that the page loads nothing from another site, that every example passes its rules with no warning, the Italian layers, that
  the French request converter agrees with the platform's real results (`tests/converter/`) and the request structure check.
* `tests/run.sh par` (the four parts at the same time; `quick` skips the mutants; plain `run.sh` runs them one after the other) compares the viewer with the official validators. It needs Java, Python and Node with Playwright.
* `tests/snapshot.js` saves how the viewer renders a set of documents, English and Italian: run it before and after a change that must not alter the
  screen (a refactoring) and compare the two files with `cmp`.

## Conventions

* Generated files (`rules/*-rules.js`, `rules/*-data.js`, `lib/*-data.js`, `lib/request-structure-fr.js`, the `messages.js` files, `sw.js`, `notices.html`) are written by scripts in `tests/`; change the script or its source, not the output.
* Examples are invented: no real company, tax number or bank account. An example must pass its rules with no error and no warning (`tests/check-samples.js`, `tests/it/check-sample.js`).
* What the platform does (`tests/converter/cases.json`) is only what the platform really answered; each case names the message or result it comes from. A guess goes in the converter's list of assumptions, not in a case.
* Nothing the viewer is given is stored: no cookies, no storage of documents, no call to another site (`tests/check-offline.js` fails otherwise).
