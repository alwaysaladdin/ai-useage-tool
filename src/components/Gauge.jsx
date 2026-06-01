import { Clock3 } from "lucide-react";
import { formatDateTime, formatDurationToNow } from "../format.js";

export function Gauge({ quota, accent = "cyan" }) {
  const remaining = Math.round(quota?.remainingPercent ?? 0);
  const used = Math.round(quota?.usedPercent ?? 0);
  const resetText = quota?.resetsAt ? formatDateTime(quota.resetsAt) : "暂无";
  const countdown = quota?.resetsAt ? formatDurationToNow(quota.resetsAt) : "--";
  const circumference = 2 * Math.PI * 92;
  const dash = circumference * ((quota?.remainingPercent ?? 0) / 100);

  return (
    <section className={`gauge-card gauge-card--${accent}`}>
      <div className="gauge-copy">
        <div className="section-title">
          <span>{quota?.label || "额度窗口"}</span>
          <Clock3 size={15} />
        </div>
        <div className="quota-details">
          <span>重置倒计时</span>
          <strong>{countdown}</strong>
        </div>
        <div className="quota-details">
          <span>重置时间</span>
          <strong>{resetText}</strong>
        </div>
      </div>

      <div className="gauge-visual" aria-label={`${quota?.label || "额度"}剩余 ${remaining}%`}>
        <svg viewBox="0 0 240 240" role="img">
          <circle className="gauge-track" cx="120" cy="120" r="92" />
          <circle
            className="gauge-progress"
            cx="120"
            cy="120"
            r="92"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="gauge-center">
          <span>剩余额度</span>
          <strong>{remaining}%</strong>
          <em>已使用 {used}%</em>
        </div>
      </div>
    </section>
  );
}

