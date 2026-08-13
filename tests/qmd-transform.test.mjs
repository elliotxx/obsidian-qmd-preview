import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qmd-preview-tests-"));

await esbuild.build({
  entryPoints: {
    qmd: path.join(root, "src/qmd.ts"),
    "scroll-sync": path.join(root, "src/scroll-sync.ts"),
  },
  outdir: tempDir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
});

const {
  extractQuartoCssRefs,
  extractYamlFrontmatter,
  insertListBlockBoundaries,
  isLikelyQmdPath,
  scopeCssToSelector,
  stableHash,
  stripYamlFrontmatter,
  transformQmdToObsidianMarkdown,
} = await import(pathToFileURL(path.join(tempDir, "qmd.mjs")).href);

const {
  dedupeVisualSourceAnchors,
  findListItemOutputLines,
  mapOutputLineRange,
  previewOffsetAtSourceLine,
  scanMarkdownBlockRanges,
  sourceLineAtPreviewOffset,
} = await import(pathToFileURL(path.join(tempDir, "scroll-sync.mjs")).href);

{
  const input = "```{python}\nprint('hello')\n```";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(result.markdown, "```python\nprint('hello')\n```");
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(
    result.outputLineMap,
    [
      { sourceStart: 0, sourceEnd: 0, synthetic: false },
      { sourceStart: 1, sourceEnd: 1, synthetic: false },
      { sourceStart: 2, sourceEnd: 2, synthetic: false },
    ],
  );
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
  assert.equal(result.outputLineMap.length, result.markdown.split("\n").length);
  assert.equal(result.outputLineMap.every((range) => range.sourceStart === 0), true);
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
  const input = [
    "::: {.progress-item}",
    "",
    "**核心观点**：",
    "- Agent 应该参与到团队协作界面中",
    "- issue/task 应该在聊天中自然产生",
    "",
    ":::",
  ].join("\n");
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(
    result.markdown,
    [
      '<div class="progress-item">',
      "",
      "<strong>核心观点</strong>：",
      "",
      "- Agent 应该参与到团队协作界面中",
      "- issue/task 应该在聊天中自然产生",
      "",
      "</div>",
    ].join("\n"),
  );
  assert.deepEqual(
    result.outputLineMap,
    [
      { sourceStart: 0, sourceEnd: 0, synthetic: false },
      { sourceStart: 1, sourceEnd: 1, synthetic: false },
      { sourceStart: 2, sourceEnd: 2, synthetic: false },
      { sourceStart: 3, sourceEnd: 3, synthetic: true },
      { sourceStart: 3, sourceEnd: 3, synthetic: false },
      { sourceStart: 4, sourceEnd: 4, synthetic: false },
      { sourceStart: 5, sourceEnd: 5, synthetic: false },
      { sourceStart: 6, sourceEnd: 6, synthetic: false },
    ],
  );
}

{
  const input = [
    "::: {.progress-item}",
    "**进展**：",
    "- 本周正式启动",
    "- 期望沉淀的**变更平台通用特征**",
    ":::",
  ].join("\n");
  const prepared = insertListBlockBoundaries(input);
  assert.equal(
    prepared,
    [
      "::: {.progress-item}",
      "**进展**：",
      "",
      "- 本周正式启动",
      "- 期望沉淀的**变更平台通用特征**",
      ":::",
    ].join("\n"),
  );
  assert.equal(insertListBlockBoundaries(prepared), prepared);
}

