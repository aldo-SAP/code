#!/usr/bin/env python3
"""Which official PINT AE rules do the test documents actually exercise?

usage: coverage-ae.py IDS-FILE SVRL-DIR[,SVRL-DIR…] [SVRL-DIR[,…] …]

Each argument after the ids file is one group of SVRL directories (the SVRL of the same documents from the two official stylesheets:
the PINT layer and the UAE layer). A rule counts as exercised when the official stylesheet reports it failed for at least one test document.
Prints how many of the official asserts were reached and exits 1 when one that can fail was never reached.

A few asserts cannot be reached by a document the official stylesheet can still process; they are listed in UNREACHABLE with the reason.
"""
import sys, re, glob, os

UNREACHABLE = {
    "ibr-011-ae": "its context is an attribute, which the official stylesheets never visit (the viewer's own check is tested separately)",
    "ibr-013-ae": "its context is an attribute, which the official stylesheets never visit (the viewer's own check is tested separately)",
    "ibr-187-ae": "the test is the constant true(), it can never fail",
    # a second copy of these elements makes other official asserts raise a type error (a sequence of 2 items where one is expected),
    # so the official stylesheet stops without a report before this assert is looked at
    "ibr-097": "a second invoice period makes the official stylesheet fail with a type error",
    "ibr-098": "a second seller name makes the official stylesheet fail with a type error",
    "ibr-102": "a second buyer name makes the official stylesheet fail with a type error",
    "ibr-sr-22": "a second tax representative name makes the official stylesheet fail with a type error",
}
ids = [l.strip() for l in open(sys.argv[1]) if l.strip() and l.strip() not in ("Codesmodel", "Codesmodelaligned", "UBL-model", "UBL-modelaligned")]
fired, docs = {}, 0
for group in sys.argv[2:]:
    dirs = group.split(",")
    names = set(os.listdir(dirs[0]))
    for n in names:
        txt = []
        for d in dirs:
            p = os.path.join(d, n)
            s = open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else ""
            if "</svrl:schematron-output>" not in s:
                txt = None; break
            txt.append(s)
        if txt is None:
            continue
        docs += 1
        for i in set(re.findall(r'<svrl:failed-assert[^>]*\sid="([^"]*)"', "".join(txt))):
            fired.setdefault(i, n)
never = [i for i in ids if i not in fired]
real = [i for i in never if i not in UNREACHABLE]
print("%d test documents; %d of %d official asserts reached (%d more cannot be reached, see UNREACHABLE)" % (docs, len(ids) - len(never), len(ids), len(never) - len(real)))
for i in never:
    print("  never fired: %s%s" % (i, "  (" + UNREACHABLE[i] + ")" if i in UNREACHABLE else ""))
sys.exit(1 if real else 0)
