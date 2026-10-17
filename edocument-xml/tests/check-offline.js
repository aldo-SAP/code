#!/usr/bin/env node
// The page works offline: sw.js is up to date with index.html (every script and style it names, the fonts, the icons), every file it lists exists, and no font or script
// comes from another site.
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process"), os = require("os");
const root = path.join(__dirname, "..");
const tmp = path.join(os.tmpdir(), "sw-check-" + process.pid + ".js");
cp.execFileSync("node", [path.join(__dirname, "gen-sw.js"), tmp], { stdio: "ignore" });
let bad = 0;
const fresh = fs.readFileSync(tmp, "utf8"); fs.unlinkSync(tmp);
if (fresh !== fs.readFileSync(path.join(root, "sw.js"), "utf8")) { console.log("sw.js is not up to date: run node tests/gen-sw.js"); bad++; }
JSON.parse(fresh.match(/const FILES = (\[[\s\S]*?\]);/)[1]).forEach((f) => { if (f !== "./" && !fs.existsSync(path.join(root, f)) && !f.startsWith("../")) { console.log("listed but missing:", f); bad++; } });
const html = fs.readFileSync(path.join(root, "index.html"), "utf8"), css = fs.readFileSync(path.join(root, "style.css"), "utf8");
(html + css).match(/(?:src|href)="https?:\/\/[^"]+"|url\(["']?https?:\/\/[^)]+\)/g)?.forEach((u) => { console.log("loaded from another site:", u); bad++; });
console.log(bad ? bad + " problem(s)" : "offline: sw.js current, nothing loaded from another site");
process.exit(bad ? 1 : 0);
