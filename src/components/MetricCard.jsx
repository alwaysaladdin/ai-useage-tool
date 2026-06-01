export function MetricCard({ icon, label, value, detail, tone = "cyan" }) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{detail}</em>
      </div>
    </article>
  );
}

