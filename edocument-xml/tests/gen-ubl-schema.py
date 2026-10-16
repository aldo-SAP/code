#!/usr/bin/env python3
"""Generates ../rules/ubl-schema-data.js from the OASIS UBL 2.1 schemas (xsd/maindoc/UBL-Invoice-2.1.xsd and UBL-CreditNote-2.1.xsd with the common components they import):
the content model of every element the invoice and the credit note can contain (the elements in their order and how often), and the simple types of the leaf
elements (their XML Schema base type and attributes). The viewer checks a document against that model before the business rules (rules/ubl-schema.js walks a document with it).

usage: gen-ubl-schema.py XSD-DIR [OUT.js]    (XSD-DIR holds maindoc/ and common/: tests/.cache/ubl-xsd; OUT.js defaults to ../rules/ubl-schema-data.js)
"""
import sys, os, json
from lxml import etree

X = "{http://www.w3.org/2001/XMLSchema}"
src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rules", "ubl-schema-data.js")

# ---- read every schema file once: global elements, complex types, in one table keyed by (namespace, local name)
elems, ctypes = {}, {}      # (ns, local) -> element node / complexType node
nsmap_of = {}               # node -> nsmap of its schema file
seen = set()
def load(path):
    path = os.path.normpath(path)
    if path in seen:
        return
    seen.add(path)
    root = etree.parse(path).getroot()
    tns = root.get("targetNamespace")
    for e in root.findall(X + "element"):
        elems[(tns, e.get("name"))] = (e, root.nsmap, tns)
    for c in root.findall(X + "complexType"):
        ctypes[(tns, c.get("name"))] = (c, root.nsmap, tns)
    for imp in root.findall(X + "import") + root.findall(X + "include"):
        loc = imp.get("schemaLocation")
        if loc and not loc.startswith("http"):
            p = os.path.join(os.path.dirname(path), loc)
            if os.path.exists(p):
                load(p)

roots = {}
for name in ("Invoice", "CreditNote"):
    p = os.path.join(src, "maindoc", "UBL-%s-2.1.xsd" % name)
    load(p)
    r = etree.parse(p).getroot()
    roots[(r.get("targetNamespace"), name)] = True

def qname(value, nsmap, tns):
    """'cbc:ID' or 'InvoiceType' -> (namespace, local)"""
    if ":" in value:
        pfx, local = value.split(":", 1)
        return (nsmap[pfx], local)
    return (nsmap.get(None) or tns, local if False else value)

BUILTIN = "http://www.w3.org/2001/XMLSchema"

def simple_of(tkey):
    """Follows simpleContent extension/restriction down to an XML Schema type: (base, {attribute: (type, required)})."""
    node, nsmap, tns = ctypes[tkey]
    sc = node.find(X + "simpleContent")
    d = sc[0] if sc is not None else None
    if d is None:
        raise ValueError("not a simple-content type: %s" % (tkey,))
    base = qname(d.get("base"), nsmap, tns)
    if base[0] == BUILTIN:
        bt, attrs = base[1], {}
    else:
        bt, attrs = simple_of(base)
    for a in d.findall(X + "attribute"):
        t = a.get("type")
        atype = qname(t, nsmap, tns)[1] if t else "string"
        attrs[a.get("name")] = (atype, a.get("use") == "required")
    return bt, attrs

types, tid = {}, {}     # tid: type key -> id
def type_id(tkey):
    if tkey in tid:
        return tid[tkey]
    node, nsmap, tns = ctypes[tkey]
    n = "t%d" % len(tid)
    tid[tkey] = n
    if node.find(X + "simpleContent") is not None:
        bt, attrs = simple_of(tkey)
        types[n] = {"s": bt, "a": {k: [v[0], 1 if v[1] else 0] for k, v in sorted(attrs.items())}}
    else:
        seq = node.find(X + "sequence")
        parts = []
        for p in (seq if seq is not None else []):
            ln = etree.QName(p).localname
            if ln == "annotation":
                continue
            mn = int(p.get("minOccurs", "1"))
            mx = p.get("maxOccurs", "1")
            mx = -1 if mx == "unbounded" else int(mx)
            if ln == "element":
                if p.get("ref"):
                    key = qname(p.get("ref"), nsmap, tns)
                else:
                    key = (tns, p.get("name"))
                    elems[key] = (p, nsmap, tns)
                parts.append(["%s|%s" % key, mn, mx])
            elif ln == "any":
                parts.append(["*", mn, mx])
            else:
                raise ValueError("%s in a content model is not handled" % ln)
        if node.find(X + "choice") is not None or node.find(X + "all") is not None:
            raise ValueError("choice/all is not handled: %s" % (tkey,))
        types[n] = {"c": parts}
    return n

eltype = {}
def element_type(key):
    if key in eltype:
        return
    e, nsmap, tns = elems[key]
    eltype[key] = None
    t = e.get("type")
    tk = qname(t, nsmap, tns)
    eltype[key] = type_id(tk)
    for p in types[eltype[key]].get("c", []):
        if p[0] != "*":
            ns, local = p[0].split("|", 1)
            element_type((ns, local))

rootmap = {}
for (ns, name) in roots:
    element_type((ns, name))
    rootmap["%s|%s" % (ns, name)] = eltype[(ns, name)]

data = {
    "version": "OASIS UBL 2.1 (os-UBL-2.1) as shipped in the KoSIT XRechnung validator configuration",
    "roots": rootmap,
    "elems": {"%s|%s" % k: v for k, v in sorted(eltype.items())},
    "types": types,
}
with open(out, "w") as f:
    f.write("/* The content model of a UBL 2.1 invoice and credit note, from the OASIS schemas; generated by tests/gen-ubl-schema.py - do not edit. */\n")
    f.write("window.UBL_SCHEMA = " + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n")
print(len(eltype), "elements,", len(types), "types ->", os.path.getsize(out), "bytes")
