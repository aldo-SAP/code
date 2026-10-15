# vendor

`fontoxpath.js` is [fontoxpath](https://github.com/FontoXML/fontoxpath) 3.34.0 (XPath 3.1 for the browser, MIT, see `fontoxpath.LICENSE.md`), bundled
together with its two small dependencies `xspattern` and `prsc` (also MIT) into one file. The PINT AE rules (`../rules.js`) are the official schematron
asserts, which are XPath 2 expressions, and run on it unchanged.

Rebuild: `npm i fontoxpath@3.34.0 esbuild`, then
`esbuild node_modules/fontoxpath/dist/fontoxpath.esm.js --bundle --format=iife --global-name=fontoxpath --minify --legal-comments=none --outfile=fontoxpath.js`
