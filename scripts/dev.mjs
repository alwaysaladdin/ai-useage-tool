import { spawn } from "node:child_process";

const commands = [
  {
    name: "api",
    command: "node",
    args: ["--no-warnings=ExperimentalWarning", "server/index.mjs"],
  },
  {
    name: "vite",
    command: "npx",
    args: ["vite", "--host", "127.0.0.1"],
  },
];

let shuttingDown = false;

const children = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] stopped by ${signal}`);
      return;
    }
    console.log(`[${name}] exited with code ${code}`);
    if (code && !shuttingDown) {
      shutdown(code);
    }
  });

  return child;
});

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
