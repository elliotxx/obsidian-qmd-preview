import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await fsp.readFile(path.join(root, "manifest.json"), "utf8"));
const changelogPath = path.join(root, "CHANGELOG.md");
const changelog = await fsp.readFile(changelogPath, "utf8");
const version = manifest.version;
const lines = changelog.split(/\r?\n/);
const startIndex = lines.findIndex((line) => line.trim() === `## ${version}`);

if (startIndex === -1) {
  throw new Error(`CHANGELOG.md does not contain a section for version ${version}.`);
}

let endIndex = lines.length;
for (let index = startIndex + 1; index < lines.length; index += 1) {
  if (/^##\s+\S/.test(lines[index] ?? "")) {
    endIndex = index;
    break;
  }
}

const notes = lines.slice(startIndex + 1, endIndex).join("\n").trim();
if (!notes) {
  throw new Error(`CHANGELOG.md section for version ${version} is empty.`);
}

const releaseDir = path.join(root, "release");
await fsp.mkdir(releaseDir, { recursive: true });
await fsp.writeFile(path.join(releaseDir, "release-notes.md"), `${notes}\n`);

console.log(`Release notes ready: release/release-notes.md (${version})`);
