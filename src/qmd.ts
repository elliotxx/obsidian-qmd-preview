export interface TransformResult {
  markdown: string;
  warnings: string[];
}

export interface QuartoCssRef {
  path: string;
}

const CALLOUT_TYPES: Record<string, string> = {
  note: "note",
  tip: "tip",
  warning: "warning",
  caution: "caution",
  important: "important",
};

export function transformQmdToObsidianMarkdown(source: string): TransformResult {
  const warnings: string[] = [];
  const lines = stripYamlFrontmatter(source).split(/\r?\n/);
  const out: string[] = [];
  let inCodeFence = false;
  const divStack: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inCodeFence) {
      out.push(line);
      if (/^\s*```\s*$/.test(line)) inCodeFence = false;
      continue;
    }

    const codeFence = line.match(/^(\s*)```\{([^}\s,]+)([^}]*)\}\s*$/);
    if (codeFence) {
      const indent = codeFence[1] ?? "";
      const rawLanguage = codeFence[2] ?? "";
      const language = normalizeCodeLanguage(rawLanguage);
      out.push(`${indent}\`\`\`${language}`);
      inCodeFence = true;
      continue;
    }

    if (/^\s*```/.test(line)) {
      out.push(line);
      inCodeFence = true;
      continue;
    }

    const callout = line.match(/^:::\s*\{\.callout-([a-zA-Z0-9_-]+)[^}]*\}\s*$/);
    if (callout) {
      const type = normalizeCalloutType(callout[1] ?? "note");
      out.push(`> [!${type}]`);

      let closed = false;
      while (i + 1 < lines.length) {
        i++;
        const bodyLine = lines[i];
        if (/^:::\s*$/.test(bodyLine)) {
          closed = true;
          break;
        }
        const transformedBodyLine = transformPandocInlineSyntax(bodyLine);
        out.push(transformedBodyLine.length > 0 ? `> ${transformedBodyLine}` : ">");
      }

      if (!closed) {
        warnings.push(`第 ${i + 1} 行附近的 callout 没有找到结束标记。`);
      }
      continue;
    }

    const divStart = line.match(/^(\s*):::\s*(?:\{([^}]*)\})\s*$/);
    if (divStart) {
      const indent = divStart[1] ?? "";
      const htmlAttributes = pandocAttributesToHtml(divStart[2] ?? "");
      out.push(`${indent}<div${htmlAttributes}>`);
      divStack.push(indent);
      continue;
    }

    if (/^\s*:::\s*$/.test(line)) {
      const indent = divStack.pop() ?? "";
      out.push(`${indent}</div>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)(?:\s+\{([^}]*)\})?\s*#*\s*$/);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const text = transformPandocInlineSyntax(heading[2] ?? "");
      const htmlAttributes = pandocAttributesToHtml(heading[3] ?? "");
      out.push(`<h${level}${htmlAttributes}>${text}</h${level}>`);
      continue;
    }

    out.push(transformPandocInlineSyntax(line));
  }

  while (divStack.length > 0) {
    const indent = divStack.pop() ?? "";
    out.push(`${indent}</div>`);
    warnings.push("有未闭合的 Pandoc div，已在预览中自动补齐结束标签。");
  }

  return {
    markdown: out.join("\n"),
    warnings,
  };
}

export function stableHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function isLikelyQmdPath(path: string): boolean {
  return path.toLowerCase().endsWith(".qmd");
}

export function extractYamlFrontmatter(source: string): string | null {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match?.[1] ?? null;
}

export function stripYamlFrontmatter(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}

export function extractQuartoCssRefs(config: unknown): QuartoCssRef[] {
  const refs: QuartoCssRef[] = [];
  const root = asRecord(config);
  if (!root) return refs;

  appendCssValue(refs, root.css);

  const format = asRecord(root.format);
  const html = asRecord(format?.html);
  appendCssValue(refs, html?.css);

  return dedupeCssRefs(refs);
}

