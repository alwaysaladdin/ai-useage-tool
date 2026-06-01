import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { projectKeyFromSession, projectNameFromSession } from "./project.mjs";

const PARSER_VERSION = 2;

export function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_files (
      path TEXT PRIMARY KEY,
      size INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      parser_version INTEGER NOT NULL DEFAULT ${PARSER_VERSION},
      scanned_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      cwd TEXT NOT NULL,
      project_key TEXT NOT NULL,
      project_name TEXT NOT NULL,
      originator TEXT NOT NULL,
      cli_version TEXT NOT NULL,
      thread_source TEXT NOT NULL,
      model_provider TEXT NOT NULL,
      model TEXT NOT NULL,
      repository_url TEXT NOT NULL,
      git_branch TEXT NOT NULL,
      commit_hash TEXT NOT NULL,
      source_type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      source_file TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      cached_input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      reasoning_output_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      last_input_tokens INTEGER NOT NULL,
      last_cached_input_tokens INTEGER NOT NULL,
      last_output_tokens INTEGER NOT NULL,
      last_reasoning_output_tokens INTEGER NOT NULL,
      last_total_tokens INTEGER NOT NULL,
      context_window INTEGER NOT NULL,
      primary_used_percent REAL,
      primary_window_minutes INTEGER,
      primary_resets_at INTEGER,
      secondary_used_percent REAL,
      secondary_window_minutes INTEGER,
      secondary_resets_at INTEGER,
      plan_type TEXT NOT NULL,
      rate_limit_reached_type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      source_file TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      duration_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS token_events_timestamp_idx ON token_events(timestamp);
    CREATE INDEX IF NOT EXISTS token_events_session_idx ON token_events(session_id);
    CREATE INDEX IF NOT EXISTS task_events_session_timestamp_idx ON task_events(session_id, timestamp);
  `);
  ensureColumn(db, "source_files", "parser_version", "INTEGER NOT NULL DEFAULT 0");
  const addedSourceDetail = ensureColumn(db, "sessions", "source_detail", "TEXT NOT NULL DEFAULT 'main'");
  if (addedSourceDetail) {
    // Force one post-migration scan so old rows get accurate main/subagent/guardian labels.
    db.prepare("UPDATE source_files SET mtime_ms = -1").run();
  }
}

export function replaceFileRecords(db, sourceFile, parsed, stat) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM token_events WHERE source_file = ?").run(sourceFile);
    db.prepare("DELETE FROM task_events WHERE source_file = ?").run(sourceFile);

    upsertSession(db, parsed.session);
    const insertToken = db.prepare(`
      INSERT OR REPLACE INTO token_events (
        id, session_id, source_file, timestamp, line_number,
        input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens, total_tokens,
        last_input_tokens, last_cached_input_tokens, last_output_tokens, last_reasoning_output_tokens, last_total_tokens,
        context_window, primary_used_percent, primary_window_minutes, primary_resets_at,
        secondary_used_percent, secondary_window_minutes, secondary_resets_at,
        plan_type, rate_limit_reached_type
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?
      )
    `);

    for (const event of parsed.tokenEvents) {
      insertToken.run(
        event.id,
        event.sessionId,
        event.sourceFile,
        event.timestamp,
        event.lineNumber,
        event.inputTokens,
        event.cachedInputTokens,
        event.outputTokens,
        event.reasoningOutputTokens,
        event.totalTokens,
        event.lastInputTokens,
        event.lastCachedInputTokens,
        event.lastOutputTokens,
        event.lastReasoningOutputTokens,
        event.lastTotalTokens,
        event.contextWindow,
        event.primaryUsedPercent,
        event.primaryWindowMinutes,
        event.primaryResetsAt,
        event.secondaryUsedPercent,
        event.secondaryWindowMinutes,
        event.secondaryResetsAt,
        event.planType,
        event.rateLimitReachedType,
      );
    }

    const insertTask = db.prepare(`
      INSERT OR REPLACE INTO task_events (
        id, session_id, source_file, timestamp, line_number, event_type, turn_id, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const event of parsed.taskEvents) {
      insertTask.run(
        event.id,
        event.sessionId,
        event.sourceFile,
        event.timestamp,
        event.lineNumber,
        event.eventType,
        event.turnId,
        event.durationMs,
      );
    }

    db.prepare(`
      INSERT OR REPLACE INTO source_files (path, size, mtime_ms, parser_version, scanned_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sourceFile, stat.size, Math.round(stat.mtimeMs), PARSER_VERSION, new Date().toISOString());

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function shouldScanFile(db, filePath, stat) {
  const row = db.prepare("SELECT size, mtime_ms, parser_version AS parserVersion FROM source_files WHERE path = ?").get(filePath);
  if (!row) return true;
  if (Number(row.parserVersion || 0) !== PARSER_VERSION) return true;
  // Existing databases created before source_detail existed need one reparsing pass.
  const missingSourceDetail = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sessions
    WHERE source_file = ? AND (
      source_detail = ''
      OR source_detail IS NULL
      OR source_type = '0'
    )
  `).get(filePath);
  if (Number(missingSourceDetail?.count || 0) > 0) return true;
  return row.size !== stat.size || row.mtime_ms !== Math.round(stat.mtimeMs);
}

