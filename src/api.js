export async function fetchSummary(range) {
  const response = await fetch(`/api/summary?range=${encodeURIComponent(range)}`);
  if (!response.ok) {
    throw new Error(`summary request failed: ${response.status}`);
  }
  return response.json();
}

export async function triggerCollect() {
  const response = await fetch("/api/collect", { method: "POST" });
  if (!response.ok) {
    throw new Error(`collect request failed: ${response.status}`);
  }
  return response.json();
}