export function scopeCssToSelector(css: string, scopeSelector: string): string {
  return scopeCssRules(css.replace(/\/\*[\s\S]*?\*\//g, ""), scopeSelector).trim();
}

function normalizeCodeLanguage(raw: string): string {
  const language = raw.trim().replace(/^\./, "");
  if (!language) return "";
  if (language === "py") return "python";
  if (language === "js") return "javascript";
  if (language === "ts") return "typescript";
  return language;
}

function normalizeCalloutType(raw: string): string {
  const normalized = raw.toLowerCase();
  return CALLOUT_TYPES[normalized] ?? "note";
}

function transformCrossRefs(line: string): string {
  return line.replace(/@((fig|tbl|sec|eq)-[A-Za-z0-9_-]+)/g, (_match, id: string, kind: string) => {
    const label = crossRefLabel(kind);
    return `[${label}: ${id}]`;
  });
}

function transformPandocInlineSyntax(line: string): string {
  const crossRefTransformed = transformCrossRefs(line);
  const figure = transformStandaloneMarkdownImageSyntax(crossRefTransformed);
  if (figure) return figure;
  return transformBasicMarkdownInline(transformInlinePandocAttributes(transformMarkdownImageSyntax(crossRefTransformed)));
}

function transformMarkdownImageSyntax(line: string): string {
  let result = line.replace(
    /!\[([^\]]*)]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)\{([^}]*)\}/g,
    (_match, alt: string, src: string, doubleTitle: string | undefined, singleTitle: string | undefined, attrs: string) => {
      const title = doubleTitle ?? singleTitle ?? "";
      return buildImageHtml({ alt, src, title, attrs });
    },
  );

  result = result.replace(
    /!\[([^\]]*)]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)/g,
    (_match, alt: string, src: string, doubleTitle: string | undefined, singleTitle: string | undefined) => {
      const title = doubleTitle ?? singleTitle ?? "";
      return buildImageHtml({ alt, src, title });
    },
  );

  return result;
}

interface ParsedMarkdownImage {
  alt: string;
  src: string;
  title: string;
  attrs?: string;
}

function transformStandaloneMarkdownImageSyntax(line: string): string | null {
  const image = parseStandaloneMarkdownImage(line);
  if (!image) return null;

  const imageHtml = buildImageHtml({
    ...image,
    extraClasses: ["img-fluid", "figure-img"],
  });
  const caption = image.alt.trim() ? `\n<figcaption>${escapeHtml(image.alt.trim())}</figcaption>` : "";

  return [
    '<div class="quarto-figure quarto-figure-center">',
    '<figure class="figure">',
    `<p>${imageHtml}</p>${caption}`,
    "</figure>",
    "</div>",
  ].join("\n");
}

function parseStandaloneMarkdownImage(line: string): ParsedMarkdownImage | null {
  const image = line.match(
    /^\s*!\[([^\]]*)]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)(?:\{([^}]*)\})?\s*$/,
  );
  if (!image) return null;

  return {
    alt: image[1] ?? "",
    src: image[2] ?? "",
    title: image[3] ?? image[4] ?? "",
    attrs: image[5],
  };
}

function buildImageHtml(image: ParsedMarkdownImage & { extraClasses?: string[] }): string {
  const htmlAttrs = pandocAttributesToHtml(image.attrs ?? "", image.extraClasses ?? []);
  const titleAttr = image.title ? ` title="${escapeHtmlAttribute(image.title)}"` : "";
  return `<img${htmlAttrs} src="${escapeHtmlAttribute(stripAngleBrackets(image.src))}" alt="${escapeHtmlAttribute(image.alt)}"${titleAttr}>`;
}

function transformInlinePandocAttributes(line: string): string {
  let result = line;
  let previous = "";

  while (result !== previous) {
    previous = result;
    result = result.replace(/\[([^\]]+)]\{([^}]*)\}/g, (_match, text: string, attrs: string) => {
      return `<span${pandocAttributesToHtml(attrs)}>${escapeHtml(text)}</span>`;
    });
  }

  return result.trimEnd();
}

function transformBasicMarkdownInline(line: string): string {
  const codeSpans: string[] = [];
  let result = line.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const token = `\u0000CODE${codeSpans.length}\u0000`;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  result = result.replace(
    /(?<!!)\[([^\]\n]+)]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)/g,
    (_match, text: string, href: string, doubleTitle: string | undefined, singleTitle: string | undefined) => {
      const title = doubleTitle ?? singleTitle ?? "";
      const titleAttr = title ? ` title="${escapeHtmlAttribute(title)}"` : "";
      return `<a href="${escapeHtmlAttribute(stripAngleBrackets(href))}"${titleAttr}>${transformBasicMarkdownInline(text)}</a>`;
    },
  );

  result = result
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^\w*])\*([^*\n]+?)\*(?=$|[^\w*])/g, "$1<em>$2</em>")
    .replace(/(^|[^\w_])_([^_\n]+?)_(?=$|[^\w_])/g, "$1<em>$2</em>");

  for (let i = 0; i < codeSpans.length; i++) {
    result = result.replaceAll(`\u0000CODE${i}\u0000`, codeSpans[i] ?? "");
  }

  return result;
}

