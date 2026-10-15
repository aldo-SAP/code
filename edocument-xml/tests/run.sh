#!/bin/bash
# Conformance suite: the rule engine against the official validators. See README.md.
#   run.sh            unit tests + examples + 600 mutants each for EN 16931/PEPPOL and France
#   run.sh quick      unit tests + examples only
# Exit code 0 only when nothing differs (apart from the documented differences below).
cd "$(dirname "$0")"; T="$PWD"; C="$T/.cache"; W="$C/work"
[ -d "$C/en16931" ] || ./fetch-artefacts.sh || exit 2
mkdir -p "$W"; rm -rf "$W"/*
fail=0
saxon() { # xslt srcdir outdir
  mkdir -p "$3"; java -cp "$C/saxon12.jar:$C/xmlresolver.jar" net.sf.saxon.Transform -quit:off -xsl:"$1" -s:"$2" -o:"$3" 2>&1 | grep -v JAVA_TOOL | head -3 >/dev/null; }
ids() { grep -ho 'name="id">[A-Za-z0-9-]*<' "$@" | sed 's/name="id">//;s/<//' | sort -u; }

EN="$C/en16931/ubl/xslt/EN16931-UBL-validation.xslt"
FR="$C/france/FNFE_RFE_INVOICE/UBL/EN16931/2xslt"
FX2="$C/france/FNFE_RFE_INVOICE/UBL/EXTENDED-CTC-FR/2xslt"
PP="$C/peppol-ubl.xslt"
ids "$EN" "$PP" > "$W/en-pp.ids"
ids "$FR"/*.xslt > "$W/en-fr.ids"
AEC="$C/pint-ae"
ids "$AEC"/billing/trn-invoice/schematron/*.xslt > "$W/ae.ids"
ids "$FX2"/*.xslt > "$W/en-fx.ids"

# Differences that are intended or come from the official artefacts, not from mistakes:
#  - national PEPPOL rule sets this tool does not implement (DE, DK-R-003+, GR, IS, IT, SE-R-003+, NL/NO come from other sources)
#  - BR-CO-09: the official list rejects EL, the EU VAT prefix of Greece; this tool accepts it
#  - PEPPOL-EN16931-R007: the official stylesheet also reports it for documents without a ProfileID, which R001 already covers
IGNORE_EN="DE-R,DK-R,GR-,IS-R,IT-R,SE-R,NL-R,NO-R,PEPPOL-EN16931-R007,BR-CO-09"
#  - France: extended-profile (multi-vendor, sub-line) rules; the FR copy of the EN schematron is older (UBL-SR-25/58/59 differ)
IGNORE_FR="BR-CO-09,BR-FR-MV,BR-FR-BD,UBL-SR-25,UBL-SR-58,UBL-SR-59"
#  - EXTENDED-CTC-FR documents (compared with that profile's own schematron): its replacement rules BR-FREXT-/UBL-FREXT- are not implemented, and
#    the engine only applies the line-reference relaxation (UBL-CR-528..531); the other rules that profile switches off stay on, on purpose
#    (UBL-SR-04/16/20/34/52 and the other UBL-CR extension rules), so it reports them where the official extended schematron does not
IGNORE_FX="BR-CO-09,BR-FR-MV,BR-FR-BD,BR-FREXT,UBL-FREXT"
#  - only in mutants: a VAT tax category written without the VAT scheme, which the official S/B/O/IG/IP rules treat differently
#    (the primary rules BR-CO-04, BR-32, BR-37, BR-47, BR-48 do match)
IGNORE_MUT="BR-S-01,BR-S-02,BR-S-04,BR-O-01,BR-O-11,BR-O-12,BR-IG-01,BR-IP-08,UBL-SR-13,BR-CO-11,BR-S-08"

# France documents on the EXTENDED-CTC-FR profile are checked against that profile's own schematron, the others against the CIUS FR one
split_fr() { # dir -> dir.ext and dir.cius
  mkdir -p "$1.ext" "$1.cius"
  for f in "$1"/*.xml; do
    if grep -qiP '<(cbc:)?CustomizationID>[^<]*extended-ctc-fr' "$f"; then cp "$f" "$1.ext/"; else cp "$f" "$1.cius/"; fi
  done; }
fr_run() { # label docdir extra-ignore log
  local d="$2" ign="$3" lg="$4" tag; tag=$(basename "$d")
  split_fr "$d"
  for x in BR-FR-Flux2-Schematron-UBL BR-FR-Flux2-Schematron-UBL_WARNING EN16931-UBL-validation; do saxon "$FR/$x.xslt" "$d.cius" "$W/$tag-cius-$x"; done
  for x in BR-FR-Flux2-Schematron-UBL BR-FR-Flux2-Schematron-UBL_WARNING EXTENDED-CTC-FR-UBL; do saxon "$FX2/$x.xslt" "$d.ext" "$W/$tag-ext-$x"; done
  step "$1 ($(ls "$d.cius" | wc -l) CIUS FR, $(ls "$d.ext" | wc -l) EXTENDED-CTC-FR documents)"
  run node differential.js --docs="$d.cius" --svrl="$W/$tag-cius-BR-FR-Flux2-Schematron-UBL,$W/$tag-cius-BR-FR-Flux2-Schematron-UBL_WARNING,$W/$tag-cius-EN16931-UBL-validation" --ids="$W/en-fr.ids" --sets=fr --ignore="$IGNORE_FR$ign" ${lg:+--log="$W/$tag-cius.log.json"}
  run node differential.js --docs="$d.ext" --svrl="$W/$tag-ext-BR-FR-Flux2-Schematron-UBL,$W/$tag-ext-BR-FR-Flux2-Schematron-UBL_WARNING,$W/$tag-ext-EXTENDED-CTC-FR-UBL" --ids="$W/en-fx.ids" --sets=fr --ignore="$IGNORE_FX$ign" ${lg:+--log="$W/$tag-ext.log.json"}
}

# PINT AE (UAE): the official stylesheets of the PINT layer and of the UAE layer, run on the same documents as the viewer's engine
# ibr-011-ae and ibr-013-ae have an attribute as context, which the compiled official stylesheets never visit (they are not ignored in the viewer)
ae_run() { # label docdir billing|selfbilling [mutation log]
  local d="$2" tag; tag=$(basename "$2")
  for x in PINT-UBL-validation-preprocessed PINT-jurisdiction-aligned-rules; do saxon "$AEC/$3/trn-invoice/schematron/$x.xslt" "$d" "$W/$tag-$x"; done
  step "$1 ($(ls "$d" | wc -l) documents)"
  run node differential.js --docs="$d" --svrl="$W/$tag-PINT-UBL-validation-preprocessed,$W/$tag-PINT-jurisdiction-aligned-rules" --ids="$W/ae.ids" --sets=ae --workers=4 --ignore=ibr-011-ae,ibr-013-ae${5:+,$5} ${4:+--log="$4"}
  AE_GROUPS="$AE_GROUPS $W/$tag-PINT-UBL-validation-preprocessed,$W/$tag-PINT-jurisdiction-aligned-rules"
}
AE_GROUPS=""
step() { echo; echo "== $1"; }
run() { "$@" || fail=1; }

step "EN 16931 unit tests (official, $(ls "$C"/en16931/test/Invoice-unit-UBL "$C"/en16931/test/CreditNote-unit-UBL | grep -c xml) files)"
run node run-unit.js "$C/en16931/test/Invoice-unit-UBL" "$C/en16931/test/CreditNote-unit-UBL"
step "PEPPOL unit tests (official)"
run node run-unit.js --sets=peppol "$C/peppol/rules/unit-UBL-PEPPOL"

# example invoices from the three repositories (valid ones)
D="$W/examples"; mkdir -p "$D"; n=0
while IFS= read -r f; do
  grep -q "InvoiceLine\|CreditNoteLine" "$f" && grep -q "<Invoice\|<CreditNote\|:Invoice \|:CreditNote " "$f" || continue
  n=$((n+1)); cp "$f" "$D/$(printf %03d $n)_$(basename "$f" | tr ' ' '_')"
done < <(find "$C/en16931/ubl/examples" "$C/en16931/test/testfiles" "$C/peppol/rules/examples" "$C/peppol/rules/national-examples" -iname "*.xml" 2>/dev/null)
saxon "$EN" "$D" "$W/ex-en"; saxon "$PP" "$D" "$W/ex-pp"
step "EN 16931 + PEPPOL on $n official example invoices"
run node differential.js --docs="$D" --svrl="$W/ex-en,$W/ex-pp" --ids="$W/en-pp.ids" --sets=peppol --ignore="$IGNORE_EN"

F="$W/fr-examples"; mkdir -p "$F"; n=0
while IFS= read -r f; do
  grep -q "InvoiceLine\|CreditNoteLine" "$f" && grep -q "<Invoice\|<CreditNote\|:Invoice \|:CreditNote " "$f" || continue
  n=$((n+1)); cp "$f" "$F/$(printf %03d $n)_$(basename "$f" | tr ' ' '_')"
done < <(find "$C/france-examples" "$C/france/FNFE_RFE_INVOICE/Z.example/TEST/UBL" -name "*.xml" -not -path "*__MACOSX*" 2>/dev/null)
fr_run "France (XP Z12-012, UBL) on $n official example invoices" "$F" "" ""

# E-reporting: the UBL is turned into a Flux 10 report; the official Flux 10 schematron checks that report
FX="$C/france/FNFE_RFE_INVOICE/Flux10/Flux10.xslt"
node ereport-gen.js "$F" "$W/er-examples" > /dev/null; saxon "$FX" "$W/er-examples" "$W/er-examples-sv"
step "E-reporting (Flux 10) on $n official example invoices"
run node ereport-differential.js "$F" "$W/er-examples-sv"

# PINT AE (UAE)
step "PINT AE rules: the viewer carries every official assert"
run node check-rules.js PintAE "$W/ae.ids"
step "PINT AE: every message has its Italian text (countries/ae/it-messages.js is rebuilt from ae-it.tsv)"
run node gen-ae-it.js
for v in billing selfbilling; do
  AD="$W/ae-examples-$v"; mkdir -p "$AD"; n=0
  for f in "$AEC/$v"/trn-invoice/example/*.xml "$AEC/$v"/trn-creditnote/example/*.xml; do
    n=$((n+1)); cp "$f" "$AD/$(printf %03d $n)_$(basename "$f" | tr ' ' '_')"
  done
  [ "$v" = billing ] && run node check-ae-viewer.js "$AD"
  ae_run "PINT AE ($v) on the official example invoices and credit notes" "$AD" "$v" ""
  mkdir -p "$W/ae-targeted-$v"; python3 -I targeted-ae.py "$W/ae-targeted-$v" "$AD" --log="$W/ae-targeted-$v.log.json" > /dev/null
  ae_run "PINT AE ($v) on documents aimed at single rules" "$W/ae-targeted-$v" "$v" "$W/ae-targeted-$v.log.json" "$([ "$v" = selfbilling ] && echo ibr-cl-01)"
done

# XRechnung (Germany): the official KoSIT validation is the EN 16931 schematron plus the XRechnung one (which carries the Peppol rules it integrates).
# The EN 16931 part is compared above; here only the asserts of the XRechnung schematron are (the viewer runs the EN 16931 rules too, but they are not looked at)
XRC="$C/xrechnung"
ids "$XRC/xr-ubl.xslt" > "$W/de.ids"
DE_GROUPS=""
de_run() { # label docdir [mutation log]
  local d="$2" tag; tag=$(basename "$2")
  saxon "$XRC/xr-ubl.xslt" "$d" "$W/$tag-xr"
  step "$1 ($(ls "$d" | wc -l) documents)"
  run node differential.js --docs="$d" --svrl="$W/$tag-xr" --ids="$W/de.ids" --sets=de --workers=4 ${3:+--log="$3"}
  DE_GROUPS="$DE_GROUPS $W/$tag-xr"
}
step "XRechnung: the viewer carries every official assert"
run node check-rules.js XRechnung "$W/de.ids"
step "XRechnung: every message has its English and Italian text (countries/de/messages.js is rebuilt from de-en.tsv and de-it.tsv)"
run node gen-de-messages.js
DD="$W/de-examples"; mkdir -p "$DD"; n=0
while IFS= read -r f; do
    n=$((n+1)); cp "$f" "$DD/$(printf %03d $n)_$(basename "$f")"
done < <({ find "$XRC/testsuite/src/test" -name "*.xml" | grep -iv "uncefact\|cii"; ls "$XRC"/sch/test/instances/ubl-inv/*.xml "$XRC"/sch/test/instances/ubl-cn/*.xml; } | sort)
de_run "XRechnung on the official test suite and rule test documents" "$DD" ""
mkdir -p "$W/de-targeted"; python3 -I targeted-de.py "$W/de-targeted" "$DD" --log="$W/de-targeted.log.json" > /dev/null
de_run "XRechnung on documents aimed at single rules" "$W/de-targeted" "$W/de-targeted.log.json"
if [ "$1" != "quick" ]; then
  N=${MUTANTS:-600}
  python3 mutate.py "$W/mut-en" "$N" "${SEED:-1}" "$D" > /dev/null
  saxon "$EN" "$W/mut-en" "$W/mut-en-en"; saxon "$PP" "$W/mut-en" "$W/mut-en-pp"
  step "EN 16931 + PEPPOL on $N mutated example invoices"
  run node differential.js --docs="$W/mut-en" --svrl="$W/mut-en-en,$W/mut-en-pp" --ids="$W/en-pp.ids" --sets=peppol --ignore="$IGNORE_EN,$IGNORE_MUT" --log="$W/mut-en.log.json"
  python3 mutate.py "$W/mut-fr" "$N" "$(( ${SEED:-1} + 1 ))" "$F" > /dev/null
  fr_run "France on $N mutated example invoices" "$W/mut-fr" ",$IGNORE_MUT" log
  node ereport-gen.js "$W/mut-fr" "$W/er-mut" > /dev/null; saxon "$FX" "$W/er-mut" "$W/er-mut-sv"
  step "E-reporting (Flux 10) on $N mutated example invoices"
  run node ereport-differential.js "$W/mut-fr" "$W/er-mut-sv"
  # PINT AE: every element and attribute of the examples changed one at a time (a share of them), and random breaks
  for v in billing selfbilling; do
    # a changed CustomizationID turns a self-billing document into a billing one for the viewer (it picks the type codes from it) but not for the
    # official stylesheet of the variant that was run: only ibr-cl-01 can differ, and the targeted documents cover it
    CL=""; [ "$v" = selfbilling ] && CL="ibr-cl-01"
    python3 -I mutate-single.py "$W/ae-single-$v" "$W/ae-examples-$v" --rate="${AE_RATE:-0.12}" --seed="${SEED:-1}" --log="$W/ae-single-$v.log.json" > /dev/null
    ae_run "PINT AE ($v) on documents with one change each" "$W/ae-single-$v" "$v" "$W/ae-single-$v.log.json" "$CL"
    python3 mutate.py "$W/ae-random-$v" "${AE_RANDOM:-400}" "$(( ${SEED:-1} + 2 ))" "$W/ae-examples-$v" > /dev/null
    ae_run "PINT AE ($v) on randomly broken documents" "$W/ae-random-$v" "$v" "$W/ae-random-$v.log.json" "$CL"
  done
  step "PINT AE: how many official asserts the test documents reach"
  # shellcheck disable=SC2086
  run python3 -I coverage.py ae "$W/ae.ids" $AE_GROUPS
  # XRechnung: the same for the German documents
  python3 -I mutate-single.py "$W/de-single" "$DD" --profile=de --rate="${DE_RATE:-0.004}" --seed="${SEED:-1}" --log="$W/de-single.log.json" > /dev/null
  de_run "XRechnung on documents with one change each" "$W/de-single" "$W/de-single.log.json"
  python3 mutate.py "$W/de-random" "${DE_RANDOM:-400}" "$(( ${SEED:-1} + 3 ))" "$DD" > /dev/null
  de_run "XRechnung on randomly broken documents" "$W/de-random" "$W/de-random.log.json"
  step "XRechnung: how many official asserts the test documents reach"
  # shellcheck disable=SC2086
  run python3 -I coverage.py de "$W/de.ids" $DE_GROUPS
fi
echo; [ $fail = 0 ] && echo "ALL CONFORMANT" || echo "DIFFERENCES FOUND"
exit $fail
