import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const outfile = path.join(os.tmpdir(), `qmd-transform-${Date.now()}.mjs`);

await esbuild.build({
  entryPoints: [path.join(root, "src/qmd.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
});

const {
  extractQuartoCssRefs,
  extractYamlFrontmatter,
  isLikelyQmdPath,
  scopeCssToSelector,
  stableHash,
  stripYamlFrontmatter,
  transformQmdToObsidianMarkdown,
} = await import(pathToFileURL(outfile).href);

{
  const input = "```{python}\nprint('hello')\n```";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(result.markdown, "```python\nprint('hello')\n```");
  assert.deepEqual(result.warnings, []);
}

{
  const input = "```{r, echo=false}\nsummary(cars)\n```";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(result.markdown, "```r\nsummary(cars)\n```");
}

{
  const input = "::: {.callout-note}\n这是一段说明。\n\n第二段。\n:::";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(result.markdown, "> [!note]\n> 这是一段说明。\n>\n> 第二段。");
}

{
  const input = "见 @fig-arch 和 @tbl-result。";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(result.markdown, "见 [图引用: fig-arch] 和 [表引用: tbl-result]。");
}

{
  const input = [
    "::: {.weekly-report}",
    "# 一、当前阶段",
    "",
    "::: {.block}",
    "::: {.milestone-head}",
    "[6月底 生产常态化运转]{.milestone-title} [推进中]{.badge .b-active}",
    "[DDL: 2026-06-30 · AntCode: 已关闭 17 项]{.meta}",
    ":::",
    "",
    "本期材料对应 @sec-summary。",
    ":::",
    ":::",
  ].join("\n");
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(
    result.markdown,
    [
      '<div class="weekly-report">',
      "<h1>一、当前阶段</h1>",
      "",
      '<div class="block">',
      '<div class="milestone-head">',
      '<span class="milestone-title">6月底 生产常态化运转</span> <span class="badge b-active">推进中</span>',
      '<span class="meta">DDL: 2026-06-30 · AntCode: 已关闭 17 项</span>',
      "</div>",
      "",
      "本期材料对应 [章节引用: sec-summary]。",
      "</div>",
      "</div>",
    ].join("\n"),
  );
}

{
  const input = [
    '::: {#main .card .highlight data-kind="demo"}',
    "[标题]{.title}",
    ":::",
  ].join("\n");
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(
    result.markdown,
    [
      '<div id="main" class="card highlight" data-kind="demo">',
      '<span class="title">标题</span>',
      "</div>",
    ].join("\n"),
  );
}

{
  const input = "![Nomos 交付物页面](https://example.com/image.png){.evidence-image}";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(
    result.markdown,
    [
      '<div class="quarto-figure quarto-figure-center">',
      '<figure class="figure">',
      '<p><img class="evidence-image img-fluid figure-img" src="https://example.com/image.png" alt="Nomos 交付物页面"></p>',
      "<figcaption>Nomos 交付物页面</figcaption>",
      "</figure>",
      "</div>",
    ].join("\n"),
  );
}

{
  const input = "先进行**访谈**获取上下文，再由 **sub-agent** 生成 `constraint.md`，见 [文档](https://example.com/doc)。";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(
    result.markdown,
    '先进行<strong>访谈</strong>获取上下文，再由 <strong>sub-agent</strong> 生成 <code>constraint.md</code>，见 <a href="https://example.com/doc">文档</a>。',
  );
}

{
  const input = "普通图片：![截图](https://example.com/plain.png)";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(result.markdown, '普通图片：<img src="https://example.com/plain.png" alt="截图">');
}

{
  const input = "![截图](https://example.com/plain.png)";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(
    result.markdown,
    [
      '<div class="quarto-figure quarto-figure-center">',
      '<figure class="figure">',
      '<p><img class="img-fluid figure-img" src="https://example.com/plain.png" alt="截图"></p>',
      "<figcaption>截图</figcaption>",
      "</figure>",
      "</div>",
    ].join("\n"),
  );
}

{
  const input = '![截图](<https://example.com/image.png> "图片标题"){#demo .evidence-image data-kind="proof"}';
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(
    result.markdown,
    [
      '<div class="quarto-figure quarto-figure-center">',
      '<figure class="figure">',
      '<p><img id="demo" class="evidence-image img-fluid figure-img" data-kind="proof" src="https://example.com/image.png" alt="截图" title="图片标题"></p>',
      "<figcaption>截图</figcaption>",
      "</figure>",
      "</div>",
    ].join("\n"),
  );
}

{
  const input = [
    "::: {.broken}",
    "内容",
  ].join("\n");
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(result.markdown, '<div class="broken">\n内容\n</div>');
  assert.equal(result.warnings.length, 1);
}

{
  const input = "```python\nprint('[不要处理]{.class}')\n```";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(result.markdown, input);
}

{
  assert.equal(stableHash("abc"), stableHash("abc"));
  assert.notEqual(stableHash("abc"), stableHash("abcd"));
  assert.equal(isLikelyQmdPath("notes/demo.qmd"), true);
  assert.equal(isLikelyQmdPath("notes/demo.md"), false);
}

{
  const frontmatter = extractYamlFrontmatter("---\ntitle: Demo\n---\n正文");
  assert.equal(frontmatter.trim(), "title: Demo");
  assert.equal(extractYamlFrontmatter("正文"), null);
  assert.equal(stripYamlFrontmatter("---\ntitle: Demo\n---\n正文"), "正文");
}

{
  const input = "---\ntitle: Demo\n---\n# 正文标题 {.main-title}\n正文";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(result.markdown, '<h1 class="main-title">正文标题</h1>\n正文');
}

{
  const refs = extractQuartoCssRefs({
    css: "base.css",
    format: {
      html: {
        css: ["report.css", "print.css"],
      },
    },
  });
  assert.deepEqual(refs.map((ref) => ref.path), ["base.css", "report.css", "print.css"]);
}

{
  const css = [
    ":root { --accent: red; }",
    "body { background: white; }",
    ".card, .badge:is(.active, .done) { color: var(--accent); }",
    "@media (max-width: 900px) { .grid { display: block; } }",
  ].join("\n");
  const scoped = scopeCssToSelector(css, ".qmd-preview-render-buffer");
  assert.match(scoped, /\.qmd-preview-render-buffer \{ --accent: red; \}/);
  assert.match(scoped, /\.qmd-preview-render-buffer \{ background: white; \}/);
  assert.match(scoped, /\.qmd-preview-render-buffer \.card, \.qmd-preview-render-buffer \.badge:is\(\.active, \.done\)/);
  assert.match(scoped, /@media \(max-width: 900px\) \{\n\.qmd-preview-render-buffer \.grid/);
}

await fs.rm(outfile, { force: true });
console.log("qmd-transform tests passed");
