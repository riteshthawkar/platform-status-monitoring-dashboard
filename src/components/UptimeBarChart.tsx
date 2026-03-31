"use client";

import { HealthCheckResult, ServiceStatus } from "@/types";

const statusColors: Record<ServiceStatus, string> = {
  operational: "bg-emerald-400",
  degraded: "bg-amber-400",
  down: "bg-red-400",
  maintenance: "bg-indigo-400",
  unknown: "bg-gray-600",
};

interface UptimeBarChartProps {
  checks: HealthCheckResult[];
}

export default function UptimeBarChart({ checks }: UptimeBarChartProps) {
  // Show the last 50 checks in chronological order (oldest first)
  const displayChecks = [...checks].reverse().slice(-50);

  if (displayChecks.length === 0) {
    return (
      <div className="flex items-center justify-center h-6 text-xs text-gray-600">
        No check data yet
      </div>
    );
  }

  return (
    <div className="flex items-end gap-[2px] h-6">
      {displayChecks.map((check, i) => (
        <div
          key={i}
          className={`uptime-bar-segment flex-1 rounded-sm min-w-[3px] ${statusColors[check.status]}`}
          style={{
            height:
              check.status === "operational"
                ? "100%"
                : check.status === "degraded"
                  ? "60%"
                  : "30%",
            opacity: check.status === "operational" ? 0.6 : 0.9,
          }}
          title={`${check.status} - ${check.responseTimeMs}ms - ${new Date(check.timestamp).toLocaleString()}`}
        />
      ))}
    </div>
  );
}

// 90-day bar chart for service detail pages
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
      <div className="flex items-center justify-center h-8 text-xs text-gray-600">
        No uptime data yet
      </div>
    );
  }

  return (
    <div className="flex items-end gap-[1px] h-8">
      {bars.map((bar, i) => (
        <div
          key={i}
          className={`uptime-bar-segment flex-1 rounded-sm min-w-[2px] ${statusColors[bar.status]}`}
          style={{
            height: `${Math.max(20, bar.uptimePercent)}%`,
            opacity: bar.status === "operational" ? 0.5 : 0.9,
          }}
          title={`${bar.date}: ${bar.uptimePercent}% uptime (${bar.totalChecks} checks, ${bar.failedChecks} failed)`}
        />
      ))}
    </div>
  );
}
