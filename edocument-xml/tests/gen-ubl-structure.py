#!/usr/bin/env python3
"""Builds ../rules/ubl-structure.js from the official EN 16931 UBL validation stylesheet:
the UBL-CR (element not used by the syntax binding), UBL-DT (data type) and UBL-SR (cardinality) rules.
Usage: gen-ubl-structure.py path/to/EN16931-UBL-validation.xslt"""
import re, sys, json, html
X = open(sys.argv[1], encoding="utf-8").read()
texts, cr, dt = {}, [], []
for m in re.finditer(r'name="id">((?:UBL-CR|UBL-DT|UBL-SR)-\d+)<', X):
    rid = m.group(1); i = m.start(); seg = X[:i]
    j = max(seg.rfind("<xsl:when test="), seg.rfind("<xsl:if test="))
    test = html.unescape(re.search(r'test="([^"]*)"', seg[j:j + 3000]).group(1))
    t = re.search(r"<svrl:text>(.*?)</svrl:text>", X[i:i + 1500], re.S).group(1)
    t = re.sub(r"\s+", " ", html.unescape(t)).strip()
    t = re.sub(r"^\[[^\]]*\]-", "", t)
    texts[rid] = t
    if rid.startswith("UBL-CR"):
        s = test.replace("(cac:InvoiceLine|cac:CreditNoteLine)", "LINE")
        mm = re.fullmatch(r"not\(((?://)?[A-Za-z0-9:/@_]+)\)", s)
        if mm:
            p = re.sub(r"\b(?:cac|cbc|ext|cn|ubl):", "", mm.group(1))
            cr.append([rid, p])
    elif rid.startswith("UBL-DT") and rid not in ("UBL-DT-01", "UBL-DT-06", "UBL-DT-07", "UBL-DT-18"):
        mm = re.fullmatch(r"not\(//@(\w+)\)", test)
        if mm: dt.append([rid, mm.group(1)])
body = open(__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)), "ubl-structure.tmpl.js"), encoding="utf-8").read()
out = body.replace("/*TEXTS*/", json.dumps(texts, ensure_ascii=False, indent=0)).replace("/*CR*/", json.dumps(cr)).replace("/*DT*/", json.dumps(dt))
open(__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)), "..", "rules", "ubl-structure.js"), "w", encoding="utf-8").write(out)
print(len(texts), "texts", len(cr), "CR paths", len(dt), "DT attrs")
