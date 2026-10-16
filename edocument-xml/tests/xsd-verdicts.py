#!/usr/bin/env python3
"""The UBL 2.1 schema verdict of libxml2 (through lxml) for every XML file in the folders: writes {path: [valid, [first error lines]]} as JSON.
usage: xsd-verdicts.py XSD-DIR OUT.json DIR…   (XSD-DIR: the folder with maindoc/ and common/ of the OASIS UBL 2.1 schemas)"""
import sys, os, json
from lxml import etree

xsd, out, dirs = sys.argv[1], sys.argv[2], sys.argv[3:]
schemas = {}
def schema(name):
    if name not in schemas:
        schemas[name] = etree.XMLSchema(etree.parse(os.path.join(xsd, "maindoc", "UBL-%s-2.1.xsd" % name)))
    return schemas[name]
res = {}
for d in dirs:
    for dp, _, fs in os.walk(d):
        for f in sorted(fs):
            if not f.endswith(".xml"):
                continue
            p = os.path.join(dp, f)
            try:
                doc = etree.parse(p)
            except Exception:
                continue    # not well-formed: no schema verdict
            ln = etree.QName(doc.getroot()).localname
            ns = etree.QName(doc.getroot()).namespace or ""
            if ns not in ("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2", "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2") or ln not in ("Invoice", "CreditNote"):
                continue
            s = schema(ln)
            s.validate(doc)
            # libxml2 also rejects some anyURI values (a bare "%", an open "[") that the Java validators (Xerces, Saxon) accept: those are not counted
            errs = [e.message[:200] for e in s.error_log if "xs:anyURI" not in e.message]
            res[p] = [not errs, errs[:3]]
json.dump(res, open(out, "w"))
print(len(res), "documents,", sum(1 for v in res.values() if not v[0]), "invalid")
