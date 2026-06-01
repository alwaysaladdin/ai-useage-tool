export function sessionStatus(session) {
  if (Number(session.tokens || 0) === 0 || session.status === "no_token") {
    return {
      key: "no_token",
      label: "无 Token",
      description: "当前时间窗口内没有 token 事件",
    };
  }

  if (session.status === "running" || session.latestTaskEvent === "task_started") {
    return {
      key: "running",
      label: "运行中",
      description: "最后任务事件是 task_started",
    };
  }

  return {
    key: "completed",
    label: "已完成",
    description: "最后任务事件是 task_complete 或没有未闭合任务",
  };
}

export function sourceLabel(session) {
  const candidates = [
    session.sourceLabel,
    session.sourceDetail,
    session.sourceType,
    session.threadSource,
  ].map((value) => String(value || "").trim().toLowerCase());

  return candidates.find((value) => value && !isMainSource(value)) || "main";
}

export function modelLabel(session) {
  const model = String(session.model || "").trim();
  if (model) return model;

  const provider = String(session.modelProvider || "").trim();
  if (provider) return `${provider} provider`;

  return "未记录";
}

export function shortSessionId(session) {
  return session.shortId || String(session.id || "").replace(/-/g, "").slice(0, 8) || "--";
}

function isMainSource(value) {
  return value === "main" || value === "user" || value === "vscode" || value === "0";
}

export function groupSessionsByProject(sessions) {
  const groups = new Map();

  for (const session of sessions) {
    const key = session.projectKey || session.projectName || "other";
    const existing = groups.get(key) || {
      key,
      projectName: session.projectName || "Other",
      sessions: [],
      tokens: 0,
      runningCount: 0,
      noTokenCount: 0,
      completedCount: 0,
      lastActiveAt: session.lastActiveAt,
    };

    const status = sessionStatus(session).key;
    existing.sessions.push(session);
    existing.tokens += Number(session.tokens || 0);
    existing.runningCount += status === "running" ? 1 : 0;
    existing.noTokenCount += status === "no_token" ? 1 : 0;
    existing.completedCount += status === "completed" ? 1 : 0;

    if (!existing.lastActiveAt || new Date(session.lastActiveAt) > new Date(existing.lastActiveAt)) {
      existing.lastActiveAt = session.lastActiveAt;
    }

    groups.set(key, existing);
  }

  return [...groups.values()].sort((left, right) => {
    const rightTime = new Date(right.lastActiveAt || 0).getTime();
    const leftTime = new Date(left.lastActiveAt || 0).getTime();
    return rightTime - leftTime;
  });
}
