"use client";

import { DashboardSummary } from "@/types";
import { Activity, AlertTriangle, CheckCircle2, Wrench, XCircle } from "lucide-react";
import { cn, foregroundTextClass, mutedText2Class, mutedTextClass, toneTextClasses } from "@/lib/ui";

interface OverallStatusProps {
  summary: DashboardSummary;
}

const statusInfo = {
  operational: { icon: CheckCircle2, title: "Platform stable", description: "All monitored services are currently operational.", tone: "operational" as const },
  degraded: { icon: AlertTriangle, title: "Partial degradation detected", description: "Some services are responding, but at least one dependency is degraded.", tone: "degraded" as const },
  down: { icon: XCircle, title: "Critical service disruption", description: "One or more monitored services are currently down.", tone: "down" as const },
  maintenance: { icon: Wrench, title: "Planned maintenance in progress", description: "The platform includes services in an active maintenance window.", tone: "maintenance" as const },
  unknown: { icon: Activity, title: "Status being established", description: "Not enough recent checks to determine current state.", tone: "unknown" as const },
};

export default function OverallStatus({ summary }: OverallStatusProps) {
  const info = statusInfo[summary.overallStatus] || statusInfo.unknown;
  const Icon = info.icon;
  const healthScore = summary.totalServices > 0
    ? Math.round((summary.operational / summary.totalServices) * 100)
    : 100;

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 sm:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl",
            info.tone === "operational" && "bg-[color-mix(in_srgb,var(--color-operational)_10%,transparent)] text-[var(--color-operational)]",
            info.tone === "degraded" && "bg-[color-mix(in_srgb,var(--color-degraded)_10%,transparent)] text-[var(--color-degraded)]",
            info.tone === "down" && "bg-[color-mix(in_srgb,var(--color-down)_10%,transparent)] text-[var(--color-down)]",
            info.tone === "maintenance" && "bg-[color-mix(in_srgb,var(--color-maintenance)_10%,transparent)] text-[var(--color-maintenance)]",
            info.tone === "unknown" && "bg-[color-mix(in_srgb,var(--color-unknown)_10%,transparent)] text-[var(--color-unknown)]",
          )}>
            <Icon className="h-5 w-5" />
          </div>

          <div className="max-w-2xl">
            <p className={cn("text-xs font-medium", mutedTextClass)}>Fleet status</p>
            <h2 className={cn("mt-1 text-xl font-bold tracking-tight", foregroundTextClass)}>{info.title}</h2>
            <p className={cn("mt-1 text-sm", mutedTextClass)}>{info.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:min-w-[240px]">
          <div className="rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-3">
            <p className={cn("text-[10px] font-medium uppercase tracking-wider", mutedText2Class)}>Health</p>
            <p className={cn("mt-1.5 text-lg font-bold", toneTextClasses[info.tone])}>{healthScore}%</p>
          </div>
          <div className="rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-3">
            <p className={cn("text-[10px] font-medium uppercase tracking-wider", mutedText2Class)}>Last update</p>
            <p className={cn("mt-1.5 text-lg font-bold", foregroundTextClass)}>
              {new Date(summary.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-5 flex gap-1">
        {Array.from({ length: 20 }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              index < Math.max(1, Math.round(healthScore / 5))
                ? summary.overallStatus === "down"
                  ? "bg-[var(--color-down)]"
                  : summary.overallStatus === "degraded"
                    ? "bg-[var(--color-degraded)]"
                    : "bg-[var(--accent)]"
                : "bg-[var(--surface-glass-soft)]",
            )}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusTile label="Operational" count={summary.operational} tone="operational" />
        <StatusTile label="Degraded" count={summary.degraded} tone="degraded" />
        <StatusTile label="Down" count={summary.down} tone="down" />
        <StatusTile label="Maintenance" count={summary.maintenance} tone="maintenance" />
      </div>
    </section>
  );
}

function StatusTile({ label, count, tone }: { label: string; count: number; tone: "operational" | "degraded" | "down" | "maintenance" }) {
  return (
    <div className="rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-3">
      <p className={cn("text-[10px] font-medium uppercase tracking-wider", mutedText2Class)}>{label}</p>
      <p className={cn("mt-2 text-2xl font-bold leading-none", toneTextClasses[tone])}>{count}</p>
    </div>
  );
}
