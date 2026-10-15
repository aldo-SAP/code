#!/usr/bin/env python3
"""Prints the ids of the asserts of a Schematron file, one per line: assert-ids.py A.sch [--minus B.sch] (without those that B has too)."""
import sys
from lxml import etree
S = "{http://purl.oclc.org/dsdl/schematron}"
ids = lambda f: [a.get("id") for a in etree.parse(f).getroot().iter(S + "assert")]
a = ids(sys.argv[1])
if "--minus" in sys.argv:
    b = set(ids(sys.argv[sys.argv.index("--minus") + 1]))
    a = [i for i in a if i not in b]
print("\n".join(a))
