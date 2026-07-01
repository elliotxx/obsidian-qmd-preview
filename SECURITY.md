# Security

- Only the latest version is supported.
- The plugin does not store accounts, passwords, cookies, or tokens.
- Live preview does not execute code from QMD documents.
- Manual Quarto render may execute document code and requires user confirmation before first use.
- Manual Quarto render uses Node.js filesystem APIs for temporary output and `child_process` to run the local `quarto` executable.
- The plugin does not download or install Quarto automatically.
- When reporting issues, do not publicly share private document links, sensitive screenshots, or local paths.

## 中文

- 仅支持最新版本。
- 插件不保存账号、密码、Cookie 或 token。
- 实时预览不执行 QMD 中的代码。
- Quarto 手动渲染可能执行文档中的代码，首次执行前需要人工确认。
- Quarto 手动渲染会使用 Node.js 文件系统 API 创建临时输出，并通过 `child_process` 调用本机 `quarto` 可执行文件。
- 插件不会自动下载或安装 Quarto。
- 反馈问题时不要公开粘贴私有文档链接、截图中的敏感信息或本地路径。
