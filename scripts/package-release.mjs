import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await fsp.readFile(path.join(root, "manifest.json"), "utf8"));
const releaseDir = path.join(root, "release");
const packageDir = path.join(releaseDir, manifest.id);
const zipName = `${manifest.id}-v${manifest.version}.zip`;
const releaseFiles = ["manifest.json", "main.js", "styles.css"];

await fsp.rm(releaseDir, { recursive: true, force: true });
await fsp.mkdir(packageDir, { recursive: true });

for (const file of releaseFiles) {
  const source = path.join(root, file);
  await fsp.copyFile(source, path.join(releaseDir, file));
  await fsp.copyFile(source, path.join(packageDir, file));
}

if (process.platform === "darwin" || process.platform === "linux") {
  execFileSync("zip", ["-r", zipName, manifest.id], {
    cwd: releaseDir,
    stdio: "inherit",
  });
  await fsp.rm(packageDir, { recursive: true, force: true });
} else {
  throw new Error("zip command is required to create the release artifact on this platform.");
}

console.log(`Release assets ready: ${releaseFiles.map((file) => path.join(releaseDir, file)).join(", ")}`);
console.log(`Release package ready: ${path.join(releaseDir, zipName)}`);
