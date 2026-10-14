#!/usr/bin/env python3
"""Writes random mutations of valid example invoices, to compare the rule engine with the official validator on broken documents.
usage: mutate.py OUTDIR COUNT SEED SOURCEDIR…   (needs python3-lxml)
Each mutant has one to three changes: an element deleted, duplicated, emptied or given a junk value, an attribute changed
or added, a number negated. OUTDIR.log.json maps every mutant to the changes made."""
import copy, glob, json, os, random, sys
from lxml import etree

out, count, seed, sources = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4:]
random.seed(seed)
os.makedirs(out, exist_ok=True)

docs = []
for d in sources:
    for f in sorted(glob.glob(d + "/*.xml") + glob.glob(d + "/*.XML")):
        try:
            tree = etree.parse(f)
        except Exception:
            continue
        if etree.QName(tree.getroot()).localname in ("Invoice", "CreditNote"):
            docs.append((f, tree))

JUNK = ["", "X", "-1", "0", "0.00", "9999.99", "2020-13-45", "2024-01-01", "EUR", "XXX", "S", "Z", "E", "AE", "K", "G", "O", "L", "M", "B", "FR", "DE", "IT",
        "false", "true", "380", "381", "389", "30", "58", "10", "20", "1", "5.5", "123456789", "FR12345678901",
        "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0", "0009", "0088", "0192", "VATEX-EU-O", "PDF"]
ATTRS = ["schemeID", "currencyID", "unitCode", "mimeCode", "name", "listID"]
log = []

def path(e):
    return "/".join(etree.QName(x).localname for x in reversed(list(e.iterancestors()))) + "/" + etree.QName(e).localname

def mutate(tree):
    root = tree.getroot()
    e = random.choice([x for x in root.iter() if isinstance(x.tag, str) and x is not root])
    kind = random.choice(["delete", "text", "text", "attr", "dup", "empty", "junkattr", "sign"])
    note = kind + " " + path(e) + " " + repr((e.text or "")[:30])
    if kind == "delete":
        e.getparent().remove(e)
    elif kind == "text" and len(e) == 0:
        e.text = random.choice(JUNK)
    elif kind == "empty" and len(e) == 0:
        e.text = None
    elif kind == "attr" and e.attrib:
        e.set(random.choice(list(e.attrib)), random.choice(JUNK))
    elif kind == "junkattr":
        e.set(random.choice(ATTRS), random.choice(JUNK))
    elif kind == "dup":
        e.getparent().insert(e.getparent().index(e) + 1, copy.deepcopy(e))
    elif kind == "sign" and len(e) == 0 and e.text and e.text.replace(".", "", 1).isdigit():
        e.text = "-" + e.text
    log.append(note + " => " + repr((e.text or "")[:30]) + " " + str(dict(e.attrib))[:80])

names = {}
for i in range(count):
    f, tree = random.choice(docs)
    copy_ = copy.deepcopy(tree)
    mark = len(log)
    for _ in range(random.choice([1, 1, 1, 2, 3])):
        mutate(copy_)
    name = "m%04d_%s" % (i, os.path.basename(f).replace(" ", "_"))
    copy_.write(os.path.join(out, name), encoding="utf-8", xml_declaration=True)
    names[name] = log[mark:]
json.dump(names, open(out.rstrip("/") + ".log.json", "w"))
print(count, "mutants of", len(docs), "documents in", out)
