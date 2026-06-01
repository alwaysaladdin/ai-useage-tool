import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(path.join(projectRoot, ".env"));

export const config = {
  projectRoot,
  port: Number(process.env.CODEX_USAGE_PORT || 4177),
  host: process.env.CODEX_USAGE_HOST || "127.0.0.1",
  dbPath: path.resolve(
    process.env.CODEX_USAGE_DB || path.join(projectRoot, "data", "codex-usage.sqlite"),
  ),
  scanIntervalMs: Number(process.env.CODEX_USAGE_SCAN_INTERVAL_MS || 10_000),
  codexRoots: (process.env.CODEX_USAGE_SOURCE_ROOTS || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((entry) => resolveUserPath(entry)),
  codexHome: resolveUserPath(process.env.CODEX_HOME || path.join(os.homedir(), ".codex")),
};

if (config.codexRoots.length === 0) {
  config.codexRoots.push(
    path.join(config.codexHome, "sessions"),
    path.join(config.codexHome, "archived_sessions"),
  );
}

function resolveUserPath(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}
