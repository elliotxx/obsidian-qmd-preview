# QMD 预览

这是一个 Obsidian 桌面插件，用于在 Obsidian 中编辑 `.qmd` 文件，并在侧边栏实时预览。

## 核心能力

- 将 `.qmd` 注册为 Obsidian 可编辑的 Markdown 文件。
- 在侧边栏显示当前 QMD 文件的实时预览。
- 实时预览只做轻量转换，不执行代码。
- 支持将 Quarto 代码单元格显示为普通代码块。
- 支持将 Quarto callout 显示为 Obsidian callout。
- 支持手动调用 Quarto CLI 生成官方 HTML 预览。

## 工作原理

实时预览不会调用完整 Quarto 渲染器。插件监听当前 QMD 编辑器内容，把 Obsidian 不直接识别的少量 QMD 语法临时转换为 Obsidian Markdown，再交给 Obsidian 自带的 MarkdownRenderer 渲染。

手动点击“Quarto 渲染”时，插件调用本机 `quarto render` 生成 HTML，并在侧边栏展示结果。这个过程可能执行文档中的代码，因此默认需要用户确认。

## 安装

### Agent 安装

把下面的 Prompt 发给本机 Agent，并替换 `<VAULT_PATH>` 和 `<GITHUB_REPO_URL>`。

```text
将 “QMD 预览” Obsidian 插件安装到这个 Vault：<VAULT_PATH>

插件信息：
- 插件 ID：qmd-preview
- GitHub 仓库：<GITHUB_REPO_URL>
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

### 开发安装

```bash
npm install
npm run build
npm run install-local -- --vault <VAULT_PATH>
```

安装后，在 Obsidian 中启用插件 `QMD 预览`。

### 手动安装

从 GitHub Releases 下载 `qmd-preview-v{version}.zip`，解压后将 `qmd-preview/` 复制到：

```text
<VAULT_PATH>/.obsidian/plugins/qmd-preview/
```

## 使用

1. 打开一个 `.qmd` 文件。
2. 执行命令“打开 QMD 预览”。
3. 在右侧边栏查看实时预览。
4. 需要确认最终 Quarto 效果时，点击“Quarto 渲染”。

## 边界

实时预览不执行 Python、R、Julia 或 shell 代码，也不完整支持 bibliography、crossref 自动编号、Quarto filters、extensions 和 `_quarto.yml` 布局配置。最终效果以 Quarto 官方渲染为准。

## 开发

```bash
make install
make test
make package
```

发布包路径：

```text
release/qmd-preview-v{version}.zip
```
