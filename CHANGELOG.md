## 0.1.6

- 将浏览器打开操作改为外部打开图标按钮，减少 QMD 预览工具栏占用。
- 保留可用和不可用状态下的 hover 提示；实时预览下不会弹出遮挡按钮的提示。
- 补充图标按钮的无障碍标签。

## 0.1.5

- 点击 `Quarto 渲染` 时先检测 Quarto CLI 是否可用。
- 未找到 Quarto CLI 时显示安装引导，而不是展示底层 `spawn quarto ENOENT` 错误。
- 补充文档说明：插件不会自动下载或安装 Quarto，实时预览不依赖 Quarto。

## 0.1.4

- 移除源码中的 eslint disable 指令注释，满足 Obsidian Community 源码审核要求。
- 将实时预览样式改为 constructable stylesheet，避免动态挂载 `style` 元素。
- 移除额外的内置模块列表依赖，改用 Node.js 内置 `module.builtinModules`。
- 将中文 README 标题改为 `QMD Preview`，与 manifest 展示名保持一致。

## 0.1.3

- 修正 manifest 描述，移除冗余的 `Obsidian` 字样并补充句末标点。
- GitHub Release 只发布 Obsidian 支持下载的 `manifest.json`、`main.js` 和 `styles.css`。
- 为 Release 资产增加 GitHub artifact attestations。
- 补充手动 Quarto 渲染使用文件系统和 `child_process` 的安全披露。

## 0.1.2

- 将 manifest 展示名改为 `QMD Preview`，符合 Obsidian Community 目录命名规则。
- 修正安装文档中的插件展示名。
- 修正版本脚本，确保 `versions.json` 始终记录当前发布版本。

## 0.1.1

- 接入 `eslint-plugin-obsidianmd`，补充 Obsidian 插件规范检查。
- 增加 GitHub Actions CI，在 push 和 PR 中运行版本校验、Release notes 校验、lint、测试和打包。
- 增加 `AGENTS.md`，记录 Agent 协作、验证和发版规则。
- GitHub Release notes 改为从 `CHANGELOG.md` 当前版本章节生成。
- 将最低 Obsidian 版本提升到 `1.7.2`，匹配当前使用的 Obsidian API。

## 0.1.0

- 初始化 QMD 预览插件。
- 支持 `.qmd` 文件识别和侧边栏实时预览。
- 支持 QMD 代码单元格、Quarto callout 和基础 crossref 占位转换。
- 支持手动调用 Quarto CLI 生成 HTML 预览。
- 支持大文件降级、内容 hash、过期渲染保护和本地安装脚本。
