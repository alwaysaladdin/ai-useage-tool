import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Flame,
  GaugeCircle,
  RefreshCw,
  Server,
  Users,
  Zap,
} from "lucide-react";
import { fetchSummary, triggerCollect } from "./api.js";
import { Gauge } from "./components/Gauge.jsx";
import { MetricCard } from "./components/MetricCard.jsx";
import { ProjectDistribution } from "./components/ProjectDistribution.jsx";
import { RangeTabs } from "./components/RangeTabs.jsx";
import { SessionRail } from "./components/SessionRail.jsx";
import { formatCompactTokens, formatDateTime } from "./format.js";

export function App() {
  const [range, setRange] = useState("today");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchSummary(range);
        if (!cancelled) {
          setSummary(data);
          setError("");
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [range]);

  useEffect(() => {
    function syncActiveSection() {
      setActiveSection(window.location.hash === "#projects" ? "projects" : "overview");
    }

    syncActiveSection();
    window.addEventListener("hashchange", syncActiveSection);
    return () => window.removeEventListener("hashchange", syncActiveSection);
  }, []);

  const quota = summary?.quota || {};
  const totals = summary?.totals || {};
  const projects = summary?.projects || [];
  const recentSessions = summary?.recentSessions || [];
  const health = summary?.health || {};
  const runtimeConfig = summary?.config || {};

  const metricCards = useMemo(
    () => [
      {
        label: "今日 Token",
        value: formatCompactTokens(totals.todayTokens),
        detail: "本地观测",
        icon: <Zap size={20} />,
        tone: "cyan",
      },
      {
        label: "近 7 天 Token",
        value: formatCompactTokens(totals.last7DaysTokens),
        detail: "滚动窗口",
        icon: <CalendarDays size={20} />,
        tone: "violet",
      },
      {
        label: "本月 Token",
        value: formatCompactTokens(totals.monthTokens),
        detail: "自然月",
        icon: <GaugeCircle size={20} />,
        tone: "pink",
      },
      {
        label: "活跃会话",
        value: totals.activeSessions ?? 0,
        detail: `总会话 ${totals.totalSessions ?? 0}`,
        icon: <Users size={20} />,
        tone: "blue",
      },
      {
        label: "最耗 Token 项目",
        value: totals.heaviestProject || "暂无数据",
        detail: "当前时间窗口",
        icon: <Flame size={20} />,
        tone: "orange",
      },
    ],
    [totals],
  );

  async function handleCollect() {
    setSyncing(true);
    try {
      await triggerCollect();
      setSummary(await fetchSummary(range));
      setError("");
    } catch (syncError) {
      setError(syncError.message);
    } finally {
      setSyncing(false);
    }
  }

  function handleNavClick(event, sectionId) {
    event.preventDefault();
    setActiveSection(sectionId);
    window.history.replaceState(null, "", `#${sectionId}`);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="app-shell">
      <nav className="sidebar" aria-label="应用导航">
        <div className="brand">
          <Server size={23} />
          <span>Codex Usage</span>
        </div>
        <a
          className={activeSection === "overview" ? "nav-item is-active" : "nav-item"}
          href="#overview"
          onClick={(event) => handleNavClick(event, "overview")}
        >
          <Activity size={18} />
          概览
        </a>
        <a
          className={activeSection === "projects" ? "nav-item is-active" : "nav-item"}
          href="#projects"
          onClick={(event) => handleNavClick(event, "projects")}
        >
          <GaugeCircle size={18} />
          项目分析
        </a>
        <div className="data-status">
          <span>
            <i />
            数据状态
          </span>
          <strong>{loading ? "加载中" : "Local live"}</strong>
          <em>文件 {health.filesScanned ?? 0} · 事件 {health.tokenEvents ?? 0}</em>
          <small title={(runtimeConfig.sourceRoots || []).join("\n")}>
            数据源 {runtimeConfig.sourceRoots?.length ?? 0} 个
          </small>
        </div>
      </nav>

      <section className="dashboard" id="overview">
        <header className="topbar">
          <div>
            <h1>Codex Usage Monitor</h1>
            <span className="live-pill">Local live</span>
          </div>
          <div className="topbar-actions">
            <RangeTabs value={range} onChange={setRange} />
            <button className="sync-button" type="button" onClick={handleCollect} disabled={syncing}>
              <RefreshCw size={16} className={syncing ? "spin" : ""} />
              {syncing ? "同步中" : "手动同步"}
            </button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="main-column">
          <div className="gauge-grid">
            <Gauge quota={quota.primary} accent="cyan" />
            <Gauge quota={quota.secondary} accent="violet" />
          </div>

          <div className="metric-grid">
            {metricCards.map((card) => (
              <MetricCard key={card.label} {...card} />
            ))}
          </div>

          <ProjectDistribution projects={projects} totalTokens={totals.rangeTokens || 0} />

          <SessionRail sessions={recentSessions} />

          <footer className="footnote">
            <span>
              本工具只读取本机 Codex 数据。当前数据源：
              {runtimeConfig.sourceRoots?.map((root) => compactPath(root)).join("，") || "未配置"}
            </span>
            <span>最后更新：{formatDateTime(summary?.updatedAt)}</span>
          </footer>
        </div>
      </section>
    </main>
  );
}

function compactPath(value) {
  if (!value) return "";
  return value.replace(/^\/Users\/[^/]+/, "~");
}