function pandocAttributesToHtml(raw: string, extraClasses: string[] = []): string {
  const classes: string[] = [];
  let id = "";
  const dataAttrs: string[] = [];
  const tokens = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];

  for (const token of tokens) {
    if (token.startsWith(".")) {
      classes.push(token.slice(1));
      continue;
    }
    if (token.startsWith("#")) {
      id = token.slice(1);
      continue;
    }

    const pair = token.match(/^([A-Za-z_:][A-Za-z0-9_:.-]*)=(.*)$/);
    if (pair) {
      const key = pair[1];
      const value = stripQuotes(pair[2] ?? "");
      dataAttrs.push(`${escapeHtmlAttribute(key)}="${escapeHtmlAttribute(value)}"`);
    }
  }

  for (const className of extraClasses) {
    if (className && !classes.includes(className)) classes.push(className);
  }

  const htmlAttrs: string[] = [];
  if (id) htmlAttrs.push(`id="${escapeHtmlAttribute(id)}"`);
  if (classes.length > 0) htmlAttrs.push(`class="${escapeHtmlAttribute(classes.join(" "))}"`);
  htmlAttrs.push(...dataAttrs);

  return htmlAttrs.length > 0 ? ` ${htmlAttrs.join(" ")}` : "";
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function stripAngleBrackets(value: string): string {
  if (value.startsWith("<") && value.endsWith(">")) return value.slice(1, -1);
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function crossRefLabel(kind: string): string {
  switch (kind) {
    case "fig":
      return "图引用";
    case "tbl":
      return "表引用";
    case "sec":
      return "章节引用";
    case "eq":
      return "公式引用";
    default:
      return "引用";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function appendCssValue(refs: QuartoCssRef[], value: unknown) {
  if (typeof value === "string") {
    const path = value.trim();
    if (path) refs.push({ path });
    return;
  }

  if (!Array.isArray(value)) return;
  for (const item of value) appendCssValue(refs, item);
}

function dedupeCssRefs(refs: QuartoCssRef[]): QuartoCssRef[] {
  const seen = new Set<string>();
  const result: QuartoCssRef[] = [];
  for (const ref of refs) {
    if (seen.has(ref.path)) continue;
    seen.add(ref.path);
    result.push(ref);
  }
  return result;
}

function scopeCssRules(css: string, scopeSelector: string): string {
  let result = "";
  let index = 0;

  while (index < css.length) {
    const open = css.indexOf("{", index);
    if (open === -1) {
      result += css.slice(index);
      break;
    }

    const prelude = css.slice(index, open).trim();
    const close = findMatchingBrace(css, open);
    if (close === -1) {
      result += css.slice(index);
      break;
    }

    const body = css.slice(open + 1, close);
    if (!prelude) {
      result += body;
    } else if (/^@(media|supports|container|layer)\b/i.test(prelude)) {
      result += `${prelude} {\n${scopeCssRules(body, scopeSelector)}\n}\n`;
    } else if (/^@(font-face|keyframes|-webkit-keyframes|property|page)\b/i.test(prelude)) {
      result += `${prelude} {${body}}\n`;
    } else if (prelude.startsWith("@")) {
      result += `${prelude} {${body}}\n`;
    } else {
      result += `${scopeSelectorList(prelude, scopeSelector)} {${body}}\n`;
    }

    index = close + 1;
  }

  return result;
}

function findMatchingBrace(css: string, open: number): number {
  let depth = 0;
  let quote = "";

  for (let index = open; index < css.length; index++) {
    const char = css[index];
    const previous = css[index - 1];
    if (quote) {
      if (char === quote && previous !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function scopeSelectorList(selectorList: string, scopeSelector: string): string {
  return splitSelectors(selectorList)
    .map((selector) => scopeSelectorText(selector, scopeSelector))
    .join(", ");
}

function splitSelectors(selectorList: string): string[] {
  const selectors: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";

  for (const char of selectorList) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      selectors.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) selectors.push(current);
  return selectors;
}

function scopeSelectorText(selector: string, scopeSelector: string): string {
  const trimmed = selector.trim();
  if (!trimmed) return scopeSelector;
  if (trimmed === ":root" || trimmed === "html" || trimmed === "body") return scopeSelector;
  if (trimmed.startsWith(":root ")) return trimmed.replace(/^:root\b/, scopeSelector);
  if (trimmed.startsWith("html ")) return trimmed.replace(/^html\b/, scopeSelector);
  if (trimmed.startsWith("body ")) return trimmed.replace(/^body\b/, scopeSelector);
  if (trimmed.startsWith(scopeSelector)) return trimmed;
  return `${scopeSelector} ${trimmed}`;
}
