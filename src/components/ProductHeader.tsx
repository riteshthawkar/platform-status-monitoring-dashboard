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

interface ProductHeaderProps {
  group: ServiceGroup;
  services: ServiceWithStatus[];
}

export default function ProductHeader({ group, services }: ProductHeaderProps) {
  const Icon = iconMap[group.icon] || Globe;

  const operational = services.filter((s) => s.currentStatus === "operational").length;
  const total = services.length;

  let overallStatus: ServiceStatus = "operational";
  if (services.some((s) => s.currentStatus === "down")) overallStatus = "down";
  else if (services.some((s) => s.currentStatus === "degraded")) overallStatus = "degraded";
  else if (services.some((s) => s.currentStatus === "maintenance")) overallStatus = "maintenance";
  else if (services.some((s) => s.currentStatus === "unknown")) overallStatus = "unknown";

  const responseTimes = services
    .map((s) => s.lastResponseTime)
    .filter((t): t is number => t !== null);
  const avgResponseTime =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

  const avgUptime =
    services.length > 0
      ? Math.round((services.reduce((a, s) => a + s.uptimePercent30d, 0) / services.length) * 100) / 100
      : 100;
  const owners = [...new Set(services.map((service) => service.owner?.memberName).filter(Boolean))];
  const activeMaintenanceCount = services.filter((service) => service.activeMaintenance).length;

  return (
    <div
      className="rounded-lg p-5 mb-6"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="p-2.5 rounded-md"
            style={{ background: "var(--background-secondary)" }}
          >
            <Icon className="w-5 h-5" style={{ color: "var(--muted)" }} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-semibold" style={{ color: "var(--foreground)" }}>{group.name}</h2>
              <StatusBadge status={overallStatus} size="sm" />
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{group.description}</p>

            <div className="flex items-center gap-3 mt-2.5">
              {group.baseUrl && (
                <a
                  href={group.baseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] transition-colors"
                  style={{ color: "var(--muted-2)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--foreground)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-2)"; }}
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
                  className="inline-flex items-center gap-1 text-[11px] transition-colors"
                  style={{ color: "var(--muted-2)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--foreground)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-2)"; }}
                >
                  <GitBranch className="w-3 h-3" />
                  {group.repo.replace("github.com/", "")}
                </a>
              )}
              {owners.length > 0 && (
                <span className="text-[11px]" style={{ color: "var(--muted-2)" }}>
                  Owners: {owners.join(", ")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-5">
          <div className="text-center">
            <p className="text-lg font-semibold" style={{ color: "var(--color-operational)" }}>
              {operational}/{total}
            </p>
            <p className="text-[10px] uppercase" style={{ color: "var(--muted-2)" }}>Healthy</p>
          </div>
          {avgResponseTime !== null && (
            <div className="text-center">
              <p className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>{avgResponseTime}ms</p>
              <p className="text-[10px] uppercase" style={{ color: "var(--muted-2)" }}>Avg Latency</p>
            </div>
          )}
          <div className="text-center">
            <p
              className="text-lg font-semibold"
              style={{
                color: avgUptime >= 99.9
                  ? "var(--color-operational)"
                  : avgUptime >= 99
                    ? "var(--color-degraded)"
                    : "var(--color-down)",
              }}
            >
              {avgUptime}%
            </p>
            <p className="text-[10px] uppercase" style={{ color: "var(--muted-2)" }}>30d Uptime</p>
          </div>
          {activeMaintenanceCount > 0 && (
            <div className="text-center">
              <p className="text-lg font-semibold" style={{ color: "var(--color-maintenance)" }}>{activeMaintenanceCount}</p>
              <p className="text-[10px] uppercase" style={{ color: "var(--muted-2)" }}>Maint.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
