import type { SourceLineRange } from "./qmd";

export interface MappedSourceRange {
  startLine: number;
  endLine: number;
}

export interface VisualSourceAnchor extends MappedSourceRange {
  top: number;
  bottom: number;
}

export type MarkdownBlockKind =
  | "heading"
  | "paragraph"
  | "list-item"
  | "blockquote"
  | "code"
  | "table"
  | "figure";

export interface MarkdownBlockRange {
  kind: MarkdownBlockKind;
  lineStart: number;
  lineEnd: number;
}

export function scanMarkdownBlockRanges(
  markdownLines: readonly string[],
): MarkdownBlockRange[] {
  const blocks: MarkdownBlockRange[] = [];
  let line = 0;
  while (line < markdownLines.length) {
    const text = markdownLines[line] ?? "";
    if (!text.trim() || isStructuralHtmlLine(text)) {
      line++;
      continue;
    }

    const fence = text.match(/^(?:\s*>\s*)*\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1]?.[0];
      const end = findBlockEnd(markdownLines, line + 1, (candidate) => (
        marker ? new RegExp(`^(?:\\s*>\\s*)*\\s*${escapeRegExp(marker)}{3,}`).test(candidate) : false
      ));
      blocks.push({ kind: "code", lineStart: line, lineEnd: end });
      line = end + 1;
      continue;
    }

    if (/^\s*<figure\b/i.test(text)) {
      const end = findBlockEnd(markdownLines, line + 1, (candidate) => /<\/figure>\s*$/i.test(candidate));
      blocks.push({ kind: "figure", lineStart: line, lineEnd: end });
      line = end + 1;
      continue;
    }

    if (/^\s*<table\b/i.test(text)) {
      const end = findBlockEnd(markdownLines, line + 1, (candidate) => /<\/table>\s*$/i.test(candidate));
      blocks.push({ kind: "table", lineStart: line, lineEnd: end });
      line = end + 1;
      continue;
    }

    if (isHeadingLine(text)) {
      blocks.push({ kind: "heading", lineStart: line, lineEnd: line });
      line++;
      continue;
    }

    if (/^\s*>/.test(text)) {
      const end = findContiguousEnd(markdownLines, line, (candidate) => /^\s*>/.test(candidate));
      blocks.push({ kind: "blockquote", lineStart: line, lineEnd: end });
      line = end + 1;
      continue;
    }

    if (isListItemLine(text)) {
      blocks.push({ kind: "list-item", lineStart: line, lineEnd: line });
      line++;
      continue;
    }

    if (isMarkdownTableStart(markdownLines, line)) {
      const end = findContiguousEnd(markdownLines, line, (candidate) => (
        Boolean(candidate.trim()) && candidate.includes("|")
      ));
      blocks.push({ kind: "table", lineStart: line, lineEnd: end });
      line = end + 1;
      continue;
    }

    if (/^\s*</.test(text) || /^\s{2,}\S/.test(text) || /^(?:---+|\*\*\*+|___+)\s*$/.test(text)) {
      line++;
      continue;
    }

    const end = findContiguousEnd(markdownLines, line, (candidate, candidateLine) => (
      Boolean(candidate.trim())
      && !isStructuralHtmlLine(candidate)
      && !isHeadingLine(candidate)
      && !isListItemLine(candidate)
      && !/^\s*>/.test(candidate)
      && !/^(?:\s*>\s*)*\s*(`{3,}|~{3,})/.test(candidate)
      && !isMarkdownTableStart(markdownLines, candidateLine)
      && !/^\s*</.test(candidate)
    ));
    blocks.push({ kind: "paragraph", lineStart: line, lineEnd: end });
    line = end + 1;
  }
  return blocks;
}

export function findListItemOutputLines(
  markdownLines: readonly string[],
  lineStart: number,
  lineEnd: number,
): number[] {
  if (markdownLines.length === 0 || !Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return [];
  const from = clamp(Math.floor(Math.min(lineStart, lineEnd)), 0, markdownLines.length - 1);
  const to = clamp(Math.floor(Math.max(lineStart, lineEnd)), from, markdownLines.length - 1);
  const result: number[] = [];
  let inCodeFence = false;
  for (let line = from; line <= to; line++) {
    const text = markdownLines[line] ?? "";
    if (/^(?:\s*>\s*)*\s*```/.test(text)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;
    if (/^(?:\s*>\s*)*\s*(?:[-+*]|\d{1,9}[.)])[ \t]+/.test(text)) {
      result.push(line);
    }
  }
  return result;
}

export function mapOutputLineRange(
  outputLineMap: readonly SourceLineRange[],
  lineStart: number,
  lineEnd: number,
): MappedSourceRange | null {
  if (outputLineMap.length === 0 || !Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return null;

  // Obsidian reports Markdown section lines as 0-based inclusive endpoints.
  const from = clamp(Math.floor(Math.min(lineStart, lineEnd)), 0, outputLineMap.length - 1);
  const to = clamp(Math.floor(Math.max(lineStart, lineEnd)), from, outputLineMap.length - 1);
  const ranges = outputLineMap.slice(from, to + 1);
  const realRanges = ranges.filter((range) => !range.synthetic);
  const selected = realRanges.length > 0 ? realRanges : ranges;
  if (selected.length === 0) return null;

  return {
    startLine: Math.min(...selected.map((range) => range.sourceStart)),
    endLine: Math.max(...selected.map((range) => range.sourceEnd)),
  };
}

export function sourceLineAtPreviewOffset(
  anchors: readonly VisualSourceAnchor[],
  offset: number,
): number | null {
  const valid = normalizeAnchors(anchors);
  if (valid.length === 0 || !Number.isFinite(offset)) return null;

  const containing = valid
    .filter((anchor) => anchor.top <= offset && anchor.bottom >= offset)
    .sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top));
  const inside = containing[0];
  if (inside) {
    return interpolateSourceRange(inside, offset);
  }

  const before = valid
    .filter((anchor) => anchor.top <= offset)
    .sort((a, b) => (
      b.top - a.top
      || (a.bottom - a.top) - (b.bottom - b.top)
    ))[0];
  const after = valid.find((anchor) => anchor.top > offset);
  if (!before) return valid[0]?.startLine ?? null;
  if (!after) return before.endLine;

  const distance = after.top - before.bottom;
  if (distance <= 0) return before.endLine;
  const progress = clamp((offset - before.bottom) / distance, 0, 1);
  return Math.round(before.endLine + progress * (after.startLine - before.endLine));
}

