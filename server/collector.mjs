import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.mjs";
import { openDatabase, replaceFileRecords, shouldScanFile } from "./db.mjs";
import { parseCodexJsonl } from "./parser.mjs";

export async function scanOnce(db, roots = config.codexRoots) {
  const files = [];
  for (const root of roots) {
    files.push(...(await listJsonlFiles(root)));
  }

  let scanned = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of files) {
    try {
      const stat = await fs.stat(filePath);
      if (!shouldScanFile(db, filePath, stat)) {
        skipped += 1;
        continue;
      }

      const content = await fs.readFile(filePath, "utf8");
      const parsed = parseCodexJsonl(content, filePath);
      replaceFileRecords(db, filePath, parsed, stat);
      scanned += 1;
    } catch (error) {
      failed += 1;
      console.warn(`[collector] failed to scan ${filePath}: ${error.message}`);
    }
  }

  return {
    scanned,
    skipped,
    failed,
    totalFiles: files.length,
    scannedAt: new Date().toISOString(),
  };
}

async function listJsonlFiles(root) {
  try {
    const stat = await fs.stat(root);
    if (stat.isFile() && root.endsWith(".jsonl")) return [root];
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonlFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }

  return files;
}

if (process.argv.includes("--once") && process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDatabase(config.dbPath);
  scanOnce(db)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      db.close();
    })
    .catch((error) => {
      console.error(error);
      db.close();
      process.exit(1);
    });
}