export function getSummary(db, range) {
  const now = new Date();
  const start = startDateForRange(range, now);
  const startIso = start.toISOString();

  const quotaRow = db.prepare(`
    SELECT * FROM token_events
    WHERE primary_used_percent IS NOT NULL OR secondary_used_percent IS NOT NULL
    ORDER BY timestamp DESC
    LIMIT 1
  `).get();

  const totals = {
    todayTokens: scalar(db, "SELECT COALESCE(SUM(last_total_tokens), 0) FROM token_events WHERE timestamp >= ?", [startOfToday(now).toISOString()]),
    last7DaysTokens: scalar(db, "SELECT COALESCE(SUM(last_total_tokens), 0) FROM token_events WHERE timestamp >= ?", [daysAgo(now, 7).toISOString()]),
    monthTokens: scalar(db, "SELECT COALESCE(SUM(last_total_tokens), 0) FROM token_events WHERE timestamp >= ?", [startOfMonth(now).toISOString()]),
    rangeTokens: scalar(db, "SELECT COALESCE(SUM(last_total_tokens), 0) FROM token_events WHERE timestamp >= ?", [startIso]),
    totalSessions: scalar(db, "SELECT COUNT(*) FROM sessions", []),
    activeSessions: activeSessionCount(db),
  };

  const projects = db.prepare(`
    SELECT
      s.project_key AS projectKey,
      s.project_name AS projectName,
      COALESCE(SUM(t.last_total_tokens), 0) AS tokens,
      COUNT(DISTINCT s.id) AS sessions,
      MAX(t.timestamp) AS lastActiveAt
    FROM sessions s
    JOIN token_events t ON t.session_id = s.id
    WHERE t.timestamp >= ?
    GROUP BY s.project_key, s.project_name
    ORDER BY tokens DESC
  `).all(startIso).map((row) => ({
    ...row,
    share: totals.rangeTokens > 0 ? row.tokens / totals.rangeTokens : 0,
  }));

  const recentSessions = db.prepare(`
    SELECT
      s.id,
      s.cwd,
      s.project_name AS projectName,
      s.project_key AS projectKey,
      s.git_branch AS gitBranch,
      s.repository_url AS repositoryUrl,
      s.model,
      s.model_provider AS modelProvider,
      s.thread_source AS threadSource,
      s.source_type AS sourceType,
      s.source_detail AS sourceDetail,
      COALESCE((
        SELECT SUM(tr.last_total_tokens)
        FROM token_events tr
        WHERE tr.session_id = s.id AND tr.timestamp >= ?
      ), 0) AS tokens,
      COALESCE(
        (SELECT MAX(ta.timestamp) FROM token_events ta WHERE ta.session_id = s.id),
        (SELECT MAX(te2.timestamp) FROM task_events te2 WHERE te2.session_id = s.id),
        s.updated_at
      ) AS lastActiveAt,
      (
        SELECT event_type
        FROM task_events te
        WHERE te.session_id = s.id
        ORDER BY te.timestamp DESC
        LIMIT 1
      ) AS latestTaskEvent
    FROM sessions s
    ORDER BY lastActiveAt DESC
    LIMIT 24
  `).all(startIso).map((row) => ({
    ...row,
    shortId: shortSessionId(row.id),
    sourceLabel: sourceLabel(row),
    status: sessionStatus(row),
    statusLabel: sessionStatusLabel(row),
    active: sessionStatus(row) === "running",
  }));

  const heaviestProject = projects[0]?.projectName || "暂无数据";

  return {
    updatedAt: new Date().toISOString(),
    range,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    quota: quotaFromRow(quotaRow),
    totals: {
      ...totals,
      heaviestProject,
    },
    projects,
    recentSessions,
    health: {
      dbPath: db.filename,
      filesScanned: scalar(db, "SELECT COUNT(*) FROM source_files", []),
      tokenEvents: scalar(db, "SELECT COUNT(*) FROM token_events", []),
      taskEvents: scalar(db, "SELECT COUNT(*) FROM task_events", []),
    },
  };
}

