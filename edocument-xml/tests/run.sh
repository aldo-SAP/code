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
  mkdir -p "$3"; java -cp "$C/saxon12.jar:$C/xmlresolver.jar" net.sf.saxon.Transform -xsl:"$1" -s:"$2" -o:"$3" 2>&1 | grep -v JAVA_TOOL | head -3 >/dev/null; }
ids() { grep -ho 'name="id">[A-Za-z0-9-]*<' "$@" | sed 's/name="id">//;s/<//' | sort -u; }

EN="$C/en16931/ubl/xslt/EN16931-UBL-validation.xslt"
FR="$C/france/FNFE_RFE_INVOICE/UBL/EN16931/2xslt"
PP="$C/peppol-ubl.xslt"
ids "$EN" "$PP" > "$W/en-pp.ids"
ids "$FR"/*.xslt > "$W/en-fr.ids"

# Differences that are intended or come from the official artefacts, not from mistakes:
#  - national PEPPOL rule sets this tool does not implement (DE, DK-R-003+, GR, IS, IT, SE-R-003+, NL/NO come from other sources)
#  - BR-CO-09: the official list rejects EL, the EU VAT prefix of Greece; this tool accepts it
#  - PEPPOL-EN16931-R007: the official stylesheet also reports it for documents without a ProfileID, which R001 already covers
IGNORE_EN="DE-R,DK-R,GR-,IS-R,IT-R,SE-R,NL-R,NO-R,PEPPOL-EN16931-R007,BR-CO-09"
#  - France: extended-profile (multi-vendor, sub-line) rules; the FR copy of the EN schematron is older (UBL-SR-25/58/59 differ)
IGNORE_FR="BR-CO-09,BR-FR-MV,BR-FR-BD,UBL-SR-25,UBL-SR-58,UBL-SR-59"
#  - only in mutants: a VAT tax category written without the VAT scheme, which the official S/B/O/IG/IP rules treat differently
#    (the primary rules BR-CO-04, BR-32, BR-37, BR-47, BR-48 do match)
IGNORE_MUT="BR-S-01,BR-S-02,BR-S-04,BR-O-01,BR-O-11,BR-O-12,BR-IG-01,BR-IP-08,UBL-SR-13,BR-CO-11,BR-S-08"

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
for x in BR-FR-Flux2-Schematron-UBL BR-FR-Flux2-Schematron-UBL_WARNING EN16931-UBL-validation; do saxon "$FR/$x.xslt" "$F" "$W/fr-$x"; done
step "France (XP Z12-012, UBL) on $n official example invoices"
run node differential.js --docs="$F" --svrl="$W/fr-BR-FR-Flux2-Schematron-UBL,$W/fr-BR-FR-Flux2-Schematron-UBL_WARNING,$W/fr-EN16931-UBL-validation" --ids="$W/en-fr.ids" --sets=fr --ignore="$IGNORE_FR"

# E-reporting: the UBL is turned into a Flux 10 report; the official Flux 10 schematron checks that report
FX="$C/france/FNFE_RFE_INVOICE/Flux10/Flux10.xslt"
node ereport-gen.js "$F" "$W/er-examples" > /dev/null; saxon "$FX" "$W/er-examples" "$W/er-examples-sv"
step "E-reporting (Flux 10) on $n official example invoices"
run node ereport-differential.js "$F" "$W/er-examples-sv"

if [ "$1" != "quick" ]; then
  N=${MUTANTS:-600}
  python3 mutate.py "$W/mut-en" "$N" "${SEED:-1}" "$D" > /dev/null
  saxon "$EN" "$W/mut-en" "$W/mut-en-en"; saxon "$PP" "$W/mut-en" "$W/mut-en-pp"
  step "EN 16931 + PEPPOL on $N mutated example invoices"
  run node differential.js --docs="$W/mut-en" --svrl="$W/mut-en-en,$W/mut-en-pp" --ids="$W/en-pp.ids" --sets=peppol --ignore="$IGNORE_EN,$IGNORE_MUT" --log="$W/mut-en.log.json"
  python3 mutate.py "$W/mut-fr" "$N" "$(( ${SEED:-1} + 1 ))" "$F" > /dev/null
  for x in BR-FR-Flux2-Schematron-UBL BR-FR-Flux2-Schematron-UBL_WARNING EN16931-UBL-validation; do saxon "$FR/$x.xslt" "$W/mut-fr" "$W/mut-fr-$x"; done
  step "France on $N mutated example invoices"
  run node differential.js --docs="$W/mut-fr" --svrl="$W/mut-fr-BR-FR-Flux2-Schematron-UBL,$W/mut-fr-BR-FR-Flux2-Schematron-UBL_WARNING,$W/mut-fr-EN16931-UBL-validation" --ids="$W/en-fr.ids" --sets=fr --ignore="$IGNORE_FR,$IGNORE_MUT" --log="$W/mut-fr.log.json"
  node ereport-gen.js "$W/mut-fr" "$W/er-mut" > /dev/null; saxon "$FX" "$W/er-mut" "$W/er-mut-sv"
  step "E-reporting (Flux 10) on $N mutated example invoices"
  run node ereport-differential.js "$W/mut-fr" "$W/er-mut-sv"
fi
echo; [ $fail = 0 ] && echo "ALL CONFORMANT" || echo "DIFFERENCES FOUND"
exit $fail
