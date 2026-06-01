import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Power, RefreshCw, X, Zap } from "lucide-react";
import { fetchSummary, triggerCollect } from "./api.js";
import { formatCompactTokens, formatDateTime, formatDurationToNow, formatPercent } from "./format.js";
import { hideMenubarWindow, onTraySync, openDashboardWindow, quitDesktopApp } from "./tauriBridge.js";
import { modelLabel, sessionStatus, shortSessionId, sourceLabel } from "./sessionView.js";

const PANEL_REFRESH_MS = 5_000;

export function MenubarApp() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [, setClockTick] = useState(Date.now());

  const loadSummary = useCallback(async () => {
    try {
      const data = await fetchSummary("today");
      setSummary(data);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await triggerCollect();
      await loadSummary();
    } catch (syncError) {
      setError(syncError.message);
    } finally {
      setSyncing(false);
    }
  }, [loadSummary]);

  useEffect(() => {
    document.body.classList.add("is-menubar");
    loadSummary();
    const timer = setInterval(loadSummary, PANEL_REFRESH_MS);
    const clockTimer = setInterval(() => setClockTick(Date.now()), 30_000);
    return () => {
      document.body.classList.remove("is-menubar");
      clearInterval(timer);
      clearInterval(clockTimer);
    };
  }, [loadSummary]);

  useEffect(() => {
    let unsubscribe = () => {};
    onTraySync(syncNow).then((unlisten) => {
      unsubscribe = unlisten;
    });
    return () => unsubscribe();
  }, [syncNow]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") hideMenubarWindow();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const quota = summary?.quota || {};
  const totals = summary?.totals || {};
  const projects = summary?.projects || [];
  const sessions = summary?.recentSessions || [];
  const topProjects = useMemo(() => projects.slice(0, 3), [projects]);
  const recentSessions = useMemo(() => sessions.slice(0, 3), [sessions]);

  return (
    <main className="menubar-shell">
      <header className="menubar-titlebar">
        <div>
          <strong>Codex Usage</strong>
          <span>{loading ? "加载中" : `更新 ${formatDateTime(summary?.updatedAt)}`}</span>
        </div>
        <button className="icon-button" type="button" onClick={hideMenubarWindow} aria-label="关闭小面板">
          <X size={16} />
        </button>
      </header>

      {error ? <div className="menubar-error">{error}</div> : null}

      <section className="menubar-quota-grid" aria-label="额度概览">
        <QuotaTile quota={quota.primary} accent="cyan" fallbackLabel="5 小时额度" />
        <QuotaTile quota={quota.secondary} accent="violet" fallbackLabel="7 天额度" />
      </section>

      <section className="menubar-metrics" aria-label="Token 概览">
        <div>
          <span>今日 Token</span>
          <strong>{formatCompactTokens(totals.todayTokens || 0)}</strong>
        </div>
        <div>
          <span>最耗项目</span>
          <strong>{totals.heaviestProject || "暂无数据"}</strong>
        </div>
      </section>

      <section className="menubar-section" aria-label="项目使用分布">
        <PanelHeading title="项目分布" value={formatCompactTokens(totals.rangeTokens || 0)} />
        <div className="mini-project-list">
          {topProjects.length ? (
            topProjects.map((project) => <ProjectRow key={project.projectKey} project={project} />)
          ) : (
            <p className="mini-empty">暂无项目数据</p>
          )}
        </div>
      </section>

      <section className="menubar-section" aria-label="最近线程">
        <PanelHeading title="最近线程" value={`${sessions.length} 会话`} />
        <div className="mini-session-list">
          {recentSessions.length ? (
            recentSessions.map((session) => <SessionLine key={session.id} session={session} />)
          ) : (
            <p className="mini-empty">暂无会话数据</p>
          )}
        </div>
      </section>

      <footer className="menubar-actions">
        <button className="menubar-action" type="button" onClick={syncNow} disabled={syncing}>
          <RefreshCw size={15} className={syncing ? "spin" : ""} />
          {syncing ? "同步中" : "同步"}
        </button>
        <button className="menubar-action" type="button" onClick={openDashboardWindow}>
          <ExternalLink size={15} />
          Dashboard
        </button>
        <button className="menubar-action menubar-action--ghost" type="button" onClick={quitDesktopApp}>
          <Power size={15} />
        </button>
      </footer>
    </main>
  );
}

function QuotaTile({ quota, fallbackLabel, accent }) {
  const remainingPercent = Number(quota?.remainingPercent || 0);
  const usedPercent = Number(quota?.usedPercent || 0);
  const resetText = quota?.resetsAt ? formatDateTime(quota.resetsAt) : "暂无";
  const resetCountdown = quota?.resetsAt ? formatDurationToNow(quota.resetsAt) : "--";

  return (
    <article className={`mini-quota mini-quota--${accent}`}>
      <span>{quota?.label || fallbackLabel}</span>
      <strong>{Math.round(remainingPercent)}%</strong>
      <em>已用 {Math.round(usedPercent)}%</em>
      <small>重置 {resetText}</small>
      <small>{resetCountdown}</small>
      <div className="mini-progress">
        <i style={{ width: `${Math.max(0, Math.min(100, remainingPercent))}%` }} />
      </div>
    </article>
  );
}

function PanelHeading({ title, value }) {
  return (
    <div className="mini-heading">
      <h2>{title}</h2>
      <span>{value}</span>
    </div>
  );
}

function ProjectRow({ project }) {
  return (
    <div className="mini-project-row">
      <div>
        <i />
        <span>{project.projectName}</span>
      </div>
      <strong>{formatCompactTokens(project.tokens)}</strong>
      <em>{formatPercent(project.share)}</em>
    </div>
  );
}

function SessionLine({ session }) {
  const status = sessionStatus(session);

  return (
    <article className="mini-session-row">
      <div className="mini-session-main">
        <strong>{sourceLabel(session)}</strong>
        <span>#{shortSessionId(session)} · {modelLabel(session)}</span>
      </div>
      <div className="mini-session-meta">
        <em className={`state state--${status.key}`}>{status.label}</em>
        <span>
          <Zap size={12} />
          {formatCompactTokens(session.tokens)}
        </span>
      </div>
    </article>
  );
}
