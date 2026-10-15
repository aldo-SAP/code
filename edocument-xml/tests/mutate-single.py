#!/usr/bin/env python3
"""Systematic single-change mutants of the official example invoices of a profile (--profile=ae|de), to exercise every rule.

usage: mutate-single.py OUTDIR SRCDIR [--profile=ae] [--rate=0.3] [--seed=1] [--log=FILE]

Where mutate.py breaks documents at random, this one walks every element and attribute of every example and changes it in one way at a time:
deleted, duplicated, emptied, and set to values of the kind it holds (dates, amounts, codes, identifiers, flags). Each variant is kept with the
probability --rate (default 0.3), so the set stays a few thousand documents; --rate=1 keeps them all. The changes made are written to the log
(OUTDIR/../mutlog-single.json by default) next to the document names, so a difference can be reproduced.
"""
import sys, os, json, random, copy
from lxml import etree

out, src = sys.argv[1], sys.argv[2]
opt = {a.split("=")[0][2:]: a.split("=")[1] for a in sys.argv[3:] if a.startswith("--") and "=" in a}
rate, seed = float(opt.get("rate", 0.3)), int(opt.get("seed", 1))
profile = opt.get("profile", "ae")
logfile = opt.get("log", os.path.join(os.path.dirname(os.path.abspath(out)), "mutlog-single.json"))
rnd = random.Random(seed)
os.makedirs(out, exist_ok=True)

DATES = ["", "X", "2020-01-01", "2099-12-31", "2026-02-30", "20260101", "2026-1-1"]
NUMS = ["", "X", "0", "-1", "1", "0.001", "1000000", "12.345", "100.00"]
FLAGS = ["", "X", "true", "false", "00000000", "10000000", "00000001", "11111111", "01010101", "1000000"]
CODES = ["", "X", "XX", "AE", "AED", "USD", "380", "381", "389", "480", "81", "S", "Z", "E", "O", "AE", "VAT", "130", "50", "C62", "H87", "XUN", "FREE", "TIN", "PAS", "TL", "0235", "0088", "0060", "0230", "9999",
         "application/pdf", "text/csv", "image/png", "95", "ABL", "SMI", "VATEX-AE-DS", "VAT-ZR", "EXEMPT", "ZEROD", "4 digits", "DR", "OTH"]
IDS = ["", " ", "X", "0", "1", "123456789012345", "100000000000003", "ABC 123", "1234567890123", "AE", "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"]
# (the billing and self-billing identifiers are left out: the official stylesheets are run per variant, so swapping one for the other would not compare like with like)
TEXTS = ["", " ", "X", "x" * 300, "Ünïcode", "a\nb"]


if profile == "de":
    # XRechnung: BR-DE rules look at contact data, the Skonto text, identifier schemes, VAT categories, CVD vehicle data
    CODES += ["0204", "0088", "0060", "XR01", "XR02", "XR03", "CVD", "K", "G", "L", "M", "S", "Z", "E", "AE", "42", "58", "59", "49", "30", "ZZZ", "DE", "FR", "GR", "EL", "cva",
              "M1", "N3", "clean", "zero-emission", "other", "VAT", "AAA", "application/xml", "text/plain", "326", "384", "875", "876", "877", "389", "InvoiceTypeCode", "EM", "SEPA"]
    IDS += ["04011000-12345-34", "991-01234-44", "DE123456789", "DE89370400440532013000", "DE89370400440532013001", "abc@example.de", "not-an-email", "+49 30 1234567", "12", "http://example.de/x", "mailto:a@b.de"]
    TEXTS += ["#SKONTO#TAGE=14#PROZENT=2.00#", "#SKONTO#TAGE=14#PROZENT=2.00#BASISBETRAG=100.00#", "#SKONTO#TAGE=14#PROZENT=2#", "#VERZUG#TAGE=14#PROZENT=2.00#", "cva", "a@b.de", "Eine Notiz"]
    CUSTOM = ["urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0", "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0",
              "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#compliant#urn:xeinkauf.de:kosit:xrechnung:cvd_0.9", "urn:cen.eu:en16931:2017"]
    IDS += CUSTOM


def pool(tag, text):
    t = tag.lower()
    if "date" in t:
        return DATES
    if any(k in t for k in ("amount", "percent", "quantity", "multiplier", "rate", "factor", "numeric", "measure")):
        return NUMS
    if t in ("profileexecutionid",):
        return FLAGS
    if "code" in t:
        return CODES
    if t in ("id", "customizationid", "profileid", "endpointid", "companyid", "taxlevelcode", "line", "registrationname"):
        return IDS
    return TEXTS + CODES[:6]


def attr_pool(name):
    n = name.lower()
    if n == "currencyid":
        return ["", "X", "USD", "AED", "EUR"]
    if n in ("schemeid", "listid", "schemeagencyid", "schemeagencyname", "mimecode", "unitcode", "listagencyid", "listversionid", "name", "filename"):
        return ["", "X", "0235", "0088", "0060", "PAS", "TL", "TIN", "AE", "C62", "XUN", "application/pdf", "text/csv", "UN/ECE", "4"]
    return ["", "X"]


def path_of(e):
    return etree.QName(e).localname + "[" + str(len([s for s in e.itersiblings(preceding=True) if s.tag == e.tag]) + 1) + "]"


def label(e):
    p = []
    while e is not None and e.getparent() is not None:
        p.append(path_of(e)); e = e.getparent()
    return "/" + etree.QName(e).localname + "/" + "/".join(reversed(p))


log, n = {}, 0
for name in sorted(f for f in os.listdir(src) if f.lower().endswith(".xml")):
    base = etree.parse(os.path.join(src, name))
    elements = [e for e in base.getroot().iter() if isinstance(e.tag, str)][1:]
    for idx, _ in enumerate(elements):
        variants = []
        e0 = elements[idx]
        variants.append(("delete", None))
        variants.append(("duplicate", None))
        if len(e0) == 0:
            for v in pool(etree.QName(e0).localname, e0.text):
                if (e0.text or "") != v:
                    variants.append(("text", v))
        for a in list(e0.attrib):
            variants.append(("delattr", a))
            for v in attr_pool(etree.QName(a).localname if a.startswith("{") else a):
                if e0.get(a) != v:
                    variants.append(("attr", (a, v)))
        for kind, arg in variants:
            if rnd.random() > rate:
                continue
            doc = copy.deepcopy(base)
            els = [e for e in doc.getroot().iter() if isinstance(e.tag, str)][1:]
            e = els[idx]
            lab = label(e)
            if kind == "delete":
                e.getparent().remove(e); d = "delete " + lab
            elif kind == "duplicate":
                e.addnext(copy.deepcopy(e)); d = "duplicate " + lab
            elif kind == "text":
                e.text = arg; d = "set %s to %r" % (lab, arg[:30])
            elif kind == "delattr":
                del e.attrib[arg]; d = "delete @%s of %s" % (arg, lab)
            else:
                e.set(arg[0], arg[1]); d = "set @%s of %s to %r" % (arg[0], lab, arg[1])
            n += 1
            fn = "s%05d_%s" % (n, name.replace(" ", "_"))
            doc.write(os.path.join(out, fn), xml_declaration=True, encoding="UTF-8")
            log[fn] = [d]
json.dump(log, open(logfile, "w"))
print("%d mutants of %d documents in %s (log %s)" % (n, len([f for f in os.listdir(src) if f.lower().endswith('.xml')]), out, logfile))
