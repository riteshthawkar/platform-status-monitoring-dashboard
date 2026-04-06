"use client";

import { DashboardSummary } from "@/types";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  Activity,
} from "lucide-react";

interface OverallStatusProps {
  summary: DashboardSummary;
}

const statusInfo = {
  operational: {
    icon: CheckCircle2,
    title: "All Systems Operational",
    color: "var(--color-operational)",
  },
  degraded: {
    icon: AlertTriangle,
    title: "Partial System Outage",
    color: "var(--color-degraded)",
  },
  down: {
    icon: XCircle,
    title: "Major System Outage",
    color: "var(--color-down)",
  },
  maintenance: {
    icon: Wrench,
    title: "Scheduled Maintenance",
    color: "var(--color-maintenance)",
  },
  unknown: {
    icon: Activity,
    title: "Status Unknown",
    color: "var(--color-unknown)",
  },
};

export default function OverallStatus({ summary }: OverallStatusProps) {
  const info = statusInfo[summary.overallStatus] || statusInfo.unknown;
  const Icon = info.icon;
  const healthScore = summary.totalServices > 0
    ? Math.round((summary.operational / summary.totalServices) * 100)
    : 100;

  return (
    <div
      className="rounded-[24px] p-5 sm:p-6"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div
            className="rounded-2xl p-3"
            style={{
              background: `color-mix(in srgb, ${info.color} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${info.color} 20%, transparent)`,
            }}
          >
            <Icon className="w-5 h-5" style={{ color: info.color }} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted-2)" }}>
              Fleet status
            </p>
            <h2 className="text-[22px] sm:text-[26px] font-semibold mt-2" style={{ color: "var(--foreground)" }}>
              {info.title}
            </h2>
            <p className="text-sm mt-2 leading-6 max-w-2xl" style={{ color: "var(--muted)" }}>
              {summary.operational} of {summary.totalServices} services operational
              {summary.degraded > 0 && ` \u00b7 ${summary.degraded} degraded`}
              {summary.down > 0 && ` \u00b7 ${summary.down} down`}
              {summary.maintenance > 0 && ` \u00b7 ${summary.maintenance} in maintenance`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:min-w-[220px]">
          <MiniStat label="Health Score" value={`${healthScore}%`} color={info.color} />
          <MiniStat
            label="Updated"
            value={new Date(summary.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            color="var(--foreground)"
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-5">
        <StatCard label="Operational" count={summary.operational} color="var(--color-operational)" />
        <StatCard label="Degraded" count={summary.degraded} color="var(--color-degraded)" />
        <StatCard label="Down" count={summary.down} color="var(--color-down)" />
        <StatCard label="Maintenance" count={summary.maintenance} color="var(--color-maintenance)" />
      </div>
    </div>
  );
}

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
      className="rounded-[18px] p-3.5"
      style={{
        background: "rgba(11, 16, 24, 0.42)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--muted-2)" }}>{label}</p>
      <p className="text-[28px] leading-none font-semibold mt-3" style={{ color }}>{count}</p>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-[18px] px-4 py-3"
      style={{
        background: "rgba(11, 16, 24, 0.42)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--muted-2)" }}>{label}</p>
      <p className="text-base font-semibold mt-2" style={{ color }}>{value}</p>
    </div>
  );
}
