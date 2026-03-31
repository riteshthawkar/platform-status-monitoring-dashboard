"use client";

import { ServiceGroup, ServiceWithStatus, ServiceStatus } from "@/types";
import StatusBadge from "./StatusBadge";
import {
  GraduationCap,
  Landmark,
  Globe,
  BrainCircuit,
  ExternalLink,
  GitBranch,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  GraduationCap,
  Landmark,
  Globe,
  BrainCircuit,
};

const colorMap: Record<string, { gradient: string; border: string; iconBg: string }> = {
  violet: {
    gradient: "from-violet-500/15 to-violet-600/5",
    border: "border-violet-500/25",
    iconBg: "bg-violet-500/20 text-violet-400",
  },
  sky: {
    gradient: "from-sky-500/15 to-sky-600/5",
    border: "border-sky-500/25",
    iconBg: "bg-sky-500/20 text-sky-400",
  },
  rose: {
    gradient: "from-rose-500/15 to-rose-600/5",
    border: "border-rose-500/25",
    iconBg: "bg-rose-500/20 text-rose-400",
  },
  amber: {
    gradient: "from-amber-500/15 to-amber-600/5",
    border: "border-amber-500/25",
    iconBg: "bg-amber-500/20 text-amber-400",
  },
};

interface ProductHeaderProps {
  group: ServiceGroup;
  services: ServiceWithStatus[];
}

export default function ProductHeader({ group, services }: ProductHeaderProps) {
  const Icon = iconMap[group.icon] || Globe;
  const colors = colorMap[group.color] || colorMap.amber;

  const operational = services.filter((s) => s.currentStatus === "operational").length;
  const total = services.length;

  let overallStatus: ServiceStatus = "operational";
  if (services.some((s) => s.currentStatus === "down")) overallStatus = "down";
  else if (services.some((s) => s.currentStatus === "degraded")) overallStatus = "degraded";
  else if (services.some((s) => s.currentStatus === "maintenance")) overallStatus = "maintenance";
  else if (services.some((s) => s.currentStatus === "unknown")) overallStatus = "unknown";

  // Average response time
  const responseTimes = services
    .map((s) => s.lastResponseTime)
    .filter((t): t is number => t !== null);
  const avgResponseTime =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

  // Average uptime
  const avgUptime =
    services.length > 0
      ? Math.round((services.reduce((a, s) => a + s.uptimePercent30d, 0) / services.length) * 100) / 100
      : 100;

  return (
    <div
      className={`rounded-2xl border ${colors.border} bg-gradient-to-r ${colors.gradient} p-5 mb-6`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${colors.iconBg}`}>
            <Icon className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">{group.name}</h2>
              <StatusBadge status={overallStatus} size="sm" />
            </div>
            <p className="text-sm text-gray-400 mt-1">{group.description}</p>

            {/* Links */}
            <div className="flex items-center gap-4 mt-3">
              {group.baseUrl && (
                <a
                  href={group.baseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {group.baseUrl.replace("https://", "")}
                </a>
              )}
              {group.repo && (
                <a
                  href={`https://${group.repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <GitBranch className="w-3 h-3" />
                  {group.repo.replace("github.com/", "")}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-xl font-bold text-emerald-400">
              {operational}/{total}
            </p>
            <p className="text-[10px] text-gray-500 uppercase">Healthy</p>
          </div>
          {avgResponseTime !== null && (
            <div className="text-center">
              <p className="text-xl font-bold text-gray-300">{avgResponseTime}ms</p>
              <p className="text-[10px] text-gray-500 uppercase">Avg Latency</p>
            </div>
          )}
          <div className="text-center">
            <p
              className={`text-xl font-bold ${
                avgUptime >= 99.9
                  ? "text-emerald-400"
                  : avgUptime >= 99
                    ? "text-amber-400"
                    : "text-red-400"
              }`}
            >
              {avgUptime}%
            </p>
            <p className="text-[10px] text-gray-500 uppercase">30d Uptime</p>
          </div>
        </div>
      </div>
    </div>
  );
}
