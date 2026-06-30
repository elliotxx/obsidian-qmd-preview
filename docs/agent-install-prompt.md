## Agent 安装模板

变量：

- `<VAULT_PATH>`：Obsidian vault 路径。
- `<GITHUB_REPO_URL>`：GitHub 仓库地址。

```text
将 “QMD 预览” Obsidian 插件安装到这个 Vault：<VAULT_PATH>

插件信息：
- 插件 ID：qmd-preview
- GitHub 仓库：<GITHUB_REPO_URL>
- 目标 Obsidian vault：<VAULT_PATH>

约束：
- 使用 GitHub 仓库或 GitHub Releases，不访问 Obsidian 官方插件商店。
- 本地存在未提交改动时，先报告状态，不覆盖用户改动。
- 不读取、打印或上传 Obsidian `data.json`、私有文档内容或本地敏感路径。

安装动作：
- clone 或更新 `<GITHUB_REPO_URL>` 到本机工作区。
- 优先使用 GitHub Releases 中的最新 zip；如果没有发布包，再执行 `npm install && npm run package`。
- 解压 zip。
- 将解压后的 `qmd-preview/` 目录复制到 `<VAULT_PATH>/.obsidian/plugins/qmd-preview/`。
- 检查插件目录中存在 `manifest.json`、`main.js`、`styles.css`。
- 确认 `manifest.json` 中 `id` 是 `qmd-preview`，`name` 是 `QMD 预览`。

输出：
- 仓库路径。
- vault 插件目录。
- 当前 commit 或本地未提交状态。
- 安装状态。
- 需要手动完成的 Obsidian 操作。
```
