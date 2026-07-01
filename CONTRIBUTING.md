# Contributing

## Project rules

- Keep user-facing plugin UI text in Chinese until localization is added.
- Keep code logs in English.
- Do not commit local absolute paths, accounts, cookies, tokens, or private links.
- Include screenshots for UI changes, or explain why screenshots are not included.
- Keep the version in `manifest.json`, `versions.json`, and `package.json` consistent.

## Quality baseline

```bash
npm test
npm run lint
npm run package
```

## Local install

```bash
npm run build
npm run install-local -- --vault /path/to/vault
```

## 中文

### 工程约定

- 用户可见插件文案在加入本地化前使用中文。
- 代码日志使用英文。
- 不提交本机绝对路径、账号、Cookie、token 或私有链接。
- UI 变更附截图，或明确说明未截图原因。
- 版本号同时维护在 `manifest.json`、`versions.json`、`package.json`。

### 质量基线

```bash
npm test
npm run lint
npm run package
```

### 本地安装

```bash
npm run build
npm run install-local -- --vault /path/to/vault
```
