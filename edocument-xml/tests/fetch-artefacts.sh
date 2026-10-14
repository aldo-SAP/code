#!/bin/bash
# Downloads the official validation artefacts and the tools used to run them into tests/.cache (not committed).
#   EN 16931 (CEN TC434) UBL schematron + unit tests ... github.com/ConnectingEurope/eInvoicing-EN16931
#   PEPPOL BIS Billing 3.0 schematron + unit tests ..... github.com/OpenPEPPOL/peppol-bis-invoice-3
#   France (FNFE-MPE, XP Z12-012) schematron + examples . github.com/fnfempe/France_RFE
#   ISO Schematron skeleton (compiles .sch to XSLT) .... github.com/Schematron/schematron
#   Saxon-HE 12 + xmlresolver (XSLT 3 processor) ....... repo1.maven.org
# Needs: git, java, curl, unzip.
set -e
C="$(cd "$(dirname "$0")" && pwd)/.cache"
mkdir -p "$C"; cd "$C"
clone() { [ -d "$2/.git" ] || GIT_LFS_SKIP_SMUDGE=1 git clone -q --depth 1 "https://github.com/$1.git" "$2"; }
clone ConnectingEurope/eInvoicing-EN16931 en16931
clone OpenPEPPOL/peppol-bis-invoice-3 peppol
clone fnfempe/France_RFE france
clone Schematron/schematron schematron
[ -f saxon12.jar ] || curl -sSf -o saxon12.jar https://repo1.maven.org/maven2/net/sf/saxon/Saxon-HE/12.4/Saxon-HE-12.4.jar
[ -f xmlresolver.jar ] || curl -sSf -o xmlresolver.jar https://repo1.maven.org/maven2/org/xmlresolver/xmlresolver/5.2.2/xmlresolver-5.2.2.jar
# PEPPOL publishes its rules as .sch only: compile them
if [ ! -f peppol-ubl.xslt ]; then
  S=schematron/trunk/schematron/code; T=$(mktemp -d)
  J="java -cp saxon12.jar:xmlresolver.jar net.sf.saxon.Transform"
  $J -s:peppol/rules/sch/PEPPOL-EN16931-UBL.sch -xsl:$S/iso_dsdl_include.xsl -o:$T/1.sch
  $J -s:$T/1.sch -xsl:$S/iso_abstract_expand.xsl -o:$T/2.sch
  $J -s:$T/2.sch -xsl:$S/iso_svrl_for_xslt2.xsl -o:peppol-ubl.xslt
fi
# the examples of the French standard come zipped
for z in france/FNFE_RFE_INVOICE/Z.example/*.zip; do
  d="france-examples/$(basename "$z" .zip)"; [ -d "$d" ] || { mkdir -p "$d"; unzip -q -o "$z" -d "$d" || true; }
done
echo "artefacts ready in $C"
