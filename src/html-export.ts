import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_EMBED_BYTES = 20 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".css": "text/css",
  ".eot": "application/vnd.ms-fontobject",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpe": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function isKeptExternalHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return true;
  if (/^(https?:|data:|blob:|mailto:|javascript:|#)/i.test(trimmed)) return true;
  if (trimmed.startsWith("//")) return true;
  return false;
}

export function guessMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export async function buildShareableHtml(html: string, baseDir: string): Promise<string> {
  let result = html;
  result = await inlineLocalStylesheets(result, baseDir);
  result = await inlineLocalScripts(result, baseDir);
  result = await embedLocalImages(result, baseDir);
  result = stripLeftoverLocalScriptSrc(result);
  return result;
}

async function inlineLocalStylesheets(html: string, baseDir: string): Promise<string> {
  const pattern = /<link\b[^>]*>/gi;
  return replaceMatches(html, pattern, async (tag) => {
    if (!/\brel\s*=\s*(["']?)stylesheet\1/i.test(tag)) return tag;
    const href = getAttribute(tag, "href");
    if (!href || isKeptExternalHref(href)) return tag;

    const cssPath = resolveLocalResourcePath(baseDir, href);
    if (!cssPath) return tag;
    const rawCss = await readTextFile(cssPath);
    if (rawCss === null) return tag;

    const css = await rewriteCssUrlsToDataUris(rawCss, path.dirname(cssPath));
    return `<style data-qmd-export-inlined-css="${escapeHtmlAttribute(href)}">\n${escapeStyleText(css)}\n</style>`;
  });
}

async function inlineLocalScripts(html: string, baseDir: string): Promise<string> {
  const pattern = /<script\b[^>]*>\s*<\/script>/gi;
  const moduleCache = new Map<string, Promise<string | null>>();
  return replaceMatches(html, pattern, async (tag) => {
    const src = getAttribute(tag, "src");
    if (!src || isKeptExternalHref(src)) return tag;

    const scriptPath = resolveLocalResourcePath(baseDir, src);
    if (!scriptPath) return omitLocalScript(src);

    const isModule = isModuleScript(tag);
    const source = isModule
      ? await rewriteModuleSource(scriptPath, moduleCache)
      : await readTextFile(scriptPath);
    if (source === null) return omitLocalScript(src);

    const withoutSrc = tag
      .replace(/\s+src\s*=\s*(["']).*?\1/i, "")
      .replace(/\s*\/>$/, "></script>")
      .replace(/>\s*<\/script>$/i, () => (
        ` data-qmd-export-inlined-src="${escapeHtmlAttribute(src)}">${escapeInlineScript(source)}</script>`
      ));
    if (withoutSrc.includes("data-qmd-export-inlined-src=")) return withoutSrc;

    return `<script${isModule ? " type=\"module\"" : ""} data-qmd-export-inlined-src="${escapeHtmlAttribute(src)}">${escapeInlineScript(source)}</script>`;
  });
}

function isModuleScript(tag: string): boolean {
  return /\btype\s*=\s*(["']?)module\1/i.test(tag);
}

function omitLocalScript(src: string): string {
  return `<!-- qmd-export: omitted local script ${escapeHtmlAttribute(src)} -->`;
}

function stripLeftoverLocalScriptSrc(html: string): string {
  return html.replace(/<script\b(?=[^>]*\ssrc=)[^>]*>\s*<\/script>/gi, (tag) => {
    const src = getAttribute(tag, "src");
    if (!src || isKeptExternalHref(src)) return tag;
    return omitLocalScript(src);
  });
}

async function rewriteModuleSource(
  filePath: string,
  cache: Map<string, Promise<string | null>>,
): Promise<string | null> {
  const cached = cache.get(filePath);
  if (cached) return cached;

  const pending = (async () => {
    const source = await readTextFile(filePath);
    if (source === null) return null;
    return rewriteRelativeModuleSpecifiers(source, path.dirname(filePath), cache);
  })();

  cache.set(filePath, pending);
  return pending;
}

async function rewriteRelativeModuleSpecifiers(
  source: string,
  fileDir: string,
  cache: Map<string, Promise<string | null>>,
): Promise<string> {
  const pattern = /\b(?:from|import)\s*(["'])(\.[^"']+)\1/g;
  const matches = [...source.matchAll(pattern)];
  let result = source;
  for (const match of matches.reverse()) {
    if (match.index === undefined) continue;
    const specifier = match[2] ?? "";
    const importedPath = resolveLocalResourcePath(fileDir, specifier);
    if (!importedPath) continue;
    const rewritten = await rewriteModuleSource(importedPath, cache);
    if (rewritten === null) continue;
    const dataUrl = `data:text/javascript;charset=utf-8;base64,${Buffer.from(rewritten, "utf8").toString("base64")}`;
    const keyword = match[0].trimStart().startsWith("from") ? "from" : "import";
    const replacement = `${keyword} "${dataUrl}"`;
    result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);
  }
  return result;
}

async function embedLocalImages(html: string, baseDir: string): Promise<string> {
  const pattern = /<img\b[^>]*>/gi;
  return replaceMatches(html, pattern, async (tag) => {
    let next = tag;
    const src = getAttribute(next, "src");
    if (src) {
      const embedded = await embedIfLocalFile(src, baseDir);
      if (embedded) next = setAttribute(next, "src", embedded);
    }
    const srcset = getAttribute(next, "srcset");
    if (srcset) {
      const embeddedSrcset = await embedSrcset(srcset, baseDir);
      if (embeddedSrcset !== srcset) next = setAttribute(next, "srcset", embeddedSrcset);
    }
    return next;
  });
}

async function embedSrcset(srcset: string, baseDir: string): Promise<string> {
  const parts = srcset.split(",").map((part) => part.trim()).filter(Boolean);
  const rewritten: string[] = [];
  for (const part of parts) {
    const match = part.match(/^(\S+)(\s+.*)?$/);
    if (!match) {
      rewritten.push(part);
      continue;
    }
    const url = match[1] ?? "";
    const descriptor = match[2] ?? "";
    const embedded = await embedIfLocalFile(url, baseDir);
    rewritten.push(`${embedded ?? url}${descriptor}`);
  }
  return rewritten.join(", ");
}

async function rewriteCssUrlsToDataUris(css: string, cssDir: string): Promise<string> {
  const pattern = /url\(([^)]+)\)/gi;
  const matches = [...css.matchAll(pattern)];
  let result = css;
  for (const match of matches.reverse()) {
    if (match.index === undefined) continue;
    const rawValue = (match[1] ?? "").trim();
    const quote = rawValue.startsWith("\"") || rawValue.startsWith("'") ? rawValue[0] : "";
    const value = quote ? rawValue.slice(1, -1) : rawValue;
    if (!value || isKeptExternalHref(value) || value.startsWith("#")) continue;

    const embedded = await embedIfLocalFile(value, cssDir);
    if (!embedded) continue;
    const replacement = `url("${embedded}")`;
    result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);
  }
  return result;
}

async function embedIfLocalFile(href: string, baseDir: string): Promise<string | null> {
  if (!href || isKeptExternalHref(href)) return null;
  const filePath = resolveLocalResourcePath(baseDir, href);
  if (!filePath) return null;
  const resource = await readBinaryFile(filePath);
  if (!resource) return null;
  return `data:${resource.mime};base64,${resource.data.toString("base64")}`;
}

async function readBinaryFile(filePath: string): Promise<{ mime: string; data: Buffer } | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_EMBED_BYTES) return null;
    const data = await fs.readFile(filePath);
    return { mime: guessMimeType(filePath), data };
  } catch {
    return null;
  }
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_EMBED_BYTES) return null;
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export function resolveLocalResourcePath(baseDir: string, href: string): string | null {
  const decoded = decodeHrefPath(href);
  if (!decoded) return null;
  if (/^file:/i.test(decoded)) {
    try {
      return fileURLToPath(decoded);
    } catch {
      return null;
    }
  }
  return path.resolve(baseDir, decoded);
}

function decodeHrefPath(href: string): string {
  const withoutFragment = href.split("#", 1)[0] ?? href;
  const withoutQuery = withoutFragment.split("?", 1)[0] ?? withoutFragment;
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

function getAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  const match = tag.match(pattern);
  return match ? match[2] ?? null : null;
}

function setAttribute(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`(\\s${name}\\s*=\\s*)(["'])(.*?)\\2`, "i");
  if (pattern.test(tag)) {
    return tag.replace(pattern, (_full, prefix: string, quote: string) => (
      `${prefix}${quote}${escapeHtmlAttribute(value)}${quote}`
    ));
  }
  return tag.replace(/(\/?>)$/, (_full, end: string) => ` ${name}="${escapeHtmlAttribute(value)}" ${end}`);
}

async function replaceMatches(
  html: string,
  pattern: RegExp,
  replacer: (match: string) => Promise<string>,
): Promise<string> {
  const matches = [...html.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  let result = html;
  for (const match of matches.reverse()) {
    if (match.index === undefined) continue;
    const replacement = await replacer(match[0]);
    result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);
  }
  return result;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeStyleText(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style");
}

function escapeInlineScript(value: string): string {
  return value.replace(/<\/script/gi, "<\\/script");
}
