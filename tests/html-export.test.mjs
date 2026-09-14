import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import esbuild from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qmd-html-export-tests-"));

await esbuild.build({
  entryPoints: {
    "html-export": path.join(root, "src/html-export.ts"),
  },
  outdir: tempDir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
});

const {
  buildShareableHtml,
  guessMimeType,
  isKeptExternalHref,
} = await import(pathToFileURL(path.join(tempDir, "html-export.mjs")).href);

const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const pngPath = path.join(tempDir, "local.png");
const cssPath = path.join(tempDir, "theme.css");
const scriptPath = path.join(tempDir, "app.js");
const bgPath = path.join(tempDir, "bg.png");
await fs.writeFile(pngPath, pngBytes);
await fs.writeFile(bgPath, pngBytes);
await fs.writeFile(cssPath, "body { background: url(bg.png); }\n.remote { background: url(https://example.com/remote.png); }\n");
await fs.writeFile(scriptPath, "window.QMD_EXPORT = true;\n");

{
  assert.equal(isKeptExternalHref("https://example.com/a.png"), true);
  assert.equal(isKeptExternalHref("http://example.com/a.png"), true);
  assert.equal(isKeptExternalHref("//cdn.example.com/a.png"), true);
  assert.equal(isKeptExternalHref("data:image/png;base64,abc"), true);
  assert.equal(isKeptExternalHref("local.png"), false);
  assert.equal(isKeptExternalHref("./assets/local.png"), false);
  assert.equal(guessMimeType("photo.JPG"), "image/jpeg");
}

{
  const html = [
    "<html><head>",
    '<link rel="stylesheet" href="theme.css">',
    '<link rel="stylesheet" href="https://example.com/remote.css">',
    "</head><body>",
    '<img src="local.png" alt="local">',
    '<img src="https://example.com/remote.png" alt="remote">',
    '<img src="//cdn.example.com/protocol.png" alt="protocol">',
    '<img src="missing.png" alt="missing">',
    '<img src="local.png" srcset="local.png 1x, https://example.com/remote.png 2x">',
    '<script src="app.js"></script>',
    '<script src="https://example.com/remote.js"></script>',
    "</body></html>",
  ].join("\n");

  const result = await buildShareableHtml(html, tempDir);

  assert.match(result, /data:image\/png;base64,/);
  assert.match(result, /src="https:\/\/example.com\/remote.png"/);
  assert.match(result, /src="\/\/cdn.example.com\/protocol.png"/);
  assert.match(result, /src="missing.png"/);
  assert.match(result, /srcset="data:image\/png;base64,[^"]+ 1x, https:\/\/example.com\/remote.png 2x"/);
  assert.match(result, /data-qmd-export-inlined-css="theme.css"/);
  assert.match(result, /url\("data:image\/png;base64,/);
  assert.match(result, /url\(https:\/\/example.com\/remote.png\)/);
  assert.match(result, /href="https:\/\/example.com\/remote.css"/);
  assert.match(result, /data-qmd-export-inlined-src="app.js"/);
  assert.match(result, /window.QMD_EXPORT = true;/);
  assert.match(result, /src="https:\/\/example.com\/remote.js"/);
  assert.doesNotMatch(result, /src="local.png"/);
  assert.doesNotMatch(result, /href="theme.css"/);
}

{
  const moduleDir = path.join(tempDir, "libs", "quarto-html", "tabsets");
  await fs.mkdir(moduleDir, { recursive: true });
  await fs.writeFile(
    path.join(moduleDir, "tabsets.js"),
    "export function init() { window.TABSETS = true; }\n",
  );
  await fs.writeFile(
    path.join(tempDir, "libs", "quarto-html", "quarto.js"),
    'import * as tabsets from "./tabsets/tabsets.js";\nwindow.QUARTO = tabsets;\n',
  );

  const html = [
    "<html><body>",
    '<script src="libs/quarto-html/quarto.js" type="module"></script>',
    '<script src="libs/quarto-html/tabsets/tabsets.js" type="module"></script>',
    '<script src="missing-module.js" type="module"></script>',
    "</body></html>",
  ].join("\n");
  const result = await buildShareableHtml(html, tempDir);

  assert.match(result, /type="module"/);
  assert.match(result, /data:text\/javascript;charset=utf-8;base64,/);
  assert.match(result, /window.QUARTO = tabsets;/);
  assert.doesNotMatch(result, /\ssrc="libs\/quarto-html\/quarto\.js"/);
  assert.doesNotMatch(result, /\ssrc="libs\/quarto-html\/tabsets\/tabsets\.js"/);
  assert.doesNotMatch(result, /\ssrc="missing-module\.js"/);
  assert.match(result, /omitted local script missing-module\.js/);
}

{
  await fs.writeFile(
    path.join(tempDir, "dollar.js"),
    'window.KEEP = "$&"; const html = "</script>"; window.CLOSED = false;\n',
  );
  const html = '<html><body><script src="dollar.js"></script></body></html>';
  const result = await buildShareableHtml(html, tempDir);
  assert.match(result, /window\.KEEP = "\$&"/);
  assert.match(result, /<\\\/script>/);
  assert.equal((result.match(/<\/script>/gi) || []).length, 1);
  assert.match(result, /window\.CLOSED = false;/);
}

await fs.rm(tempDir, { recursive: true, force: true });
console.log("html-export tests passed");
