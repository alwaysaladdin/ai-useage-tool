export function formatCompactTokens(value = 0) {
  const tokens = Number(value) || 0;
  if (tokens >= 100_000_000) return `${trim(tokens / 100_000_000)}亿`;
  if (tokens >= 10_000) return `${trim(tokens / 10_000)}万`;
  return new Intl.NumberFormat("zh-CN").format(tokens);
}

export function formatPercent(value = 0) {
  const ratio = Number(value) || 0;
  if (ratio > 0 && ratio < 0.01) return "<1%";
  return `${Math.round(ratio * 100)}%`;
}

export function formatDateTime(value) {
  if (!value) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatRelativeTime(value) {
  if (!value) return "--";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function formatDurationToNow(value) {
  const diff = Math.max(0, new Date(value).getTime() - Date.now());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} 天 ${hours % 24} 小时`;
  }
  return `${hours} 小时 ${String(minutes).padStart(2, "0")} 分`;
}

function trim(value) {
  return Number(value.toFixed(value >= 10 ? 1 : 2)).toString();
}
