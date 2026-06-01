export function parseCodexJsonl(content, sourceFile) {
  const tokenEvents = [];
  const taskEvents = [];
  let session = {
    id: sessionIdFromPath(sourceFile),
    sourceFile,
  };

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine.trim()) continue;

    let record;
    try {
      record = JSON.parse(rawLine);
    } catch {
      continue;
    }

    const timestamp = parseTimestamp(record.timestamp);
    if (record.type === "session_meta" && record.payload) {
      session = normalizeSession(record.payload, timestamp, sourceFile);
      continue;
    }

    if (record.type === "turn_context" && record.payload) {
      session = applyTurnContext(session, record.payload);
      continue;
    }

    if (record.type !== "event_msg" || !record.payload) continue;

    if (record.payload.type === "token_count") {
      tokenEvents.push(normalizeTokenEvent(record.payload, session.id, timestamp, sourceFile, index + 1));
    }

    if (record.payload.type === "task_started" || record.payload.type === "task_complete") {
      taskEvents.push(normalizeTaskEvent(record.payload, session.id, timestamp, sourceFile, index + 1));
    }
  }

  return {
    session,
    tokenEvents: tokenEvents.filter(Boolean),
    taskEvents: taskEvents.filter(Boolean),
  };
}

function normalizeSession(payload, timestamp, sourceFile) {
  return {
    id: payload.id || sessionIdFromPath(sourceFile),
    sourceFile,
    createdAt: payload.timestamp || timestamp,
    cwd: payload.cwd || "",
    originator: payload.originator || "",
    cliVersion: payload.cli_version || "",
    threadSource: payload.thread_source || "",
    modelProvider: payload.model_provider || "",
    model: payload.model || "",
    repositoryUrl: payload.git?.repository_url || "",
    gitBranch: payload.git?.branch || "",
    commitHash: payload.git?.commit_hash || "",
    sourceType: sourceTypeFromPayload(payload.source),
    sourceDetail: sourceDetailFromPayload(payload.source),
  };
}

function applyTurnContext(session, payload) {
  const model = payload.model || payload.collaboration_mode?.settings?.model || "";
  return {
    ...session,
    model: model || session.model || "",
  };
}

function sourceTypeFromPayload(source) {
  if (!source) return "main";
  if (typeof source === "string") return source;
  if (typeof source !== "object") return "main";

  return Object.keys(source)[0] || "main";
}

function sourceDetailFromPayload(source) {
  if (!source || typeof source !== "object") return "main";

  if (source.subagent?.other) return String(source.subagent.other);
  if (source.subagent) return "subagent";

  const [firstKey] = Object.keys(source);
  return firstKey || "main";
}

function normalizeTokenEvent(payload, sessionId, timestamp, sourceFile, lineNumber) {
  const info = payload.info || {};
  const total = info.total_token_usage || {};
  const last = info.last_token_usage || {};
  const limits = payload.rate_limits || {};
  const primary = limits.primary || {};
  const secondary = limits.secondary || {};

  return {
    id: `${sourceFile}:${lineNumber}`,
    sessionId,
    sourceFile,
    timestamp,
    lineNumber,
    inputTokens: numberOrZero(total.input_tokens),
    cachedInputTokens: numberOrZero(total.cached_input_tokens),
    outputTokens: numberOrZero(total.output_tokens),
    reasoningOutputTokens: numberOrZero(total.reasoning_output_tokens),
    totalTokens: numberOrZero(total.total_tokens),
    lastInputTokens: numberOrZero(last.input_tokens),
    lastCachedInputTokens: numberOrZero(last.cached_input_tokens),
    lastOutputTokens: numberOrZero(last.output_tokens),
    lastReasoningOutputTokens: numberOrZero(last.reasoning_output_tokens),
    lastTotalTokens: numberOrZero(last.total_tokens),
    contextWindow: numberOrZero(info.model_context_window),
    primaryUsedPercent: nullableNumber(primary.used_percent),
    primaryWindowMinutes: nullableNumber(primary.window_minutes),
    primaryResetsAt: nullableNumber(primary.resets_at),
    secondaryUsedPercent: nullableNumber(secondary.used_percent),
    secondaryWindowMinutes: nullableNumber(secondary.window_minutes),
    secondaryResetsAt: nullableNumber(secondary.resets_at),
    planType: limits.plan_type || "",
    rateLimitReachedType: limits.rate_limit_reached_type || "",
  };
}

function normalizeTaskEvent(payload, sessionId, timestamp, sourceFile, lineNumber) {
  return {
    id: `${sourceFile}:${lineNumber}`,
    sessionId,
    sourceFile,
    timestamp,
    lineNumber,
    eventType: payload.type,
    turnId: payload.turn_id || "",
    durationMs: numberOrZero(payload.duration_ms),
  };
}

function parseTimestamp(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function nullableNumber(value) {
  return value === null || value === undefined || value === "" ? null : Number(value);
}

function sessionIdFromPath(filePath) {
  const match = filePath.match(/rollout-[^-]+-[^-]+-([0-9a-f-]{36})\.jsonl$/i);
  return match?.[1] || filePath;
}
