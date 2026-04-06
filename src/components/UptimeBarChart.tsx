"use client";

import { HealthCheckResult, ServiceStatus } from "@/types";

const statusColors: Record<ServiceStatus, string> = {
  operational: "var(--color-operational)",
  degraded: "var(--color-degraded)",
  down: "var(--color-down)",
  maintenance: "var(--color-maintenance)",
  unknown: "var(--color-unknown)",
};

interface UptimeBarChartProps {
  checks: HealthCheckResult[];
}

export default function UptimeBarChart({ checks }: UptimeBarChartProps) {
  const displayChecks = [...checks].reverse().slice(-50);

  if (displayChecks.length === 0) {
    return (
      <div className="flex items-center justify-center h-6 text-[11px]" style={{ color: "var(--muted-2)" }}>
        No check data yet
      </div>
    );
  }

  return (
    <div className="flex items-end gap-[2px] h-6">
      {displayChecks.map((check, i) => (
        <div
          key={i}
          className="uptime-bar-segment flex-1 rounded-sm min-w-[3px]"
          style={{
            background: statusColors[check.status],
            height:
              check.status === "operational"
                ? "100%"
                : check.status === "degraded"
                  ? "60%"
                  : "30%",
            opacity: check.status === "operational" ? 0.5 : 0.85,
          }}
          title={`${check.status} - ${check.responseTimeMs}ms - ${new Date(check.timestamp).toLocaleString()}`}
        />
      ))}
    </div>
  );
}

interface DailyUptimeBarProps {
  bars: Array<{
    date: string;
    status: ServiceStatus;
    uptimePercent: number;
    totalChecks: number;
    failedChecks: number;
  }>;
}

export function DailyUptimeBar({ bars }: DailyUptimeBarProps) {
  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center h-8 text-[11px]" style={{ color: "var(--muted-2)" }}>
        No uptime data yet
      </div>
    );
  }

  return (
    <div className="flex items-end gap-[1px] h-8">
      {bars.map((bar, i) => (
        <div
          key={i}
          className="uptime-bar-segment flex-1 rounded-sm min-w-[2px]"
          style={{
            background: statusColors[bar.status],
            height: `${Math.max(20, bar.uptimePercent)}%`,
            opacity: bar.status === "operational" ? 0.4 : 0.85,
          }}
          title={`${bar.date}: ${bar.uptimePercent}% uptime (${bar.totalChecks} checks, ${bar.failedChecks} failed)`}
        />
      ))}
    </div>
  );
}
