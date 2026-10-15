# eDocument XML Viewer

A static page (no server, nothing leaves the browser) that reads a UBL invoice or credit note, shows it the way an invoice reads, and checks it against the
rules of the format it declares: EN 16931, PEPPOL BIS, France (Flux 2 / e-reporting Flux 10), Germany (XRechnung), Italy and the UAE (PINT AE).

## Layout

| Folder / file | What is in it |
|---|---|
| `index.html`, `style.css` | the page and its styles; `index.html` lists every script, in load order |
| `app.js` | the screen: loading, state, the sections, the Checks list, issue navigation |
| `i18n.js` | the language layer (English, Italian): `T()` for screen text, `tr()` for rule messages |
| `lib/` | pieces the screen uses: `specs.js` (which fields are shown), `codes.js` (code lists), `profiles.js` (the country extension point), `schematron.js` (runs an official Schematron in the browser; `vendor/` is the XPath engine), `attachments.js`, `json-to-ubl.js`, `sample.js` |
| `rules/` | the rule engine and the rules every country shares: `en16931.js` (engine + EN 16931), `peppol.js`, generated `codelists.js` and `ubl-structure.js` |
| `countries/<id>/` | everything one country adds: its rules, its screen extras (`profile.js`), its Italian text, its example |
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
4. **Example** (`sample.js`, optional): `window.<ID>_SAMPLE_XML`, used by `profile.js`.
5. **Tests**: a differential test that runs the official stylesheet and the viewer on the same documents (`tests/differential.js`), with the examples
   of the country, aimed documents and mutants. `tests/README.md` shows how the UAE ones are built.

Then add the `<script>` lines to `index.html` (after `rules/en16931.js`, before `app.js`).

## Checking a change

* `tests/run.sh` (about 11 minutes; `quick` skips the mutants) compares the viewer with the official validators. It needs Java, Python and Node with Playwright.
* `tests/snapshot.js` saves how the viewer renders a set of documents, English and Italian: run it before and after a change that must not alter the
  screen (a refactoring) and compare the two files with `cmp`.
