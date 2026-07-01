import esbuild from "esbuild";
import { builtinModules } from "node:module";
import process from "node:process";

const production = process.argv.includes("production");
const watch = process.argv.includes("--watch");
const nodeBuiltins = Array.from(new Set(builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`])));

const context = await esbuild.context({
  banner: {
    js: "/* THIS FILE IS GENERATED. Edit src/main.ts instead. */",
  },
  bundle: true,
  entryPoints: ["src/main.ts"],
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...nodeBuiltins,
  ],
  format: "cjs",
  logLevel: "info",
  minify: production,
  outfile: "main.js",
  platform: "node",
  sourcemap: production ? false : "inline",
  target: "es2022",
  treeShaking: true,
});

if (watch) {
  await context.watch();
  console.log("Watching for changes...");
} else {
  await context.rebuild();
  await context.dispose();
}
