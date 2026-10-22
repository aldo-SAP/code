#!/usr/bin/env python3
"""Generates ../notices.html (the page the viewer links to) from ../THIRD-PARTY-NOTICES.md: headings, paragraphs, bullet lists, tables, `code` and [links](url)."""
import re, html, os
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = open(os.path.join(root, "THIRD-PARTY-NOTICES.md"), encoding="utf-8").read().split("\n")
def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2" rel="noopener">\1</a>', t)
    t = re.sub(r"(?<![\"'>=])(https://[^\s,)<]+[^\s,).<])", r'<a href="\1" rel="noopener">\1</a>', t)
    return t
out, i = [], 0
while i < len(src):
    l = src[i]
    if l.startswith("# "): out.append("<h1>%s</h1>" % inline(l[2:]))
    elif l.startswith("## "): out.append("<h2>%s</h2>" % inline(l[3:]))
    elif l.startswith("|"):
        rows = []
        while i < len(src) and src[i].startswith("|"):
            if not re.match(r"^\|[-| ]+\|$", src[i]): rows.append([c.strip() for c in src[i].strip("|").split("|")])
            i += 1
        out.append('<div class="tw"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % ("".join("<th>%s</th>" % inline(c) for c in rows[0]), "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r) for r in rows[1:])))
        continue
    elif l.startswith("- "):
        items = []
        while i < len(src) and (src[i].startswith("- ") or src[i].startswith("  ")):
            if src[i].startswith("- "): items.append(src[i][2:])
            else: items[-1] += " " + src[i].strip()
            i += 1
        out.append("<ul>%s</ul>" % "".join("<li>%s</li>" % inline(x) for x in items))
        continue
    elif l.strip():
        para = [l]
        while i + 1 < len(src) and src[i + 1].strip() and not re.match(r"^(#|\||- )", src[i + 1]): i += 1; para.append(src[i])
        out.append("<p>%s</p>" % inline(" ".join(para)))
    i += 1
page = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sources and licences - eDocument XML Viewer</title>
<link rel="icon" href="icons/icon-192.png">
<style>
:root{--bg:#f1efe9;--ink:#1d1f23;--muted:#5b616b;--line:#dcd8cd;--paper:#fff;--accent:#0b5cad}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--ink:#e8eaee;--muted:#9aa1ac;--line:#2d333c;--paper:#1c2027;--accent:#6fb1ff}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:20px max(16px,env(safe-area-inset-left,0px))}
main{max-width:980px;margin:0 auto}
h1{font-size:1.5rem;margin:0 0 .6em}h2{font-size:1.05rem;margin:1.6em 0 .5em}
p,li{max-width:80ch}a{color:var(--accent)}code{font-size:.85em;background:var(--paper);padding:1px 5px;border-radius:4px;border:1px solid var(--line)}
.tw{overflow-x:auto}table{border-collapse:collapse;background:var(--paper);font-size:.9rem;min-width:640px}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600}
nav a{font-size:.9rem}
</style></head><body><main>
<nav><a href="index.html">&larr; Back to the viewer</a></nav>
%s
</main></body></html>
""" % "\n".join(out)
open(os.path.join(root, "notices.html"), "w", encoding="utf-8").write(page)
print("notices.html", len(page), "bytes")
