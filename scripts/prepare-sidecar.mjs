import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const binariesDir = path.join(projectRoot, "src-tauri", "binaries");
const sidecarBaseName = "codex-usage-node";
const targetTriple = detectTargetTriple();
const extension = process.platform === "win32" ? ".exe" : "";
const destination = path.join(binariesDir, `${sidecarBaseName}-${targetTriple}${extension}`);

fs.mkdirSync(binariesDir, { recursive: true });
fs.copyFileSync(process.execPath, destination);
fs.chmodSync(destination, 0o755);

console.log(JSON.stringify({
  sidecar: path.relative(projectRoot, destination),
  node: process.execPath,
  targetTriple,
}, null, 2));

function detectTargetTriple() {
  if (process.env.TAURI_ENV_TARGET_TRIPLE) return process.env.TAURI_ENV_TARGET_TRIPLE;

  try {
    const output = execFileSync("rustc", ["--print", "host-tuple"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (output) return output;
  } catch {
    // Rust may not be installed yet. Fall back to the current Node platform so
    // the sidecar can still be prepared before the first Tauri build attempt.
  }

  if (process.platform === "darwin" && process.arch === "arm64") return "aarch64-apple-darwin";
  if (process.platform === "darwin" && process.arch === "x64") return "x86_64-apple-darwin";
  if (process.platform === "linux" && process.arch === "x64") return "x86_64-unknown-linux-gnu";
  if (process.platform === "linux" && process.arch === "arm64") return "aarch64-unknown-linux-gnu";
  if (process.platform === "win32" && process.arch === "x64") return "x86_64-pc-windows-msvc";
  if (process.platform === "win32" && process.arch === "arm64") return "aarch64-pc-windows-msvc";

  throw new Error(`Unsupported sidecar target: ${process.platform}/${process.arch}`);
}
