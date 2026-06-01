import { Activity, ChevronDown, GitBranch, HardDrive, Layers3, TerminalSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCompactTokens, formatRelativeTime } from "../format.js";
import { groupSessionsByProject, modelLabel, sessionStatus, shortSessionId, sourceLabel } from "../sessionView.js";

export function SessionRail({ sessions }) {
  const [viewMode, setViewMode] = useState("project");
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const projectGroups = useMemo(() => groupSessionsByProject(sessions), [sessions]);

  function toggleProject(projectKey) {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(projectKey)) {
        next.delete(projectKey);
      } else {
        next.add(projectKey);
      }
      return next;
    });
  }

  return (
    <aside className="session-rail">
      <div className="panel-header">
        <div>
          <h2>最近 Codex 线程</h2>
          <p>默认按项目合并，展开后查看具体 session。</p>
        </div>
        <span>{viewMode === "project" ? `${projectGroups.length} 项目 / ${sessions.length} 会话` : `${sessions.length} 会话`}</span>
      </div>
      <div className="session-view-toggle" aria-label="最近会话展示方式">
        <button
          className={viewMode === "project" ? "is-active" : ""}
          type="button"
          onClick={() => setViewMode("project")}
        >
          按项目合并
        </button>
        <button
          className={viewMode === "session" ? "is-active" : ""}
          type="button"
          onClick={() => setViewMode("session")}
        >
          按会话查看
        </button>
      </div>
      {sessions.length === 0 ? (
        <div className="empty-state">等待采集会话数据</div>
      ) : viewMode === "project" ? (
        <ProjectSessionGroups
          groups={projectGroups}
          expandedProjects={expandedProjects}
          onToggle={toggleProject}
        />
      ) : (
        <div className="session-list">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </aside>
  );
}

function ProjectSessionGroups({ groups, expandedProjects, onToggle }) {
  return (
    <div className="session-project-list">
      {groups.map((group) => {
        const expanded = expandedProjects.has(group.key);
        return (
          <section className="session-project-group" key={group.key}>
            <button
              className="project-group-summary"
              type="button"
              onClick={() => onToggle(group.key)}
              aria-expanded={expanded}
            >
              <span className="project-group-name">
                <Layers3 size={17} />
                <strong>{group.projectName}</strong>
                <em>{formatRelativeTime(group.lastActiveAt)}</em>
              </span>
              <span className="project-group-metrics">
                <strong>{formatCompactTokens(group.tokens)}</strong>
                <em>{group.sessions.length} 个 session</em>
                <i>{group.runningCount} 运行 / {group.noTokenCount} 无 Token</i>
                <ChevronDown size={17} className={expanded ? "is-open" : ""} />
              </span>
            </button>
            {expanded ? (
              <div className="session-subrows">
                {group.sessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function SessionCard({ session }) {
  const status = sessionStatus(session);

  return (
    <article className="session-card">
      <div className="session-card__top">
        <div>
          <strong>{session.projectName}</strong>
          <span>{formatRelativeTime(session.lastActiveAt)}</span>
        </div>
        <em className={`state state--${status.key}`} title={status.description}>
          {status.label}
        </em>
      </div>
      <SessionDetails session={session} />
    </article>
  );
}

function SessionRow({ session }) {
  const status = sessionStatus(session);

  return (
    <div className="session-subrow">
      <div className="session-subrow__main">
        <strong>{sourceLabel(session)}</strong>
        <span>#{shortSessionId(session)} · {formatRelativeTime(session.lastActiveAt)}</span>
      </div>
      <em className={`state state--${status.key}`} title={status.description}>
        {status.label}
      </em>
      <SessionDetails session={session} compact />
    </div>
  );
}

function SessionDetails({ session, compact = false }) {
  return (
    <dl className={compact ? "session-details session-details--compact" : "session-details"}>
      <dt>
        <TerminalSquare size={14} />
        模型
      </dt>
      <dd>{modelLabel(session)}</dd>
      <dt>
        <Layers3 size={14} />
        来源
      </dt>
      <dd>{sourceLabel(session)}</dd>
      <dt>
        <Activity size={14} />
        Session
      </dt>
      <dd>#{shortSessionId(session)}</dd>
      <dt>
        <GitBranch size={14} />
        分支
      </dt>
      <dd>{session.gitBranch || "未记录"}</dd>
      <dt>
        <HardDrive size={14} />
        路径
      </dt>
      <dd title={session.cwd}>{shortenPath(session.cwd)}</dd>
      <dt>
        <Activity size={14} />
        Token
      </dt>
      <dd>{formatCompactTokens(session.tokens)}</dd>
    </dl>
  );
}

function shortenPath(value) {
  if (!value) return "未记录";
  const home = value.replace(/^\/Users\/[^/]+/, "~");
  if (home.length <= 34) return home;
  return `…${home.slice(-33)}`;
}
