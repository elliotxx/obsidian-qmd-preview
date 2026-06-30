# QMD 预览

[English](README.md) | 简体中文

QMD 预览是一个 Obsidian 桌面插件，用于在 Obsidian 中编辑 `.qmd` 文件，并在侧边栏实时预览。

实时预览面向写作过程中的快速反馈。它把 Obsidian 无法直接渲染的一部分 QMD 语法转换成 Obsidian 可渲染的 Markdown，再交给 Obsidian 渲染。需要确认最终效果时，可以在预览栏里手动执行 Quarto 渲染。

## 功能

- 将 `.qmd` 文件注册为 Obsidian 可编辑的 Markdown 文件。
- 在侧边栏显示当前 QMD 文件的实时预览。
- 转换常见 Quarto 语法：可执行代码单元格、callout、Pandoc div、标题属性、图片题注、图片属性和交叉引用占位。
- 读取当前 QMD frontmatter 或上级 `_metadata.yml` 中引用的 CSS，并应用到实时预览。
- 内置图片 lightbox，支持在预览中点击查看大图。
- 支持手动调用 `quarto render` 并展示生成的 HTML 预览。
- 实时预览不执行文档代码。

## 环境要求

- Obsidian 桌面版。
- Node.js 20 或更高版本，用于开发或本地打包。
- Quarto CLI 可选，只在手动使用“Quarto 渲染”时需要。

这个插件只支持桌面端，因为 Quarto 渲染和本地文件打包依赖桌面 API。

## 安装

### Agent 安装

把下面的 Prompt 发给本机 Agent，并替换 `<VAULT_PATH>`。

```text
将 “QMD 预览” Obsidian 插件安装到这个 Vault：<VAULT_PATH>

插件信息：
- 插件 ID：qmd-preview
- GitHub 仓库：git@github.com:elliotxx/obsidian-qmd-preview.git
- 目标 Obsidian vault：<VAULT_PATH>

安装动作：
- clone 或更新仓库到本机工作区。
- 优先使用 GitHub Releases 中的最新 zip；如果没有发布包，再执行 npm install && npm run package。
- 解压 zip，或使用本地生成的 release/qmd-preview-v{version}.zip。
- 将解压后的 qmd-preview/ 目录复制到 <VAULT_PATH>/.obsidian/plugins/qmd-preview/。
- 检查插件目录中存在 manifest.json、main.js、styles.css。
- 确认 manifest.json 中 id 是 qmd-preview，name 是 QMD 预览。

输出：
- 仓库路径。
- vault 插件目录。
- 当前 commit 或本地未提交状态。
- 安装状态。
- 需要手动完成的 Obsidian 操作。
```

安装后，在 Obsidian 的第三方插件设置中启用 `QMD 预览`。

### 手动安装

从 GitHub Releases 下载 `qmd-preview-v{version}.zip`，解压后将 `qmd-preview/` 目录复制到：

```text
<VAULT_PATH>/.obsidian/plugins/qmd-preview/
```

插件目录中必须包含：

```text
manifest.json
main.js
styles.css
```

### 开发安装

```bash
npm install
npm run build
npm run install-local -- --vault <VAULT_PATH>
```

## 使用

1. 在 Obsidian 中打开 `.qmd` 文件。
2. 执行命令“打开 QMD 预览”，或点击左侧 ribbon 图标。
3. 编辑 QMD 文件，侧边栏预览会自动更新。
4. 写作时使用“实时预览”。
5. 需要确认 Quarto 官方 HTML 输出时，点击“Quarto 渲染”。

首次手动执行 Quarto 渲染前会要求确认，因为 Quarto 可能执行文档中的代码。

## 工作原理

实时预览不会调用 Quarto。插件读取当前 QMD 内容，从渲染正文中移除 YAML frontmatter，把支持的 QMD/Pandoc 语法转换成 HTML 或 Obsidian Markdown，把发现的 CSS 限定在预览栏作用域内，然后通过 Obsidian 的 `MarkdownRenderer` 渲染。

手动 Quarto 渲染会调用配置的 Quarto 可执行文件，把 HTML 写入临时目录或配置的输出目录，内联可访问的样式文件，并在预览栏中展示 HTML。

## 边界

实时预览是有意做成部分支持。它不执行 Python、R、Julia、shell 或其他代码单元格，也不完整实现 bibliography、自动编号交叉引用、Quarto filters、Quarto extensions、项目级 `_quarto.yml` 布局行为和所有 Pandoc 属性边界情况。

实时预览适合快速写作反馈。最终效果以 Quarto 渲染为准。

## 开发

```bash
npm install
npm run lint
npm test
npm run package
```

常用命令：

```bash
npm run dev
npm run build
npm run install-local -- --vault <VAULT_PATH>
npm run release:validate
```

发布产物生成在 `release/`：

```text
release/manifest.json
release/main.js
release/styles.css
release/qmd-preview-v{version}.zip
```

## 发版

维护者可以使用项目级 skill：`.agents/skills/release-qmd-preview/SKILL.md`。

手动发版流程：

```bash
make version VERSION_TYPE=patch
npm run release:validate
npm run lint
npm test
npm run package
git tag {version}
git push origin {version}
```

推送 tag 后，GitHub Actions 会创建 Release。

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

提交 PR 前请运行：

```bash
npm run lint
npm test
npm run package
```

## 安全

见 [SECURITY.md](SECURITY.md)。

插件不保存账号、密码、Cookie 或 token。实时预览不执行 QMD 代码。手动 Quarto 渲染可能执行文档代码，只应对可信文档使用。

## 许可证

[MIT](LICENSE)
