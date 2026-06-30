## 质量基线

## 命令

```bash
npm run lint
npm test
npm run release:validate
npm run package
```

## 检查项

- ESLint 无报错。
- TypeScript 构建通过。
- 转换器单元测试通过。
- `package.json`、`manifest.json`、`versions.json` 版本一致。
- 发布资产路径：`release/manifest.json`、`release/main.js`、`release/styles.css`。
- 发布包路径：`release/qmd-preview-v{version}.zip`。

发布包和 GitHub Release 资产包含：

```text
manifest.json
main.js
styles.css
```

## 边界

- 默认配置不包含私人文档路径。
- Quarto CLI 不随插件分发。
- 实时预览不执行 QMD 中的代码。
- 文档和配置不包含本机绝对图片引用。
