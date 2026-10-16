#!/usr/bin/env python3
"""Generates the EN 16931 and Peppol rule data from the official releases:

  ../rules/en16931-rules.js   CEN EN 16931 UBL validation artefacts (ConnectingEurope/eInvoicing-EN16931, tag validation-1.3.17):
                              ubl/schematron/preprocessed/EN16931-UBL-validation-preprocessed.sch (all patterns: the business rules, the UBL syntax rules, the code lists)
  ../rules/peppol-rules.js    Peppol BIS Billing 3.0 (OpenPEPPOL/peppol-bis-invoice-3, tag v3.0.20): rules/sch/PEPPOL-EN16931-UBL.sch,
                              with the Peppol common rules and the national rules (DE, DK, GR, IS, IT, NL, NO, SE) it carries

usage: gen-en16931.py CACHE-DIR      (tests/.cache)
"""
import sys, os, subprocess

cache = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
dest = os.path.join(here, "..", "rules")


def gen(src, out, glob, version, *extra):
    subprocess.run([sys.executable, os.path.join(here, "gen-schematron.py"), src, out, glob, version] + list(extra), check=True)


gen(os.path.join(cache, "en16931", "ubl", "schematron", "preprocessed", "EN16931-UBL-validation-preprocessed.sch"), os.path.join(dest, "en16931-rules.js"), "EN16931_RULES",
    "CEN EN 16931 validation artefacts 1.3.17", "--allpatterns=1")
gen(os.path.join(cache, "peppol", "rules", "sch", "PEPPOL-EN16931-UBL.sch"), os.path.join(dest, "peppol-rules.js"), "PEPPOL_RULES", "Peppol BIS Billing 3.0.20")