{
  const input = [
    "---",
    "tags:",
    "- report",
    "- weekly",
    "---",
    "**进展**：",
    "- 本周正式启动",
    "",
    "```",
    "- 不是列表",
    "```",
    "",
    "下一步：",
    "1. 验收",
  ].join("\n");
  assert.equal(
    insertListBlockBoundaries(input),
    [
      "---",
      "tags:",
      "- report",
      "- weekly",
      "---",
      "**进展**：",
      "",
      "- 本周正式启动",
      "",
      "```",
      "- 不是列表",
      "```",
      "",
      "下一步：",
      "",
      "1. 验收",
    ].join("\n"),
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
  assert.deepEqual(result.outputLineMap.at(-1), {
    sourceStart: 1,
    sourceEnd: 1,
    synthetic: true,
  });
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
  assert.deepEqual(
    result.outputLineMap,
    [
      { sourceStart: 3, sourceEnd: 3, synthetic: false },
      { sourceStart: 4, sourceEnd: 4, synthetic: false },
    ],
  );
  assert.equal(result.sourceLineCount, 5);
}

{
  const result = transformQmdToObsidianMarkdown("---\r\ntitle: Demo\r\n---\r\n正文");
  assert.equal(result.markdown, "正文");
  assert.deepEqual(result.outputLineMap, [
    { sourceStart: 3, sourceEnd: 3, synthetic: false },
  ]);
}

{
  const input = "::: {.callout-note}\n说明\n:::\n结尾";
  const result = transformQmdToObsidianMarkdown(input);
  assert.equal(result.markdown, "> [!note]\n> 说明\n结尾");
  assert.deepEqual(
    result.outputLineMap,
    [
      { sourceStart: 0, sourceEnd: 0, synthetic: false },
      { sourceStart: 1, sourceEnd: 1, synthetic: false },
      { sourceStart: 3, sourceEnd: 3, synthetic: false },
    ],
  );
}

{
  const lineMap = [
    { sourceStart: 10, sourceEnd: 10, synthetic: false },
    { sourceStart: 11, sourceEnd: 11, synthetic: true },
    { sourceStart: 12, sourceEnd: 14, synthetic: false },
  ];
  assert.deepEqual(mapOutputLineRange(lineMap, 0, 2), { startLine: 10, endLine: 14 });
  assert.deepEqual(mapOutputLineRange(lineMap, 1, 1), { startLine: 11, endLine: 11 });
  assert.deepEqual(
    findListItemOutputLines(["段落", "- 第一项", "    1. 子项", "> - 引用项"], 0, 3),
    [1, 2, 3],
  );
  assert.deepEqual(
    findListItemOutputLines(["- 第一项", "```text", "- 不是列表", "```", "- 第二项"], 0, 4),
    [0, 4],
  );
  assert.deepEqual(
    scanMarkdownBlockRanges([
      "<div>",
      "<h1>标题</h1>",
      "",
      "第一段",
      "续行",
      "",
      "- 列表一",
      "- 列表二",
      "",
      "> [!note]",
      "> 引用",
      "",
      "```ts",
      "const value = 1;",
      "```",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "<figure>",
      "<p><img src=\"demo.png\"></p>",
      "</figure>",
      "</div>",
    ]),
    [
      { kind: "heading", lineStart: 1, lineEnd: 1 },
      { kind: "paragraph", lineStart: 3, lineEnd: 4 },
      { kind: "list-item", lineStart: 6, lineEnd: 6 },
      { kind: "list-item", lineStart: 7, lineEnd: 7 },
      { kind: "blockquote", lineStart: 9, lineEnd: 10 },
      { kind: "code", lineStart: 12, lineEnd: 14 },
      { kind: "table", lineStart: 16, lineEnd: 18 },
      { kind: "figure", lineStart: 20, lineEnd: 22 },
    ],
  );
}

{
  const anchors = [
    { top: 0, bottom: 100, startLine: 3, endLine: 7 },
    { top: 200, bottom: 240, startLine: 12, endLine: 12 },
  ];
  assert.equal(sourceLineAtPreviewOffset(anchors, 50), 5);
  assert.equal(sourceLineAtPreviewOffset(anchors, 150), 10);
  assert.equal(previewOffsetAtSourceLine(anchors, 5), 50);
  assert.equal(previewOffsetAtSourceLine(anchors, 10), 160);
  assert.equal(
    Math.round(previewOffsetAtSourceLine([
      { top: 0, bottom: 12087, startLine: 6, endLine: 411 },
      { top: 678, bottom: 704, startLine: 354, endLine: 354 },
      { top: 918, bottom: 944, startLine: 72, endLine: 72 },
      { top: 7617, bottom: 7643, startLine: 292, endLine: 292 },
      { top: 7785, bottom: 7822, startLine: 316, endLine: 316 },
    ], 294)),
    7655,
  );
  assert.equal(
    Math.round(previewOffsetAtSourceLine([
      { top: 500, bottom: 530, startLine: 37, endLine: 37, inverseReliable: true },
      { top: 1135, bottom: 1160, startLine: 49, endLine: 49, inverseReliable: false },
      { top: 1700, bottom: 1730, startLine: 73, endLine: 73, inverseReliable: true },
    ], 49)),
    920,
  );
  assert.deepEqual(
    dedupeVisualSourceAnchors([
      { top: 0, bottom: 20, startLine: 3, endLine: 7 },
      { top: 0, bottom: 100, startLine: 3, endLine: 7 },
    ]),
    [{ top: 0, bottom: 100, startLine: 3, endLine: 7 }],
  );
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

await fs.rm(tempDir, { recursive: true, force: true });
console.log("qmd-transform tests passed");
