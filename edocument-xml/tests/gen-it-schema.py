#!/usr/bin/env python3
"""Generates ../rules/it-schema-data.js from the XML schemas of the Italian electronic invoice (FatturaPA): Schema_VFPA12_V1.2.3.xsd (the ordinary invoice, to public
administration and to private parties; the private-parties schema Schema_VFPR12_v1.2.3.xsd is the same file) and Schema_VFSM10v_1.0.2.xsd (the simplified invoice). It holds
the content model of every element (the elements in their order, the alternatives, how often) and the simple types of the leaf elements (base type, patterns, list of
values, lengths, ranges), and the schemas' own description of each coded value (Italian). rules/it-schema.js walks a document with it.

usage: gen-it-schema.py OUT.js XSD-FILE…     (default OUT.js: ../rules/it-schema-data.js)
"""
import sys, os, json, hashlib
from lxml import etree

X = "{http://www.w3.org/2001/XMLSchema}"
out = sys.argv[1]
sources = sys.argv[2:]

types, labels, roots, versions, namespaces = {}, {}, {}, [], []

def occ(n):
    mn = int(n.get("minOccurs", "1")); mx = n.get("maxOccurs", "1")
    return mn, (-1 if mx == "unbounded" else int(mx))

def load(src, pfx):
    root = etree.parse(src).getroot()
    tns = root.get("targetNamespace")
    ctypes = {c.get("name"): c for c in root.findall(X + "complexType")}
    stypes = {s.get("name"): s for s in root.findall(X + "simpleType")}
    globals_ = {e.get("name"): e for e in root.findall(X + "element")}
    simple_cache, type_labels, tid = {}, {}, {}

    def simple(name):
        """the facets of a named simple type, merged down to its XML Schema base type"""
        if name in simple_cache:
            return simple_cache[name]
        r = stypes[name].find(X + "restriction")
        base = r.get("base")
        d = {"b": base[3:]} if base.startswith("xs:") else json.loads(json.dumps(simple(base)))
        pats, enums = [], []
        for f in r:
            if not isinstance(f.tag, str): continue
            ln = etree.QName(f).localname
            v = f.get("value")
            if ln == "pattern": pats.append(v)
            elif ln == "enumeration":
                enums.append(v)
                doc = f.find(".//" + X + "documentation")
                if doc is not None and doc.text and doc.text.strip():
                    type_labels.setdefault(name, {})[v] = " ".join(doc.text.split())
            elif ln == "length": d["len"] = int(v)
            elif ln == "minLength": d["min"] = int(v)
            elif ln == "maxLength": d["max"] = int(v)
            elif ln == "minInclusive": d["lo"] = v
            elif ln == "maxInclusive": d["hi"] = v
            elif ln == "whiteSpace": d["ws"] = v
            elif ln == "annotation": pass
            else: raise ValueError("facet %s is not handled (%s)" % (ln, name))
        if pats: d.setdefault("p", []).append(pats)      # every level must match; the patterns of one level are alternatives
        if enums: d["e"] = enums
        simple_cache[name] = d
        return d

    def type_id(name):
        if name in tid:
            return tid[name]
        n = "%s%d" % (pfx, len(tid))
        tid[name] = n
        if name.startswith("xs:"):
            types[n] = {"v": {"b": name[3:]}}
        elif name in stypes:
            types[n] = {"v": simple(name)}
        else:
            c = ctypes[name]
            attrs = {}
            for a in c.findall(X + "attribute"):
                attrs[a.get("name")] = [type_id(a.get("type")), 1 if a.get("use") == "required" else 0]
            types[n] = {"m": model(c.find(X + "sequence"))}
            if attrs: types[n]["a"] = attrs
        return n

    def model(node):
        ln = etree.QName(node).localname
        mn, mx = occ(node)
        if ln == "element":
            if node.get("ref"):
                return ["x", node.get("ref"), mn, mx]       # ds:Signature: not looked into
            t = node.get("type")
            i = type_id(t)
            if t in type_labels:
                labels.setdefault(node.get("name"), {}).update(type_labels[t])
            return ["e", node.get("name"), i, mn, mx] + ([1] if node.get("default") is not None else [])     # a default: an empty element reads as the default
        kids = [model(k) for k in node if isinstance(k.tag, str) and etree.QName(k).localname != "annotation"]
        if ln in ("sequence", "choice"):
            return ["s" if ln == "sequence" else "c", kids, mn, mx]
        raise ValueError(ln)

    for name, e in globals_.items():
        roots[tns + "|" + name] = type_id(e.get("type"))
    namespaces.append(tns)
    versions.append("%s (%s) sha256 %s" % (os.path.basename(src), root.get("version"), hashlib.sha256(open(src, "rb").read()).hexdigest()[:16]))

for i, src in enumerate(sources):
    load(src, "ab"[i])

data = {"version": "FatturaPA XML schemas: " + "; ".join(versions), "ns": namespaces, "roots": roots, "types": types, "labels": labels}
with open(out, "w") as f:
    f.write("/* The content model of an Italian electronic invoice (FatturaPA), from its XML schemas; generated by tests/gen-it-schema.py - do not edit. */\n")
    f.write("window.IT_SCHEMA = " + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n")
print(len(types), "types,", len(roots), "root(s) ->", os.path.getsize(out), "bytes")
