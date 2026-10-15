"""Shared by the hand-aimed test document generators (targeted-ae.py, targeted-de.py).

generate(cases, out, src, logfile, ns): every case is (name, example-name part, [edit, …]); an edit is one of
  ("del", xpath)  ("dup", xpath[, n])  ("set", xpath, text)  ("attr", xpath, name, value)  ("delattr", xpath, name)  ("add", parent-xpath, xml)
The named example is edited first; when its structure lacks a node the edit needs, the other examples are tried.
"""
import os, json, copy
from lxml import etree

NS = {"cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2", "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
      "ubl": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2", "cn": "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"}
WRAP = '<x xmlns:cac="%s" xmlns:cbc="%s">%%s</x>' % (NS["cac"], NS["cbc"])


def apply(doc, edit):
    kind, xp = edit[0], edit[1]
    nodes = doc.xpath(xp, namespaces=NS)
    if not nodes:
        raise LookupError("no node for " + xp)
    if kind == "del":
        for n in nodes:
            n.getparent().remove(n)
    elif kind == "dup":
        for _ in range(edit[2] if len(edit) > 2 else 1):
            nodes[0].addnext(copy.deepcopy(nodes[0]))
    elif kind == "set":
        nodes[0].text = edit[2]
    elif kind == "attr":
        nodes[0].set(edit[2], edit[3])
    elif kind == "delattr":
        nodes[0].attrib.pop(edit[2], None)
    elif kind == "add":
        for child in etree.fromstring(WRAP % edit[2]):
            nodes[0].append(child)
    else:
        raise ValueError(kind)


def generate(cases, out, src, logfile):
    os.makedirs(out, exist_ok=True)
    files = {f: os.path.join(src, f) for f in os.listdir(src) if f.lower().endswith(".xml")}
    log, n, skipped = {}, 0, []
    for name, base, edits in cases:
        # the named example first, then the others (the self-billing set has only a couple of documents)
        tries = [f for f in sorted(files) if base in f] + [f for f in sorted(files) if base not in f]
        doc, err = None, None
        for f in tries:
            d = etree.parse(files[f])
            try:
                for e in edits:
                    apply(d, e)
                doc = d; break
            except LookupError as e2:
                err = e2
        if doc is None:
            skipped.append(name + " (" + str(err) + ")"); continue
        n += 1
        fn = "t%04d_%s.xml" % (n, name)
        doc.write(os.path.join(out, fn), xml_declaration=True, encoding="UTF-8")
        log[fn] = ["%s: %s" % (name, " ; ".join(" ".join(str(x) for x in e)[:90] for e in edits))]
    json.dump(log, open(logfile, "w"))
    print("%d targeted documents in %s; skipped: %s" % (n, out, skipped or "none"))
