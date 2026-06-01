const DEFAULT_TAURI_API_BASE = "http://127.0.0.1:4177";

export async function fetchSummary(range) {
  const response = await fetch(apiUrl(`/api/summary?range=${encodeURIComponent(range)}`));
  if (!response.ok) {
    throw new Error(`summary request failed: ${response.status}`);
  }
  return response.json();
}

export async function triggerCollect() {
  const response = await fetch(apiUrl("/api/collect"), { method: "POST" });
  if (!response.ok) {
    throw new Error(`collect request failed: ${response.status}`);
  }
  return response.json();
}

export function apiUrl(path) {
  const explicitBase = import.meta.env.VITE_CODEX_USAGE_API_BASE;
  const tauriBase = window.__TAURI_INTERNALS__ ? DEFAULT_TAURI_API_BASE : "";
  const base = explicitBase || tauriBase;

  return `${base}${path}`;
}
