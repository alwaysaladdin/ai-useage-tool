import test from "node:test";
import assert from "node:assert/strict";
import { parseCodexJsonl } from "../server/parser.mjs";

test("parseCodexJsonl extracts session metadata and token counts", () => {
  const content = [
    JSON.stringify({
      timestamp: "2026-06-01T08:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "session-1",
        timestamp: "2026-06-01T08:00:00.000Z",
        cwd: "/Users/aladdin/Documents/codes/ship/ai-useage-tool",
        model_provider: "openai",
        git: {
          repository_url: "git@github.com:example/ai-useage-tool.git",
          branch: "main",
          commit_hash: "abc",
        },
      },
    }),
    JSON.stringify({
      timestamp: "2026-06-01T08:01:00.000Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 20,
            output_tokens: 30,
            reasoning_output_tokens: 5,
            total_tokens: 135,
          },
          last_token_usage: {
            input_tokens: 50,
            cached_input_tokens: 10,
            output_tokens: 15,
            reasoning_output_tokens: 2,
            total_tokens: 67,
          },
          model_context_window: 258400,
        },
        rate_limits: {
          primary: {
            used_percent: 4,
            window_minutes: 300,
            resets_at: 1780304154,
          },
          secondary: {
            used_percent: 1,
            window_minutes: 10080,
            resets_at: 1780846028,
          },
          plan_type: "prolite",
        },
      },
    }),
  ].join("\n");

  const parsed = parseCodexJsonl(content, "/tmp/rollout-2026-06-01T00-00-00-session-1.jsonl");
  assert.equal(parsed.session.id, "session-1");
  assert.equal(parsed.session.cwd, "/Users/aladdin/Documents/codes/ship/ai-useage-tool");
  assert.equal(parsed.session.gitBranch, "main");
  assert.equal(parsed.tokenEvents.length, 1);
  assert.equal(parsed.tokenEvents[0].lastTotalTokens, 67);
  assert.equal(parsed.tokenEvents[0].primaryUsedPercent, 4);
});

test("parseCodexJsonl preserves subagent source detail", () => {
  const content = JSON.stringify({
    timestamp: "2026-06-01T08:00:00.000Z",
    type: "session_meta",
    payload: {
      id: "session-guardian",
      cwd: "/Users/aladdin/.codex",
      source: {
        subagent: {
          other: "guardian",
        },
      },
    },
  });

  const parsed = parseCodexJsonl(content, "/tmp/session-guardian.jsonl");
  assert.equal(parsed.session.sourceType, "subagent");
  assert.equal(parsed.session.sourceDetail, "guardian");
});

test("parseCodexJsonl treats string source as main display detail", () => {
  const content = JSON.stringify({
    timestamp: "2026-06-01T08:00:00.000Z",
    type: "session_meta",
    payload: {
      id: "session-main",
      cwd: "/Users/aladdin/Documents/codes/ship/ai-useage-tool",
      source: "vscode",
      thread_source: "user",
    },
  });

  const parsed = parseCodexJsonl(content, "/tmp/session-main.jsonl");
  assert.equal(parsed.session.sourceType, "vscode");
  assert.equal(parsed.session.sourceDetail, "main");
});

test("parseCodexJsonl extracts the precise Codex model alias from turn context", () => {
  const content = [
    JSON.stringify({
      timestamp: "2026-06-01T08:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "session-model",
        cwd: "/Users/aladdin/Documents/codes/ship/ai-useage-tool",
        model_provider: "openai",
      },
    }),
    JSON.stringify({
      timestamp: "2026-06-01T08:01:00.000Z",
      type: "turn_context",
      payload: {
        model: "codex-auto-review",
        collaboration_mode: {
          settings: {
            model: "codex-auto-review",
          },
        },
      },
    }),
  ].join("\n");

  const parsed = parseCodexJsonl(content, "/tmp/session-model.jsonl");
  assert.equal(parsed.session.modelProvider, "openai");
  assert.equal(parsed.session.model, "codex-auto-review");
});

test("parseCodexJsonl falls back to collaboration mode model from turn context", () => {
  const content = [
    JSON.stringify({
      timestamp: "2026-06-01T08:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "session-collab-model",
        cwd: "/Users/aladdin/Documents/codes/ship/ai-useage-tool",
      },
    }),
    JSON.stringify({
      timestamp: "2026-06-01T08:01:00.000Z",
      type: "turn_context",
      payload: {
        collaboration_mode: {
          settings: {
            model: "codex-auto",
          },
        },
      },
    }),
  ].join("\n");

  const parsed = parseCodexJsonl(content, "/tmp/session-collab-model.jsonl");
  assert.equal(parsed.session.model, "codex-auto");
});

test("parseCodexJsonl extracts task lifecycle events", () => {
  const content = [
    JSON.stringify({
      timestamp: "2026-06-01T08:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "session-2",
        cwd: "/Users/aladdin/.codex",
      },
    }),
    JSON.stringify({
      timestamp: "2026-06-01T08:02:00.000Z",
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-1",
      },
    }),
    JSON.stringify({
      timestamp: "2026-06-01T08:03:00.000Z",
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: "turn-1",
        duration_ms: 60000,
      },
    }),
  ].join("\n");

  const parsed = parseCodexJsonl(content, "/tmp/session-2.jsonl");
  assert.equal(parsed.taskEvents.length, 2);
  assert.equal(parsed.taskEvents[0].eventType, "task_started");
  assert.equal(parsed.taskEvents[1].durationMs, 60000);
});
