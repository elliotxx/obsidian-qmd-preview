# 贡献说明

## 工程约定

- 用户可见文案使用中文。
- 代码日志使用英文。
- 不提交本机绝对路径、账号、Cookie、token 或私有链接。
- UI 变更附截图或明确说明未截图原因。
- 版本号同时维护在 `manifest.json`、`versions.json`、`package.json`。

## 质量基线

```bash
npm test
npm run lint
npm run package
```

## 本地安装

```bash
npm run build
npm run install-local -- --vault /path/to/vault
```
