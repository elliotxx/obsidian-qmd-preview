# Security

- Only the latest version is supported.
- The plugin does not store accounts, passwords, cookies, or tokens.
- Live preview does not execute code from QMD documents.
- Manual Quarto render and HTML export may execute document code and require user confirmation before first use.
- Manual Quarto render and HTML export use Node.js filesystem APIs for temporary output and `child_process` to run the local `quarto` executable. HTML export may also write a user-chosen file.
- The plugin does not download or install Quarto automatically.
- When reporting issues, do not publicly share private document links, sensitive screenshots, or local paths.

## 中文

- 仅支持最新版本。
- 插件不保存账号、密码、Cookie 或 token。
- 实时预览不执行 QMD 中的代码。
- Quarto 手动渲染和 HTML 导出可能执行文档中的代码，首次执行前需要人工确认。
- Quarto 手动渲染和 HTML 导出会使用 Node.js 文件系统 API 创建临时输出，并通过 `child_process` 调用本机 `quarto` 可执行文件。HTML 导出还可能写入用户选择的文件。
- 插件不会自动下载或安装 Quarto。
- 反馈问题时不要公开粘贴私有文档链接、截图中的敏感信息或本地路径。
