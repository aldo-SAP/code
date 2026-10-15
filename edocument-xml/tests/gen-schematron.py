#!/usr/bin/env python3
"""Generates ../countries/de/xrechnung-rules.js from the official XRechnung schematron (KoSIT) merged with the Peppol rules it integrates.

usage: gen-xrechnung.py MERGED.sch OUT.js "version text"
MERGED.sch is the XRechnung UBL schematron after the official build step that merges the whitelisted Peppol rules in (peppol-into-xr.xsl),
with its includes and abstract rules expanded (tests/fetch-artefacts.sh makes it). Every assert is written out exactly as published;
global variables (schema and pattern `let`), the variables of a rule and the patterns active in the phase are kept, so lib/schematron.js can run them.
Messages: the leading "[id]" is dropped, <name/> becomes \\u0001 and <value-of select="x"/> becomes \\u0002x\\u0003.
"""
import sys, json, re
from lxml import etree

src, out, glob, version = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
opts = dict(a[2:].split("=", 1) for a in sys.argv[5:] if a.startswith("--"))
only = set(open(opts["only"]).read().split()) if "only" in opts else None
S = "{http://purl.oclc.org/dsdl/schematron}"
root = etree.parse(src).getroot()


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def message(a):
    parts = [a.text or ""]
    for ch in a:
        if not isinstance(ch.tag, str):          # a comment: its text is not part of the message, what follows it is
            parts.append(ch.tail or "")
            continue
        if ch.tag == S + "name":
            parts.append("\u0001")
        elif ch.tag == S + "value-of":
            parts.append("\u0002" + ch.get("select") + "\u0003")
        else:
            raise SystemExit("unexpected element in an assert message: " + etree.tostring(ch).decode()[:100])
        parts.append(ch.tail or "")
    return norm("".join(parts))


def clean_message(a):
    # the official text starts with its own id ("[BR-DE-1] …", "[BR-FR-01/BT-1] : …", "BR-FR-BD-14 : …"); the viewer shows the id next to the text
    m = message(a)
    m = re.sub(r"^\[[^\]]*\]\s*[-:]?\s*", "", m)                 # [BR-DE-1] …  [BR-FR-01/BT-1] : …
    m = re.sub(r"^\[?[A-Za-z0-9/_.-]+(?:\]|\s)\s*:\s*(?=\S)", "", m) if re.match(r"^\[?BR-[A-Za-z0-9/_.-]+(?:\]|\s)\s*:", m) else m   # sources with a missing bracket
    return re.sub(r"^" + re.escape(a.get("id")) + r"\s*:\s*", "", m)


X = "{http://www.w3.org/1999/XSL/Transform}"
def xexpr(e):
    # names with a prefix ($custom:codes) become plain names inside a function body
    return re.sub(r"\$([A-Za-z_][\w.-]*):(?=[A-Za-z_])", r"$\1__", norm(e))


def function(f):
    params, vars_, body = [], [], None
    for ch in f:
        if not isinstance(ch.tag, str):
            continue
        if ch.tag == X + "param":
            params.append([ch.get("name"), ch.get("as") or "item()*"])
        elif ch.tag == X + "variable":
            vars_.append([ch.get("name").replace(":", "__"), xexpr(ch.get("select"))])
        elif ch.tag == X + "sequence" and body is None:
            body = xexpr(ch.get("select"))
        else:
            raise SystemExit("unsupported xsl:function " + f.get("name"))
    return {"name": f.get("name"), "params": params, "ret": f.get("as") or "xs:boolean", "vars": vars_, "body": body}


# the patterns active in the phase (all of them when there is no phase)
phase = root.find(S + "phase")
active = [x.get("pattern") for x in phase.findall(S + "active")] if phase is not None and "allpatterns" not in opts else None
lets, patterns, ids = [], [], []
for el in root:
    if el.tag == S + "let":
        lets.append([el.get("name"), norm(el.get("value"))])
    elif el.tag == S + "pattern":
        if active is not None and el.get("id") not in active:
            continue
        rules = []
        for r in el.findall(S + "rule"):
            if r.get("abstract") == "true":
                raise SystemExit("abstract rule left in " + el.get("id"))
            asserts = []
            for a in r:
                if not isinstance(a.tag, str):
                    continue
                if a.tag == S + "assert":
                    if only is None or a.get("id") in only:
                        asserts.append([a.get("id"), norm(a.get("test")), clean_message(a), a.get("flag") or "fatal"])
                elif a.tag == S + "report":
                    raise SystemExit("report in " + el.get("id"))
                elif a.tag != S + "let":
                    raise SystemExit("unexpected " + str(a.tag))
            rules.append({"c": norm(r.get("context")), "l": [[l.get("name"), norm(l.get("value"))] for l in r.findall(S + "let")], "a": asserts})
            ids += [x[0] for x in asserts]
        plets = [[l.get("name"), norm(l.get("value"))] for l in el.findall(S + "let")]
        lets += plets            # the compiled stylesheets make the variables of a pattern global (other patterns use them)
        if any(r["a"] for r in rules):
            for r in rules:
                if not r["a"]:
                    r["l"] = []          # a rule without asserts only keeps its context (it still takes its nodes away from the rules after it)
            while not rules[-1]["a"]:
                rules.pop()              # nothing comes after: it would take nodes from no one
            patterns.append({"id": el.get("id"), "r": rules})
if len(ids) != len(set(ids)):
    raise SystemExit("duplicate assert ids: " + str([i for i in ids if ids.count(i) > 1]))
ns = {n.get("prefix"): n.get("uri") for n in root.findall(S + "ns")}
fns = [function(f) for f in root.iter(X + "function") if f.get("name") and f.get("name").split(":")[0] not in ("u",)]
data = {"version": version, "ns": ns, "lets": lets, "patterns": patterns}
if fns:
    data["fns"] = fns
js = "/* An official Schematron as data for lib/schematron.js (" + version + "); generated by tests/gen-schematron.py - do not edit. */\nwindow." + glob + " = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(out, "w", encoding="utf-8").write(js)
print("%d asserts in %d patterns, %d global lets, %d functions -> %s" % (len(ids), len(patterns), len(lets), len(fns), out))
