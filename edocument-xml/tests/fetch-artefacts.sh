#!/bin/bash
# Downloads the official validation artefacts and the tools used to run them into tests/.cache (not committed).
#   EN 16931 (CEN TC434) UBL schematron + unit tests ... github.com/ConnectingEurope/eInvoicing-EN16931
#   PEPPOL BIS Billing 3.0 schematron + unit tests ..... github.com/OpenPEPPOL/peppol-bis-invoice-3
#   France (FNFE-MPE, XP Z12-012) schematron + examples . github.com/fnfempe/France_RFE
#   PINT AE (UAE) official release 1.0.4 (schematron, XSLT, code lists, examples), billing and self-billing: the zips Peppol publishes, as
#     collected in ................................... github.com/phax/phive-rules (only the phive-rules-peppol-pint folder is fetched)
#   XRechnung (Germany) schematron 2.6.0 for XRechnung 3.0.2 + test suite ... github.com/itplr-kosit/xrechnung-schematron, xrechnung-testsuite;
#     it integrates Peppol BIS Billing 3.0.21 rules, taken from the commit the official build uses (github.com/OpenPEPPOL/peppol-bis-invoice-3)
#   ISO Schematron skeleton (compiles .sch to XSLT) .... github.com/Schematron/schematron
#   UBL 2.1 XML Schemas (OASIS) ........................ the KoSIT XRechnung validator configuration release (github.com/itplr-kosit/validator-configuration-xrechnung)
#   Saxon-HE 12 + xmlresolver (XSLT 3 processor) ....... repo1.maven.org
# Needs: git, java, curl, unzip.
set -e
C="$(cd "$(dirname "$0")" && pwd)/.cache"
mkdir -p "$C"; cd "$C"
clone() { [ -d "$2/.git" ] || GIT_LFS_SKIP_SMUDGE=1 git clone -q --depth 1 ${3:+--branch "$3"} "https://github.com/$1.git" "$2"; }
# the released versions the validators use (XRechnung 3.0 builds on CEN 1.3.16; 1.3.17 is the latest release; Peppol BIS Billing 3.0.20)
clone ConnectingEurope/eInvoicing-EN16931 en16931 validation-1.3.17
clone OpenPEPPOL/peppol-bis-invoice-3 peppol v3.0.20
clone fnfempe/France_RFE france
clone Schematron/schematron schematron
# PINT AE: sparse, blob-less clone of the one folder that holds the release zips
if [ ! -d phive-rules/.git ]; then
  GIT_LFS_SKIP_SMUDGE=1 git clone -q --depth 1 --filter=blob:none --sparse https://github.com/phax/phive-rules.git phive-rules
  (cd phive-rules && git sparse-checkout set --skip-checks phive-rules-peppol-pint)
fi
for v in billing:pint-ae-resources-dev-1.0.4 selfbilling:pint-ae-sb-resources-dev-1.0.4; do
  d="pint-ae/${v%%:*}"; [ -d "$d" ] || { mkdir -p "$d"; unzip -q -o "phive-rules/phive-rules-peppol-pint/docs/PINT AE/${v##*:}.zip" -d "$d"; }
done
# UBL 2.1 schemas (OASIS os-UBL-2.1), as shipped in the KoSIT XRechnung validator configuration release (docs.oasis-open.org is not reachable from here); the zip is checked
if [ ! -d ubl-xsd/maindoc ]; then
  URL=https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip
  curl -sSfL -o ubl-cfg.zip "$URL"
  [ "$(sha256sum ubl-cfg.zip | cut -c1-64)" = 2530cd107c414511c5d0462ec10f886910395abfca820db82e83d70bf01221a8 ] || { echo "UBL schema bundle: unexpected checksum" >&2; exit 2; }
  mkdir -p ubl-cfg && unzip -q -o ubl-cfg.zip 'resources/ubl/2.1/xsd/*' -d ubl-cfg && mkdir -p ubl-xsd && cp -r ubl-cfg/resources/ubl/2.1/xsd/* ubl-xsd/
fi
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
# XRechnung: the official build merges the whitelisted Peppol rules into the XRechnung schematron (peppol-into-xr.xsl); do the same, then compile
if [ ! -f xrechnung/xr-ubl.xslt ]; then
  mkdir -p xrechnung; cd xrechnung
  [ -d sch/.git ] || git clone -q --depth 1 --branch v2.6.0 https://github.com/itplr-kosit/xrechnung-schematron sch
  [ -d testsuite/.git ] || git clone -q --depth 1 --branch v2026-08-31 https://github.com/itplr-kosit/xrechnung-testsuite testsuite
  B=806866bd2bd91d7e9623b68f08164e8fbe9e67a0   # Peppol BIS 3.0.21 (branch 2026-Q2-QA2), as in the XRechnung build.xml
  mkdir -p sch/build/bis sch/build/schematron/tmp sch/build/schematron/ubl
  for f in PEPPOL-EN16931-UBL.sch PEPPOL-EN16931-CII.sch; do
    [ -f sch/build/bis/$f ] || curl -sSf -o sch/build/bis/$f https://raw.githubusercontent.com/OpenPEPPOL/peppol-bis-invoice-3/$B/rules/sch/$f
  done
  cp sch/src/validation/schematron/common.sch sch/build/schematron/
  sed 's/@xr-schematron.version.full@/2.6.0/g; s/@xrechnung.version@/3.0.2/g' sch/src/validation/schematron/ubl/XRechnung-UBL-validation.sch > sch/build/schematron/tmp/XRechnung-UBL-validation.sch
  S=../schematron/trunk/schematron/code; J="java -cp ../saxon12.jar:../xmlresolver.jar net.sf.saxon.Transform"
  $J -s:sch/build/schematron/tmp/XRechnung-UBL-validation.sch -xsl:sch/src/xsl/peppol-into-xr.xsl -o:sch/build/schematron/ubl/XRechnung-UBL-validation.sch syntax=UBL
  $J -s:sch/build/schematron/ubl/XRechnung-UBL-validation.sch -xsl:$S/iso_dsdl_include.xsl -o:included.sch
  $J -s:included.sch -xsl:$S/iso_abstract_expand.xsl -o:merged.sch
  $J -s:merged.sch -xsl:$S/iso_svrl_for_xslt2.xsl -o:xr-ubl.xslt phase=xrechnung-model
  rm -f included.sch; cd ..
fi
# the examples of the French standard come zipped
for z in france/FNFE_RFE_INVOICE/Z.example/*.zip; do
  d="france-examples/$(basename "$z" .zip)"; [ -d "$d" ] || { mkdir -p "$d"; unzip -q -o "$z" -d "$d" || true; }
done
echo "artefacts ready in $C"
