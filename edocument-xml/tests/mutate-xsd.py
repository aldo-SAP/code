#!/usr/bin/env python3
"""Documents aimed at the UBL 2.1 schema: from example invoices, each with ONE change of the kinds the schema is about - two neighbours swapped, an element
repeated or removed, an unknown element or attribute added, text between elements, a child inside a value, and every leaf value replaced by good and bad
forms of its type (numbers, dates, times, true/false, base64, languages …). The types come from rules/ubl-schema-data.js (the OASIS schemas).
usage: mutate-xsd.py OUTDIR EXAMPLE-DIR… [--per-doc=N] [--seed=S]"""
import sys, os, re, json, random
from lxml import etree

args = [a for a in sys.argv[1:] if not a.startswith("--")]
opts = dict(a[2:].split("=") for a in sys.argv[1:] if a.startswith("--"))
out, dirs = args[0], args[1:]
per_doc = int(opts.get("per-doc", 90)); rnd = random.Random(int(opts.get("seed", 1)))
data = json.loads(re.search(r"window\.UBL_SCHEMA = (.*);\s*$", open(os.path.join(os.path.dirname(__file__), "..", "rules", "ubl-schema-data.js")).read(), re.S).group(1))
os.makedirs(out, exist_ok=True)

VALUES = {
  "decimal": ["1", "-1", "+1", ".5", "5.", "1.50", "1e5", "1,5", "", " 12 ", "NaN", "0x10", "١٢", "1 000", "--1", "12.34.56"],
  "date": ["2026-02-28", "2024-02-29", "2026-02-29", "2026-13-01", "2026-00-10", "2026-1-1", "20261001", "2026-10-01Z", "2026-10-01+14:00", "2026-10-01+14:01", "2026-10-01+05:30", "2026-10-32", "0000-01-01", "12026-01-01", "-2026-01-01", ""],
  "time": ["12:00:00", "24:00:00", "24:00:01", "25:00:00", "12:00", "12:00:00.123", "12:00:00Z", "12:60:00", "12:00:60", "1:00:00", ""],
  "dateTime": ["2026-10-01T12:00:00", "2026-10-01T24:00:00", "2026-10-01 12:00:00", "2026-10-01T12:00", "2026-02-30T12:00:00", "2026-10-01T12:00:00Z", ""],
  "boolean": ["true", "false", "1", "0", "TRUE", "yes", "", "True"],
  "base64Binary": ["YWJj", "YWJjZA==", "YWJjZA=", "YW Jj", "YWJ", "!!!!", "", "YWJjZA==\n", "YQ=a"],
  "anyURI": ["http://example.com/a", "a b", "http://exa mple.com", "%zz", "%41", "ä", "http://a/%", "#frag", "mailto:a@b", "\\", "http://[::1", "http://[::1]/x", "urn:x:y", "a<b", "a|b", "{x}", "^", "http://a/b c", "relative/path", "?q=1", "x:y z", ""],
  "language": ["en", "en-GB", "x_y", "", "toolonglang1", "de-DE-1996"],
}
BAD_TEXT = "text between elements"

def local(e): return etree.QName(e).localname
def key(e): return "%s|%s" % (etree.QName(e).namespace or "", local(e))

def leafs(root):
    for e in root.iter():
        if not isinstance(e.tag, str): continue
        t = data["elems"].get(key(e))
        if t and "s" in data["types"][t]: yield e, data["types"][t]

n = 0
def save(doc, tag):
    global n
    n += 1
    doc.write(os.path.join(out, "x%05d_%s.xml" % (n, tag)), xml_declaration=True, encoding="UTF-8")

files = []
for d in dirs:
    for dp, _, fs in os.walk(d):
        files += [os.path.join(dp, f) for f in sorted(fs) if f.endswith(".xml")]
rnd.shuffle(files)
for f in files:
    try: base = etree.parse(f)
    except Exception: continue
    ns = etree.QName(base.getroot()).namespace or ""
    if not ns.endswith(":Invoice-2") and not ns.endswith(":CreditNote-2"): continue
    root = base.getroot()
    allel = [e for e in root.iter() if isinstance(e.tag, str)]
    edits = []
    # leaf values
    for e, T in leafs(root):
        for v in VALUES.get(T["s"], []):
            edits.append(("val_%s" % T["s"], etree.QName(e).localname, lambda r, p, v=v: setattr(r[p], "text", v)))
        for a, (at, req) in T.get("a", {}).items():
            if at in VALUES:
                for v in VALUES[at]:
                    edits.append(("attr_%s" % at, a, lambda r, p, a=a, v=v: r[p].set(a, v)))
            if req: edits.append(("delreq", a, lambda r, p, a=a: r[p].attrib.pop(a, None)))
        edits.append(("unkattr", "", lambda r, p: r[p].set("foo", "1")))
        edits.append(("child_in_value", "", lambda r, p: etree.SubElement(r[p], "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}Note")))
    # structure
    for e in allel:
        ks = [c for c in e if isinstance(c.tag, str)]
        if ks and not ("s" in (data["types"].get(data["elems"].get(key(e)), {}) or {})):
            edits.append(("text_in_elements", "", lambda r, p: setattr(r[p], "text", BAD_TEXT)))
            edits.append(("unknown_child", "", lambda r, p: etree.SubElement(r[p], "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}Nope")))
            edits.append(("unknown_ns_child", "", lambda r, p: etree.SubElement(r[p], "{urn:other}x")))
            edits.append(("unknown_attr", "", lambda r, p: r[p].set("foo", "x")))
            for i in range(len(ks) - 1):
                edits.append(("swap", "", lambda r, p, i=i: (lambda ks2: (ks2[i].addnext(ks2[i + 1]) if True else None))([c for c in r[p] if isinstance(c.tag, str)])))
            for i in range(len(ks)):
                edits.append(("dup", "", lambda r, p, i=i: (lambda c: c.addnext(__import__("copy").deepcopy(c)))([c for c in r[p] if isinstance(c.tag, str)][i])))
                edits.append(("del", "", lambda r, p, i=i: (lambda c: c.getparent().remove(c))([c for c in r[p] if isinstance(c.tag, str)][i])))
    rnd.shuffle(edits)
    for kind, name, fn in edits[:per_doc]:
        # the element to edit is found again in a fresh copy, by its position in document order
        doc = etree.ElementTree(etree.fromstring(etree.tostring(root)))
        r2 = list(doc.getroot().iter())
        # find the position: the edit closures index into r by p, so build the same element list
        el_list = [e for e in doc.getroot().iter() if isinstance(e.tag, str)]
        if kind.startswith(("val_", "attr_", "delreq", "unkattr", "child_in_value")):
            cands = [e for e, T in leafs(doc.getroot())]
        else:
            cands = [e for e in el_list if any(isinstance(c.tag, str) for c in e) and "s" not in (data["types"].get(data["elems"].get(key(e)), {}) or {})]
        if not cands: continue
        if kind.startswith(("val_", "attr_")):
            want = name
            cands = [e for e in cands if local(e) == name or name in e.attrib or kind.startswith("attr_")]
            if kind.startswith("attr_"): cands = [e for e in cands if name in (data["types"][data["elems"][key(e)]].get("a") or {})]
        if not cands: continue
        p = rnd.randrange(len(cands))
        try:
            fn({p: cands[p]}, p)
        except Exception:
            continue
        save(doc, kind)
print(n, "documents ->", out)
