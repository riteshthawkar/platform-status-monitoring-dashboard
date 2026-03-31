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
    bgGradient: "from-emerald-500/20 to-emerald-600/5",
    borderColor: "border-emerald-500/30",
    iconColor: "text-emerald-400",
  },
  degraded: {
    icon: AlertTriangle,
    title: "Partial System Outage",
    bgGradient: "from-amber-500/20 to-amber-600/5",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-400",
  },
  down: {
    icon: XCircle,
    title: "Major System Outage",
    bgGradient: "from-red-500/20 to-red-600/5",
    borderColor: "border-red-500/30",
    iconColor: "text-red-400",
  },
  maintenance: {
    icon: Wrench,
    title: "Scheduled Maintenance",
    bgGradient: "from-indigo-500/20 to-indigo-600/5",
    borderColor: "border-indigo-500/30",
    iconColor: "text-indigo-400",
  },
  unknown: {
    icon: Activity,
    title: "Status Unknown",
    bgGradient: "from-gray-500/20 to-gray-600/5",
    borderColor: "border-gray-500/30",
    iconColor: "text-gray-400",
  },
};

export default function OverallStatus({ summary }: OverallStatusProps) {
  const info = statusInfo[summary.overallStatus] || statusInfo.unknown;
  const Icon = info.icon;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${info.borderColor} bg-gradient-to-r ${info.bgGradient} p-6 mb-8`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Icon className={`w-10 h-10 ${info.iconColor}`} />
          <div>
            <h2 className="text-2xl font-bold text-white">{info.title}</h2>
            <p className="text-sm text-gray-400 mt-1">
              {summary.operational} of {summary.totalServices} services
              operational
              {summary.degraded > 0 &&
                ` | ${summary.degraded} degraded`}
              {summary.down > 0 && ` | ${summary.down} down`}
              {summary.maintenance > 0 &&
                ` | ${summary.maintenance} in maintenance`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Last updated</p>
          <p className="text-sm text-gray-300">
            {new Date(summary.lastUpdated).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <StatCard
          label="Operational"
          count={summary.operational}
          color="text-emerald-400"
        />
        <StatCard
          label="Degraded"
          count={summary.degraded}
          color="text-amber-400"
        />
        <StatCard
          label="Down"
          count={summary.down}
          color="text-red-400"
        />
        <StatCard
          label="Maintenance"
          count={summary.maintenance}
          color="text-indigo-400"
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-gray-900/50 p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{count}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
