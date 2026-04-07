"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { ServiceDeployment, ServiceGroup, ServiceStatus, ServiceWithStatus } from "@/types";
import StatusBadge from "./StatusBadge";
import { ExternalLink, GitBranch, UserRound } from "lucide-react";
import { getGroupNavIcon } from "@/lib/navigation-icons";
import { cn, foregroundTextClass, mutedText2Class, mutedTextClass, softSurfaceClass, surfaceClass, toneTextClasses } from "@/lib/ui";

interface ProductHeaderProps {
  group: ServiceGroup;
  services: ServiceWithStatus[];
}

export default function ProductHeader({ group, services }: ProductHeaderProps) {
  const Icon = getGroupNavIcon(group.id);
  const operational = services.filter((service) => service.currentStatus === "operational").length;
  const total = services.length;
  const overallStatus = getOverallStatus(services);
  const owners = [...new Set(services.map((service) => service.owner?.memberName).filter(Boolean))];
  const responseTimes = services.map((service) => service.lastResponseTime).filter((time): time is number => time !== null);
  const avgLatency = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length)
    : null;
  const avgUptime = total > 0
    ? Math.round((services.reduce((sum, service) => sum + service.uptimePercent30d, 0) / total) * 100) / 100
    : 100;
  const maintenanceCount = services.filter((service) => service.activeMaintenance).length;
  const latestDeployment = services
    .map((service) => service.latestDeployment)
    .filter((deployment): deployment is ServiceDeployment => !!deployment)
    .sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime())[0] ?? null;

  return (
    <section className={cn("h-full rounded-[28px] p-5 sm:p-6", surfaceClass)}>
      <div className="flex h-full flex-col gap-6 xl:items-start">
        <div className="w-full">
          <div className="w-full flex items-start gap-4">
            <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl", softSurfaceClass)}>
              <Icon className={cn("h-6 w-6", foregroundTextClass)} />
            </div>

            <div className="w-full">
              <div className="w-full flex flex-wrap items-center justify-between gap-2">
                <p className={cn("text-[11px] font-semibold uppercase tracking-[0.22em]", mutedText2Class)}>
                  Project dashboard
                </p>
                <StatusBadge status={overallStatus} size="sm" />
              </div>

              <h1 className={cn("mt-2 text-[26px] font-semibold sm:text-[30px]", foregroundTextClass)}>
                {group.name}
              </h1>
              <p className={cn("mt-2 max-w-2xl text-sm leading-7", mutedTextClass)}>
                {group.description}
              </p>

              <div className={cn("mt-4 flex flex-wrap items-center gap-4 text-[12px]", mutedTextClass)}>
                {group.baseUrl && (
                  <a
                    href={group.baseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {group.baseUrl.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {group.repo && (
                  <a
                    href={`https://${group.repo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    {group.repo.replace("github.com/", "")}
                  </a>
                )}
                {owners.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound className="h-3.5 w-3.5" />
                    {owners.join(", ")}
                  </span>
                )}
                {latestDeployment && (
                  <span className="inline-flex items-center gap-1.5">
                    <GitBranch className="h-3.5 w-3.5" />
                    {latestDeployment.version} · {formatDistanceToNowStrict(new Date(latestDeployment.deployedAt), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="w-full h-full grid gap-3 sm:grid-cols-2">
          <StatBox label="Healthy services" value={`${operational}/${total}`} tone="operational" />
          <StatBox
            label="Avg latency"
            value={avgLatency !== null ? `${avgLatency}ms` : "--"}
            tone={avgLatency !== null && avgLatency <= 500 ? "operational" : avgLatency !== null && avgLatency <= 1200 ? "degraded" : "foreground"}
          />
          <StatBox
            label="30d uptime"
            value={`${avgUptime}%`}
            tone={avgUptime >= 99.9 ? "operational" : avgUptime >= 99 ? "degraded" : "down"}
          />
          <StatBox label="Maintenance" value={String(maintenanceCount)} tone={maintenanceCount > 0 ? "maintenance" : "foreground"} />
        </div>
      </div>
    </section>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string; tone: "foreground" | "operational" | "degraded" | "down" | "maintenance" }) {
  return (
    <div className={cn("rounded-2xl px-4 py-3.5", softSurfaceClass)}>
      <p className={cn("text-[11px] font-semibold uppercase tracking-[0.16em]", mutedText2Class)}>
        {label}
      </p>
      <p className={cn("mt-2 text-[30px] font-semibold", tone === "foreground" ? foregroundTextClass : toneTextClasses[tone])}>
        {value}
      </p>
    </div>
  );
}

function getOverallStatus(services: ServiceWithStatus[]): ServiceStatus {
  if (services.some((service) => service.currentStatus === "down")) return "down";
  if (services.some((service) => service.currentStatus === "degraded")) return "degraded";
  if (services.some((service) => service.currentStatus === "maintenance")) return "maintenance";
  if (services.some((service) => service.currentStatus === "unknown")) return "unknown";
  return "operational";
}
