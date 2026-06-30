# Agent Guide

## Project

This repository contains the `qmd-preview` Obsidian desktop plugin. It lets users edit `.qmd` files in Obsidian and preview supported QMD syntax in a side pane.

## Rules

- Keep user-facing plugin UI text in Chinese unless a localization layer is added.
- Keep code logs and thrown developer-facing errors in English where practical.
- Do not commit vault content, local absolute paths, cookies, tokens, screenshots with private data, or generated dependency folders.
- Do not commit `node_modules/`, `main.js`, or `release/`; they are generated artifacts.
- Treat live preview as safe by default. Do not add code execution to live preview.
- Quarto rendering may execute document code and must remain an explicit user action.

## Checks

Run these before committing code changes:

```bash
npm run release:validate
npm run release:notes
npm run lint
npm test
npm run package
```

For documentation-only changes, at minimum run:

```bash
npm run release:validate
git diff --check
```

## Release

Use the project skill:

```text
.agents/skills/release-qmd-preview/SKILL.md
```

Release notes come from the matching version section in `CHANGELOG.md`. Before tagging a release, make sure `CHANGELOG.md`, `manifest.json`, `versions.json`, `package.json`, and `package-lock.json` describe the same release.

Tags must be exact semver strings such as `0.1.1`; do not prefix tags with `v`.

## Git

- Use Conventional Commits.
- Commit subject must be English.
- Commit body, when present, should be Chinese.
- Inspect staged diff before committing.
- Never force push or rewrite published tags unless the user explicitly requests it.
