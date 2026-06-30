---
name: release-qmd-preview
description: Release the QMD Preview Obsidian plugin in this repository. Use when the user says they want to release, publish a version, run the release flow, or "我要发版" for obsidian-qmd-preview.
---

# Release QMD Preview

Use this skill only in the `obsidian-qmd-preview` repository.

## Hard Rules

- Release from `main` and sync with `origin/main` before changing versions.
- Default to a patch release when the user does not specify `major`, `minor`, or `patch`.
- Use an exact semver tag such as `0.1.1`; do not prefix tags with `v`.
- Keep `CHANGELOG.md` as the source for GitHub Release notes.
- Never force push, delete tags, or overwrite an existing release without explicit user approval.
- Stop if the working tree has unrelated changes. Do not include vault files, local notes, `.env`, `node_modules`, or generated temp files.
- Do not run Quarto or read user vault content during release. Release validation is repository-only.

## Workflow

1. Preflight:
   - Run `pwd`, `git status --short --branch`, and `git remote -v`.
   - Confirm the current repo is `obsidian-qmd-preview` and `origin` points to `git@github.com:elliotxx/obsidian-qmd-preview.git`.
   - Run `git fetch origin main --tags`.
   - If clean, run `git switch main` and `git pull --ff-only origin main`.
   - If dirty, inspect the diff. Continue only when changes are release-related and the user asked to include them; otherwise stop and report the files.

2. Choose and apply the version:
   - If the user specified `major`, `minor`, or `patch`, use that.
   - If not specified, use `patch`.
   - Run `make version VERSION_TYPE=<type>`.
   - Read the new version from `manifest.json`.
   - Verify `package.json`, `manifest.json`, and `versions.json` changed consistently.
   - Add or update the matching `## <version>` section in `CHANGELOG.md`.

3. Validate:
   - Run `npm run release:validate`.
   - Run `npm run release:notes`.
   - Run `npm run lint`.
   - Run `npm test`.
   - Run `npm run package`.
   - Run `npm audit --omit=dev --registry=https://registry.npmjs.org`.
   - Run `git diff --check`.
   - Check that these assets exist:
     - `release/manifest.json`
     - `release/main.js`
     - `release/styles.css`
     - `release/qmd-preview-v<version>.zip`
   - Inspect the zip with `zipinfo -1 release/qmd-preview-v<version>.zip`; it must contain only `qmd-preview/manifest.json`, `qmd-preview/main.js`, and `qmd-preview/styles.css`.

4. Commit:
   - Stage only release-relevant files, normally `package.json`, `package-lock.json`, `manifest.json`, `versions.json`, and `CHANGELOG.md`.
   - If release tooling or docs intentionally changed, stage those files too.
   - Run `git diff --cached --check` and inspect `git diff --cached --stat`.
   - Commit with `chore: bump version to <version>`.
   - Use a Chinese commit body if a body is needed.
   - Push `main` to origin.

5. Tag and publish:
   - Ensure the tag does not already exist:
     - `git tag --list <version>`
     - `git ls-remote --tags origin <version>`
   - Run `git tag <version>`.
   - Run `git push origin <version>`.
   - The GitHub Actions release workflow publishes the release assets from `release/`.

6. Check the release:
   - If `gh` is available, run:
     - `gh run list --workflow Release --limit 1`
     - `gh run watch <run-id>` when the run is still active
     - `gh release view <version>` after the run succeeds
   - If `gh` is unavailable, report the Actions page:
     - `https://github.com/elliotxx/obsidian-qmd-preview/actions/workflows/release.yml`

## Failure Handling

- If validation fails before commit, do not tag. Report the failing command and leave the tree for diagnosis.
- If `npm run release:notes` fails, update `CHANGELOG.md` instead of using generated GitHub notes.
- If push of `main` fails with a fast-forward requirement, run `git pull --rebase origin main` only when the tree is otherwise clean, then retry.
- If tag push succeeds but release workflow fails, do not create another tag. Fix the workflow or assets, push a follow-up commit if needed, and rerun the workflow for the same tag.

## Final Response

Report in Chinese:

- released version
- commit hash
- tag
- validation commands run
- release asset names
- release notes source
- GitHub Actions or GitHub Release status
