#!/usr/bin/env python3
"""Generates the French rule data from the official FNFE-MPE schematrons (France_RFE, XP Z12-012 UBL, version 1.4.0.04):

  ../countries/fr/br-fr-rules.js   the 175 asserts of BR-FR-Flux2-Schematron-UBL.sch (the blocking one; the _WARNING copy has the same asserts, more of them as warnings)
  ../countries/fr/frext-rules.js   for the EXTENDED-CTC-FR profile: the asserts only EXTENDED-CTC-FR-UBL.sch has (BR-FREXT-, UBL-FREXT-), and the ids of the
                                   EN 16931 asserts it leaves out (FR_EXT_OFF), taken by comparing it with EN16931-UBL-validation-preprocessed.sch

usage: gen-france.py .cache/france/FNFE_RFE_INVOICE/UBL
"""
import sys, os, re, subprocess, json
from lxml import etree

base = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
dest = os.path.join(here, "..", "countries", "fr")
S = "{http://purl.oclc.org/dsdl/schematron}"
VERSION = "FNFE-MPE XP Z12-012 UBL 1.4.0.04"


def ids_of(f):
    return [a.get("id") for a in etree.parse(f).getroot().iter(S + "assert")]


def gen(src, out, glob, *extra):
    subprocess.run([sys.executable, os.path.join(here, "gen-schematron.py"), src, out, glob, VERSION] + list(extra), check=True)


br = os.path.join(base, "EN16931", "schematron", "BR-FR-Flux2-Schematron-UBL.sch")
gen(br, os.path.join(dest, "br-fr-rules.js"), "FR_RULES")
en = set(ids_of(os.path.join(base, "EN16931", "schematron", "EN16931-UBL-validation-preprocessed.sch")))
ext = os.path.join(base, "EXTENDED-CTC-FR", "schematron", "EXTENDED-CTC-FR-UBL.sch")
ext_ids = ids_of(ext)
only = [i for i in ext_ids if i not in en]
off = sorted(en - set(ext_ids))
tmp = os.path.join(dest, ".only.txt")
open(tmp, "w").write("\n".join(only))
out = os.path.join(dest, "frext-rules.js")
gen(ext, out, "FR_EXT_RULES", "--only=" + tmp, "--allpatterns=1")
os.remove(tmp)
open(out, "a", encoding="utf-8").write("// the EN 16931 asserts the EXTENDED-CTC-FR schematron leaves out (they are replaced by the BR-FREXT- ones)\nwindow.FR_EXT_OFF = " + json.dumps(off) + ";\n")
print("EXTENDED-CTC-FR: %d own asserts, %d EN 16931 asserts left out" % (len(only), len(off)))
