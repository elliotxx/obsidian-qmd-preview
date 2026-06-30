import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await fsp.readFile(path.join(root, "manifest.json"), "utf8"));
const pluginId = manifest.id;
const REQUIRED = ["manifest.json", "main.js", "styles.css"];

function resolveVaultPaths() {
  const paths = [];
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--vault" && args[i + 1]) {
      paths.push(path.resolve(args[i + 1]));
      i++;
    }
  }

  if (process.env.OBSIDIAN_VAULT) {
    for (const p of process.env.OBSIDIAN_VAULT.split(path.delimiter)) {
      const trimmed = p.trim();
      if (trimmed) paths.push(path.resolve(trimmed));
    }
  }

  const configPath = path.join(root, ".obsidian-vaults");
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.split("#")[0].trim();
      if (trimmed) paths.push(path.resolve(trimmed));
    }
  }

  return [...new Set(paths)];
}

async function installToVault(vaultPath) {
  const obsidianDir = path.join(vaultPath, ".obsidian");
  if (!fs.existsSync(obsidianDir)) {
    console.warn(`Skip: ${vaultPath} (no .obsidian directory)`);
    return false;
  }

  const pluginDir = path.join(obsidianDir, "plugins", pluginId);
  await fsp.mkdir(pluginDir, { recursive: true });

  for (const file of REQUIRED) {
    const src = path.join(root, file);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing build artifact: ${file}. Run "npm run build" first.`);
    }
    await fsp.copyFile(src, path.join(pluginDir, file));
  }

  console.log(`Installed ${pluginId} -> ${pluginDir}`);
  return true;
}

const vaults = resolveVaultPaths();

if (vaults.length === 0) {
  console.error("No vault path configured.");
  console.error("");
  console.error("Usage:");
  console.error("  npm run install-local -- --vault /path/to/vault");
  console.error("  OBSIDIAN_VAULT=/path/to/vault npm run install-local");
  console.error("  echo /path/to/vault > .obsidian-vaults && npm run install-local");
  process.exit(1);
}

let success = 0;
let failed = 0;
for (const vault of vaults) {
  try {
    const ok = await installToVault(vault);
    if (ok) success++;
  } catch (error) {
    console.error(`Error installing to ${vault}: ${error.message}`);
    failed++;
  }
}

console.log(`\nDone: ${success} vault(s) updated, ${failed} failed.`);
if (failed > 0) process.exit(1);
