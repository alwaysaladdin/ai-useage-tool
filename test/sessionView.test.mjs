import test from "node:test";
import assert from "node:assert/strict";
import { groupSessionsByProject, modelLabel, sessionStatus, shortSessionId, sourceLabel } from "../src/sessionView.js";

test("sessionStatus maps running, completed, and no-token states", () => {
  assert.equal(sessionStatus({ tokens: 12, latestTaskEvent: "task_started" }).label, "运行中");
  assert.equal(sessionStatus({ tokens: 12, latestTaskEvent: "task_complete" }).label, "已完成");
  assert.equal(sessionStatus({ tokens: 0, latestTaskEvent: "task_started" }).label, "无 Token");
});

test("sourceLabel and shortSessionId expose compact session identity", () => {
  const session = {
    id: "019e823c-f710-7382-8c89-31760b4815a7",
    sourceDetail: "guardian",
  };
  assert.equal(sourceLabel(session), "guardian");
  assert.equal(shortSessionId(session), "019e823c");
  assert.equal(sourceLabel({ sourceDetail: "main", sourceType: "vscode" }), "main");
  assert.equal(sourceLabel({ sourceLabel: "0", sourceDetail: "main" }), "main");
});

test("modelLabel prefers concrete model aliases over provider fallback", () => {
  assert.equal(modelLabel({ model: "codex-auto-review", modelProvider: "openai" }), "codex-auto-review");
  assert.equal(modelLabel({ modelProvider: "openai" }), "openai provider");
  assert.equal(modelLabel({}), "未记录");
});

test("groupSessionsByProject merges sessions under project buckets", () => {
  const groups = groupSessionsByProject([
    {
      id: "a",
      projectKey: "ai-useage-tool",
      projectName: "ai-useage-tool",
      tokens: 10,
      latestTaskEvent: "task_complete",
      lastActiveAt: "2026-06-01T08:00:00.000Z",
    },
    {
      id: "b",
      projectKey: "ai-useage-tool",
      projectName: "ai-useage-tool",
      tokens: 0,
      latestTaskEvent: "task_started",
      lastActiveAt: "2026-06-01T09:00:00.000Z",
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].sessions.length, 2);
  assert.equal(groups[0].tokens, 10);
  assert.equal(groups[0].noTokenCount, 1);
});
