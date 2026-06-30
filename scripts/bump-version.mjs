import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const type = process.argv[2] || process.env.VERSION_TYPE || "patch";
const allowed = new Set(["patch", "minor", "major"]);

if (!allowed.has(type)) {
  throw new Error(`Unsupported version type: ${type}. Use patch, minor, or major.`);
}

async function readJson(file) {
  return JSON.parse(await fsp.readFile(path.join(root, file), "utf8"));
}

async function writeJson(file, value) {
  await fsp.writeFile(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}

function nextVersion(version, bumpType) {
  const parts = String(version).split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  const [major, minor, patch] = parts;
  if (bumpType === "major") return `${major + 1}.0.0`;
  if (bumpType === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function compareVersions(a, b) {
  const left = String(a).split(".").map((part) => Number.parseInt(part, 10));
  const right = String(b).split(".").map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function compactVersions(versions) {
  const compacted = {};
  let previousMinAppVersion = null;
  for (const version of Object.keys(versions).sort(compareVersions)) {
    const minAppVersion = versions[version];
    if (minAppVersion !== previousMinAppVersion) {
      compacted[version] = minAppVersion;
      previousMinAppVersion = minAppVersion;
    }
  }
  return compacted;
}

const pkg = await readJson("package.json");
const manifest = await readJson("manifest.json");
const versions = await readJson("versions.json");
const lock = await readJson("package-lock.json");

const current = pkg.version;
const next = nextVersion(current, type);

pkg.version = next;
manifest.version = next;
const compactedVersions = compactVersions(versions);
const latestVersion = Object.keys(compactedVersions).sort(compareVersions).at(-1);
if (!latestVersion || compactedVersions[latestVersion] !== manifest.minAppVersion) {
  compactedVersions[next] = manifest.minAppVersion;
}

if (lock.version) lock.version = next;
if (lock.packages && lock.packages[""]) {
  lock.packages[""].version = next;
}

await writeJson("package.json", pkg);
await writeJson("manifest.json", manifest);
await writeJson("versions.json", compactedVersions);
await writeJson("package-lock.json", lock);

console.log(`Version bumped: ${current} -> ${next}`);
