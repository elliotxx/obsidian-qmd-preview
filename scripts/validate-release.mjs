import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function readJson(file) {
  return JSON.parse(await fsp.readFile(path.join(root, file), "utf8"));
}

const pkg = await readJson("package.json");
const manifest = await readJson("manifest.json");
const versions = await readJson("versions.json");
const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "";

if (pkg.version !== manifest.version) {
  throw new Error(`package.json version ${pkg.version} does not match manifest.json version ${manifest.version}.`);
}

if (versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error(`versions.json does not map ${manifest.version} to ${manifest.minAppVersion}.`);
}

if (tag && tag !== manifest.version) {
  throw new Error(`Git tag ${tag} does not match release version ${manifest.version}.`);
}

console.log(`Release metadata valid: ${manifest.id} ${manifest.version}`);
