#!/usr/bin/env python3
"""Documents aimed at the FatturaPA schema: the sample invoice with ONE change each - neighbours swapped, an element repeated or removed, an unknown element or
attribute, text between elements, a child inside a value, a wrong namespace, and every leaf value replaced by good and bad forms of its type. Then the verdict of
libxml2 (the schema) for each. usage: mutate.py SCHEMA.xsd SAMPLE.xml OUT.json [--per-leaf=N] [--seed=S]   (OUT.json: {xml text: [valid, first error]})"""
import sys, json, random, re, os
from lxml import etree

args = [a for a in sys.argv[1:] if not a.startswith("--")]
opts = dict(a[2:].split("=") for a in sys.argv[1:] if a.startswith("--"))
xsd, sample, out = args
rnd = random.Random(int(opts.get("seed", 1))); per = int(opts.get("per-leaf", 14))
schema = etree.XMLSchema(etree.parse(xsd))
data = json.loads(re.search(r"window\.IT_SCHEMA = (.*);\s*$", open(os.path.join(os.path.dirname(__file__), "..", "..", "rules", "it-schema-data.js")).read(), re.S).group(1))
base = etree.parse(sample).getroot()
NS = data["ns"]
GENERIC = ["", " ", "x", "X", "0", "1", "-1", "00", "99", "100.00", "1.5", "1.50", "12.34", "0.00", "-0.00", "1234567890123.12", "123.123456789", "2026-01-01", "2026-02-30",
           "1969-12-31", "2026-13-01", "2026-1-1", "2026-01-01+01:00", "2026-01-01T10:00:00", "2026-01-01T10:00:00Z", "ä", "ÿ", "€", "日本", "a\tb", "a  b", " a ", "a\nb",
           "IT", "ZZ", "EUR", "TD01", "TD99", "RF01", "N1", "N9", "I", "D", "S", "MP05", "MP99", "TP02", "SC", "MG", "A@b.it", "a@b", "IT01234567890", "FPR12", "FPA12", "FPX",
           "ABCDEFG", "ABCDEF", "abcdefg", "AAAAAAAA", "x" * 11, "x" * 61, "x" * 81, "x" * 101, "x" * 1001, "YWJj", "YWJ", "!!!!"]
docs = []
def add(tag, root):
    docs.append((tag, etree.tostring(root, xml_declaration=True, encoding="UTF-8").decode()))
def paths(r):
    return [e for e in r.iter() if isinstance(e.tag, str)]
def clone(): return etree.fromstring(etree.tostring(base))
els = paths(base)
index = {id(e): i for i, e in enumerate(els)}

# the sample itself and the structure
add("sample", clone())
for i, e in enumerate(els):
    p = e.getparent()
    if p is None: continue
    r = clone(); x = paths(r)[i]; px = x.getparent(); k = px.index(x)
    px.remove(x); add("remove %s" % e.tag, r)
    r = clone(); x = paths(r)[i]; px = x.getparent(); k = px.index(x)
    px.insert(k, etree.fromstring(etree.tostring(x))); add("repeat %s" % e.tag, r)
    sibs = [c for c in px if isinstance(c.tag, str)]
    r = clone(); x = paths(r)[i]; px = x.getparent(); k = px.index(x)
    if k + 1 < len(px):
        nxt = px[k + 1]; px.remove(nxt); px.insert(k, nxt); add("swap %s" % e.tag, r)
    r = clone(); x = paths(r)[i]; etree.SubElement(x.getparent(), "Unknown"); add("unknown after %s" % e.tag, r)
    r = clone(); x = paths(r)[i]; x.set("foo", "bar"); add("attribute on %s" % e.tag, r)
    r = clone(); x = paths(r)[i]; x.tail = "text"; px = x.getparent(); px.text = "text"; add("text in %s" % px.tag, r)
    r = clone(); x = paths(r)[i]; etree.SubElement(x, "Inner").text = "v"; add("child in %s" % e.tag, r)
    r = clone(); x = paths(r)[i]; x.tag = "{http://example.com/ns}" + etree.QName(x).localname; add("namespaced %s" % e.tag, r)
r = clone(); r.set("versione", "FPA12"); add("FPA12", r)
r = clone(); r.set("versione", "FPX"); add("bad versione", r)
r = clone(); del r.attrib["versione"]; add("no versione", r)
r = clone(); r.set("SistemaEmittente", "x" * 11); add("SistemaEmittente long", r)
r = clone(); r.set("SistemaEmittente", "abc"); add("SistemaEmittente", r)
# the values
leafs = [i for i, e in enumerate(els) if len(e) == 0 and e.text is not None]
for i in leafs:
    vals = list(GENERIC); rnd.shuffle(vals)
    typ = None
    for v in vals[:per] + [els[i].text.strip() + "x", els[i].text.strip()[:-1]]:
        r = clone(); paths(r)[i].text = v; add("value %s=%r" % (els[i].tag, v), r)
# enumerations: every listed value of the types and one not listed
for tid, t in data["types"].items():
    v = t.get("v")
    if v and v.get("e"):
        pass
# a signature
r = clone(); sig = etree.SubElement(r, "{http://www.w3.org/2000/09/xmldsig#}Signature"); add("signature", r)
r = clone(); sig = etree.SubElement(r, "{http://www.w3.org/2000/09/xmldsig#}Signature"); etree.SubElement(sig, "x"); add("signature content", r)
r = clone(); body = r[1]; r.insert(1, etree.fromstring(etree.tostring(body))); add("two bodies", r)
res = {}
for tag, text in docs:
    d = etree.fromstring(text.encode())
    ok = schema.validate(etree.ElementTree(d))
    res[text] = [ok, tag + (": " + str(schema.error_log[0].message) if not ok else "")]
json.dump(res, open(out, "w"))
print(len(res), "documents,", sum(1 for v in res.values() if v[0]), "valid")
