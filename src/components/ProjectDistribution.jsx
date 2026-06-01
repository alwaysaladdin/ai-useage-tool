import { formatCompactTokens, formatPercent, formatRelativeTime } from "../format.js";

const colors = ["#55dfe7", "#a58cff", "#ff7fa0", "#ffd15c", "#9aabb6", "#6fb3ff", "#66d68c"];
const minVisibleShare = 0.01;

export function ProjectDistribution({ projects, totalTokens }) {
  const segments = buildSegments(projects);

  return (
    <section className="distribution-panel" id="projects">
      <div className="panel-header">
        <h2>项目使用分布</h2>
        <span>{formatCompactTokens(totalTokens)}</span>
      </div>
      <div className="distribution-grid">
        <div className="donut-wrap">
          <svg className="project-donut" viewBox="0 0 220 220">
            <circle className="donut-empty" cx="110" cy="110" r="78" />
            {segments.map((segment) => (
              <circle
                key={segment.key}
                className="donut-segment"
                cx="110"
                cy="110"
                r="78"
                stroke={segment.color}
                strokeDasharray={`${segment.length} ${segment.gap}`}
                strokeDashoffset={segment.offset}
              />
            ))}
          </svg>
          <div className="donut-center">
            <span>当前窗口</span>
            <strong>{formatCompactTokens(totalTokens)}</strong>
            <em>Token</em>
          </div>
        </div>

        <div className="project-table" role="table" aria-label="项目 token 排行">
          <div className="project-row project-row--head" role="row">
            <span>项目</span>
            <span>Tokens</span>
            <span>占比</span>
            <span>会话</span>
            <span>最近活跃</span>
          </div>
          {projects.length === 0 ? (
            <div className="empty-state">暂无 Codex token 数据</div>
          ) : (
            projects.map((project, index) => (
              <div className="project-row" role="row" key={project.projectKey}>
                <span>
                  <i style={{ background: colors[index % colors.length] }} />
                  {project.projectName}
                </span>
                <strong>{formatCompactTokens(project.tokens)}</strong>
                <strong>{formatPercent(project.share)}</strong>
                <span>{project.sessions}</span>
                <span>{formatRelativeTime(project.lastActiveAt)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function buildSegments(projects) {
  const circumference = 2 * Math.PI * 78;
  let cursor = 0;

  // Very small segments render as chunky slivers because the donut stroke is thick.
  // Keep those rows in the table, but omit them from the chart and normalize the rest.
  const visibleProjects = projects.filter((project) => project.share >= minVisibleShare);
  const visibleShareTotal = visibleProjects.reduce((sum, project) => sum + project.share, 0);

  return visibleProjects.map((project) => {
    const originalIndex = projects.findIndex((entry) => entry.projectKey === project.projectKey);
    const normalizedShare = visibleShareTotal > 0 ? project.share / visibleShareTotal : 0;
    const length = Math.max(0, normalizedShare * circumference);
    const segment = {
      key: project.projectKey,
      color: colors[originalIndex % colors.length],
      length,
      gap: circumference - length,
      offset: -cursor,
    };
    cursor += length;
    return segment;
  });
}