function upsertSession(db, session) {
  const projectName = projectNameFromSession(session);
  const projectKey = projectKeyFromSession(session);
  db.prepare(`
    INSERT INTO sessions (
      id, source_file, created_at, updated_at, cwd, project_key, project_name,
      originator, cli_version, thread_source, model_provider, model,
      repository_url, git_branch, commit_hash, source_type, source_detail
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_file = excluded.source_file,
      updated_at = excluded.updated_at,
      cwd = excluded.cwd,
      project_key = excluded.project_key,
      project_name = excluded.project_name,
      originator = excluded.originator,
      cli_version = excluded.cli_version,
      thread_source = excluded.thread_source,
      model_provider = excluded.model_provider,
      model = excluded.model,
      repository_url = excluded.repository_url,
      git_branch = excluded.git_branch,
      commit_hash = excluded.commit_hash,
      source_type = excluded.source_type,
      source_detail = excluded.source_detail
  `).run(
    session.id,
    session.sourceFile,
    session.createdAt || new Date().toISOString(),
    new Date().toISOString(),
    session.cwd || "",
    projectKey,
    projectName,
    session.originator || "",
    session.cliVersion || "",
    session.threadSource || "",
    session.modelProvider || "",
    session.model || "",
    session.repositoryUrl || "",
    session.gitBranch || "",
    session.commitHash || "",
    session.sourceType || "",
    session.sourceDetail || "main",
  );
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((entry) => entry.name === column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

function quotaFromRow(row) {
  if (!row) {
    return {
      primary: null,
      secondary: null,
      planType: "",
      observedAt: null,
    };
  }

  return {
    primary: quotaWindow("5 小时额度", row.primary_used_percent, row.primary_window_minutes, row.primary_resets_at),
    secondary: quotaWindow("7 天额度", row.secondary_used_percent, row.secondary_window_minutes, row.secondary_resets_at),
    planType: row.plan_type,
    observedAt: row.timestamp,
  };
}

function quotaWindow(label, usedPercent, windowMinutes, resetsAt) {
  if (usedPercent === null || usedPercent === undefined) return null;
  return {
    label,
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
    windowMinutes,
    resetsAt: resetsAt ? new Date(resetsAt * 1000).toISOString() : null,
  };
}

function activeSessionCount(db) {
  return scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT s.id,
        (
          SELECT event_type
          FROM task_events te
          WHERE te.session_id = s.id
          ORDER BY te.timestamp DESC
          LIMIT 1
        ) AS latest_event
      FROM sessions s
    )
    WHERE latest_event = 'task_started'
  `, []);
}

function shortSessionId(id = "") {
  const compact = String(id).replace(/-/g, "");
  return compact ? compact.slice(0, 8) : "--";
}

function sourceLabel(row) {
  const detail = normalizeLabel(row.sourceDetail);
  if (detail && !isMainSource(detail)) return detail;

  const sourceType = normalizeLabel(row.sourceType);
  if (sourceType && !isMainSource(sourceType)) return sourceType;

  const threadSource = normalizeLabel(row.threadSource);
  if (threadSource && !isMainSource(threadSource)) return threadSource;

  return "main";
}

function normalizeLabel(value) {
  return String(value || "").trim().toLowerCase();
}

function isMainSource(value) {
  return value === "main" || value === "user" || value === "vscode" || value === "0";
}

function sessionStatus(row) {
  if (Number(row.tokens || 0) === 0) return "no_token";
  if (row.latestTaskEvent === "task_started") return "running";
  return "completed";
}

function sessionStatusLabel(row) {
  return {
    running: "运行中",
    completed: "已完成",
    no_token: "无 Token",
  }[sessionStatus(row)];
}

function scalar(db, sql, params) {
  const row = db.prepare(sql).get(...params);
  return Number(Object.values(row || { value: 0 })[0] || 0);
}

function startDateForRange(range, now) {
  if (range === "7d") return daysAgo(now, 7);
  if (range === "30d") return daysAgo(now, 30);
  if (range === "month") return startOfMonth(now);
  return startOfToday(now);
}

function startOfToday(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfMonth(now) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function daysAgo(now, days) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
