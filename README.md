# QMD Preview

English | [简体中文](README.zh-CN.md)

QMD Preview is an Obsidian desktop plugin for editing `.qmd` files and previewing them in a side pane.

The live preview is designed for writing feedback. It converts the parts of QMD that Obsidian does not render directly into Obsidian-compatible Markdown, then lets Obsidian render the result. When you need the final Quarto output, you can run an explicit Quarto render from the preview pane.

## Features

- Registers `.qmd` files as editable Markdown files in Obsidian.
- Shows a side-pane live preview for the active QMD file.
- Converts common Quarto syntax for preview: executable code cells, callouts, Pandoc divs, heading attributes, figure captions, image attributes, and cross-reference placeholders.
- Applies CSS referenced by the current QMD frontmatter or nearby `_metadata.yml` files to the live preview.
- Includes a built-in image lightbox for preview images.
- Can run `quarto render` manually and display the generated HTML preview.
- Keeps live preview safe by not executing document code.

## Requirements

- Obsidian desktop.
- Node.js 20 or later for development or local packaging.
- Quarto CLI is optional. It is only needed for the manual `Quarto 渲染` preview.

This plugin is desktop-only because Quarto rendering and local file packaging require desktop APIs.

## Installation

### Agent-assisted install

Send this prompt to a local coding agent and replace `<VAULT_PATH>` with your Obsidian vault path.

```text
Install the "QMD Preview" Obsidian plugin into this Vault: <VAULT_PATH>

Plugin information:
- Plugin ID: qmd-preview
- GitHub repository: git@github.com:elliotxx/obsidian-qmd-preview.git
- Target Obsidian vault: <VAULT_PATH>

Install steps:
- Clone or update the repository in the local workspace.
- Prefer the latest zip from GitHub Releases. If no release package exists, run npm install && npm run package.
- Extract the zip, or use the locally generated release/qmd-preview-v{version}.zip.
- Copy the extracted qmd-preview/ directory to <VAULT_PATH>/.obsidian/plugins/qmd-preview/.
- Check that manifest.json, main.js, and styles.css exist in the plugin directory.
- Confirm manifest.json has id qmd-preview and name QMD 预览.

Output:
- Repository path.
- Vault plugin directory.
- Current commit or local dirty state.
- Install status.
- Any manual Obsidian steps still needed.
```

After installation, enable `QMD 预览` in Obsidian's Community plugins settings.

### Manual install

Download `qmd-preview-v{version}.zip` from GitHub Releases, extract it, and copy the `qmd-preview/` folder to:

```text
<VAULT_PATH>/.obsidian/plugins/qmd-preview/
```

The plugin directory must contain:

```text
manifest.json
main.js
styles.css
```

### Development install

```bash
npm install
npm run build
npm run install-local -- --vault <VAULT_PATH>
```

## Usage

1. Open a `.qmd` file in Obsidian.
2. Run the command `打开 QMD 预览` or click the ribbon icon.
3. Edit the QMD file; the side-pane preview updates automatically.
4. Use `实时预览` for writing feedback.
5. Use `Quarto 渲染` when you need to check the official Quarto HTML output.

The first manual Quarto render asks for confirmation because Quarto may execute code from the document.

## How It Works

Live preview does not call Quarto. It reads the active QMD content, strips YAML frontmatter from the rendered body, transforms supported QMD/Pandoc syntax into HTML or Obsidian Markdown, scopes discovered CSS to the preview pane, and renders through Obsidian's `MarkdownRenderer`.

Manual Quarto render calls the configured Quarto executable, writes HTML to a temporary or configured output directory, inlines reachable stylesheets, and displays the HTML inside the preview pane.

## Limitations

The live preview is intentionally partial. It does not execute Python, R, Julia, shell, or other code cells. It does not fully implement bibliography processing, numbered cross references, Quarto filters, Quarto extensions, project-level `_quarto.yml` layout behavior, or every Pandoc attribute edge case.

Treat the live preview as a fast editing view. Treat Quarto render as the final output check.

## Development

```bash
npm install
npm run lint
npm test
npm run package
```

Useful commands:

```bash
npm run dev
npm run build
npm run install-local -- --vault <VAULT_PATH>
npm run release:validate
```

Release artifacts are generated under `release/`:

```text
release/manifest.json
release/main.js
release/styles.css
release/qmd-preview-v{version}.zip
```

## Release

Maintainers can use the project skill at `.agents/skills/release-qmd-preview/SKILL.md`.

The manual release flow is:

```bash
make version VERSION_TYPE=patch
npm run release:validate
npm run lint
npm test
npm run package
git tag {version}
git push origin {version}
```

Pushing the tag triggers the GitHub Actions release workflow.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

Before opening a pull request, run:

```bash
npm run lint
npm test
npm run package
```

## Security

See [SECURITY.md](SECURITY.md).

The plugin does not store accounts, passwords, cookies, or tokens. Live preview does not execute QMD code. Manual Quarto render can execute document code and should only be used for documents you trust.

## License

[MIT](LICENSE)
