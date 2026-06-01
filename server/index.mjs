import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { config } from "./config.mjs";
import { openDatabase, getSummary } from "./db.mjs";
import { scanOnce } from "./collector.mjs";

const db = openDatabase(config.dbPath);
let lastScan = null;
let scanPromise = null;

async function runScan() {
  if (scanPromise) return scanPromise;
  scanPromise = scanOnce(db)
    .then((result) => {
      lastScan = result;
      return result;
    })
    .finally(() => {
      scanPromise = null;
    });
  return scanPromise;
}

await runScan();
setInterval(() => {
  runScan().catch((error) => console.warn(`[api] scheduled scan failed: ${error.message}`));
}, config.scanIntervalMs).unref();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      response.writeHead(204, corsHeaders());
      response.end();
      return;
    }

    if (url.pathname === "/api/summary" && request.method === "GET") {
      const summary = getSummary(db, url.searchParams.get("range") || "today");
      sendJson(response, 200, {
        ...summary,
        lastScan,
        scanInProgress: Boolean(scanPromise),
        config: publicConfig(),
      });
      return;
    }

    if (url.pathname === "/api/collect" && request.method === "POST") {
      const result = await runScan();
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      sendJson(response, 200, {
        ok: true,
        dbPath: config.dbPath,
        config: publicConfig(),
        lastScan,
      });
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`[api] listening on http://${config.host}:${config.port}`);
  console.log(`[api] db ${config.dbPath}`);
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function publicConfig() {
  return {
    host: config.host,
    port: config.port,
    dbPath: config.dbPath,
    codexHome: config.codexHome,
    sourceRoots: config.codexRoots,
    scanIntervalMs: config.scanIntervalMs,
  };
}

function serveStatic(response, pathname) {
  const distRoot = path.join(config.projectRoot, "dist");
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(distRoot, requestedPath));

  if (!filePath.startsWith(distRoot) || !fs.existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found. Run npm run dev for the Vite development server.");
    return;
  }

  const ext = path.extname(filePath);
  const type = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
  }[ext] || "application/octet-stream";

  response.writeHead(200, { "Content-Type": type });
  fs.createReadStream(filePath).pipe(response);
}
