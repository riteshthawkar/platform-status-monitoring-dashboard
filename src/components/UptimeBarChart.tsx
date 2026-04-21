"use client";

import { HealthCheckResult, ServiceStatus } from "@/types";
import { cn, mutedText2Class } from "@/lib/ui";

const statusClasses: Record<ServiceStatus, { bg: string; height: string; opacity: string }> = {
  operational: { bg: "bg-[var(--color-operational)]", height: "h-full", opacity: "opacity-50" },
  degraded: { bg: "bg-[var(--color-degraded)]", height: "h-[60%]", opacity: "opacity-85" },
  down: { bg: "bg-[var(--color-down)]", height: "h-[30%]", opacity: "opacity-85" },
  maintenance: { bg: "bg-[var(--color-maintenance)]", height: "h-[30%]", opacity: "opacity-85" },
  unknown: { bg: "bg-[var(--color-unknown)]", height: "h-[30%]", opacity: "opacity-85" },
};

interface UptimeBarChartProps {
  checks: HealthCheckResult[];
}

export default function UptimeBarChart({ checks }: UptimeBarChartProps) {
  const displayChecks = [...checks].reverse().slice(-50);

  if (displayChecks.length === 0) {
    return (
      <div className={cn("flex h-6 items-center justify-center text-[11px]", mutedText2Class)}>
        No check data yet
      </div>
    );
  }

  return (
    <div className="flex items-end gap-[2px] h-6">
      {displayChecks.map((check, i) => (
        <div
          key={i}
          className={cn(
            "uptime-bar-segment min-w-[3px] flex-1 rounded-sm",
            statusClasses[check.status].bg,
            statusClasses[check.status].height,
            statusClasses[check.status].opacity,
          )}
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
      <div className={cn("flex h-8 items-center justify-center text-[11px]", mutedText2Class)}>
        No uptime data yet
      </div>
    );
  }

  return (
    <div className="flex items-end gap-[1px] h-8">
      {bars.map((bar, i) => (
        <div
          key={i}
          className={cn(
            "uptime-bar-segment min-w-[2px] flex-1 rounded-sm",
            statusClasses[bar.status].bg,
            bar.uptimePercent >= 95
              ? "h-full"
              : bar.uptimePercent >= 80
                ? "h-[80%]"
                : bar.uptimePercent >= 60
                  ? "h-[60%]"
                  : bar.uptimePercent >= 40
                    ? "h-[40%]"
                    : "h-[20%]",
            bar.status === "operational" ? "opacity-40" : "opacity-85",
          )}
          title={`${bar.date}: ${bar.uptimePercent}% uptime (${bar.totalChecks} checks, ${bar.failedChecks} failed)`}
        />
      ))}
    </div>
  );
}
