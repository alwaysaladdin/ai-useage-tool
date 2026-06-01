const ranges = [
  { key: "today", label: "今日" },
  { key: "7d", label: "近 7 天" },
  { key: "month", label: "本月" },
  { key: "30d", label: "近 30 天" },
];

export function RangeTabs({ value, onChange }) {
  return (
    <div className="range-tabs" aria-label="时间窗口">
      {ranges.map((range) => (
        <button
          key={range.key}
          className={range.key === value ? "range-tab is-active" : "range-tab"}
          type="button"
          onClick={() => onChange(range.key)}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