export function previewOffsetAtSourceLine(
  anchors: readonly VisualSourceAnchor[],
  sourceLine: number,
): number | null {
  const valid = normalizeAnchors(anchors);
  if (valid.length === 0 || !Number.isFinite(sourceLine)) return null;

  const containing = valid
    .filter((anchor) => anchor.startLine <= sourceLine && anchor.endLine >= sourceLine)
    .sort((a, b) => (
      (a.endLine - a.startLine) - (b.endLine - b.startLine)
      || (a.bottom - a.top) - (b.bottom - b.top)
    ));
  const inside = containing[0];
  if (inside) {
    const sourceSpan = inside.endLine - inside.startLine;
    if (sourceSpan <= 0) return inside.top;
    const progress = clamp((sourceLine - inside.startLine) / sourceSpan, 0, 1);
    return inside.top + progress * Math.max(0, inside.bottom - inside.top);
  }

  const bySource = [...valid].sort((a, b) => a.startLine - b.startLine || a.top - b.top);
  const before = bySource.filter((anchor) => anchor.startLine <= sourceLine).at(-1);
  const after = bySource.find((anchor) => anchor.startLine > sourceLine);
  if (!before) return bySource[0]?.top ?? null;
  if (!after) return before.bottom;

  const sourceDistance = after.startLine - before.endLine;
  if (sourceDistance <= 0) return before.bottom;
  const progress = clamp((sourceLine - before.endLine) / sourceDistance, 0, 1);
  return before.bottom + progress * (after.top - before.bottom);
}

export function dedupeVisualSourceAnchors(
  anchors: readonly VisualSourceAnchor[],
): VisualSourceAnchor[] {
  const bySourceRange = new Map<string, VisualSourceAnchor>();
  for (const anchor of anchors) {
    const key = `${anchor.startLine}:${anchor.endLine}`;
    const current = bySourceRange.get(key);
    if (!current || anchor.bottom - anchor.top > current.bottom - current.top) {
      bySourceRange.set(key, anchor);
    }
  }
  return [...bySourceRange.values()];
}

function interpolateSourceRange(anchor: VisualSourceAnchor, offset: number): number {
  const height = anchor.bottom - anchor.top;
  const sourceSpan = anchor.endLine - anchor.startLine;
  if (height <= 0 || sourceSpan <= 0) return anchor.startLine;
  const progress = clamp((offset - anchor.top) / height, 0, 1);
  return Math.round(anchor.startLine + progress * sourceSpan);
}

function normalizeAnchors(anchors: readonly VisualSourceAnchor[]): VisualSourceAnchor[] {
  return anchors
    .filter((anchor) => (
      Number.isFinite(anchor.top)
      && Number.isFinite(anchor.bottom)
      && Number.isFinite(anchor.startLine)
      && Number.isFinite(anchor.endLine)
      && anchor.bottom >= anchor.top
      && anchor.endLine >= anchor.startLine
    ))
    .sort((a, b) => a.top - b.top || a.bottom - b.bottom || a.startLine - b.startLine);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isStructuralHtmlLine(line: string): boolean {
  return /^\s*<\/?(?:div|section|article|main|aside)\b[^>]*>\s*$/i.test(line);
}

function isHeadingLine(line: string): boolean {
  return /^\s{0,3}#{1,6}\s+\S/.test(line) || /^\s*<h[1-6]\b/i.test(line);
}

function isListItemLine(line: string): boolean {
  return /^(?:\s*>\s*)*\s*(?:[-+*]|\d{1,9}[.)])[ \t]+\S/.test(line);
}

function isMarkdownTableStart(markdownLines: readonly string[], line: number): boolean {
  const header = markdownLines[line] ?? "";
  const divider = markdownLines[line + 1] ?? "";
  return header.includes("|")
    && /^\s*\|?\s*:?-{3,}/.test(divider)
    && divider.includes("|");
}

function findContiguousEnd(
  markdownLines: readonly string[],
  start: number,
  predicate: (line: string, lineNumber: number) => boolean,
): number {
  let end = start;
  for (let line = start + 1; line < markdownLines.length; line++) {
    if (!predicate(markdownLines[line] ?? "", line)) break;
    end = line;
  }
  return end;
}

function findBlockEnd(
  markdownLines: readonly string[],
  start: number,
  predicate: (line: string) => boolean,
): number {
  for (let line = start; line < markdownLines.length; line++) {
    if (predicate(markdownLines[line] ?? "")) return line;
  }
  return Math.max(start - 1, markdownLines.length - 1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
