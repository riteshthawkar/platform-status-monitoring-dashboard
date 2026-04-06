"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Users,
  WifiOff,
} from "lucide-react";
import OverallStatus from "./OverallStatus";
import StatusBadge from "./StatusBadge";
import { useDashboardData } from "./useDashboardData";
import { ServiceStatus, ServiceWithStatus } from "@/types";
import { serviceGroups } from "@/lib/services-config";

export default function ProjectsOverview() {
  const {
    data,
    loading,
    error,
    isChecking,
    autoRefresh,
    connectionMode,
    fetchStatus,
    triggerCheck,
    setAutoRefresh,
  } = useDashboardData();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="flex items-center gap-3" style={{ color: "var(--muted)" }}>
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading platform overview...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="text-center">
          <p className="text-sm mb-2" style={{ color: "var(--color-down)" }}>Failed to load platform overview</p>
          <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>{error}</p>
          <button
            onClick={fetchStatus}
            className="px-3 py-1.5 rounded-md text-xs transition-colors"
            style={{ background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const projectCards = serviceGroups.map((group) => {
    const services = data.services.filter((service) => service.group === group.id);
    const incidents = data.activeIncidents.filter((incident) => services.some((service) => service.id === incident.serviceId));
    const maintenance = data.activeMaintenanceWindows.filter((window) => window.serviceGroup === group.id);
    const healthy = services.filter((service) => service.currentStatus === "operational").length;
    const degraded = services.filter((service) => service.currentStatus === "degraded").length;
    const down = services.filter((service) => service.currentStatus === "down").length;
    const ownerCoverage = services.filter((service) => service.owner?.memberId).length;
    const avgUptime = services.length > 0
      ? Math.round((services.reduce((sum, service) => sum + service.uptimePercent30d, 0) / services.length) * 100) / 100
      : 0;

    return {
      group,
      services,
      incidents,
      maintenance,
      healthy,
      degraded,
      down,
      ownerCoverage,
      avgUptime,
      status: getProjectStatus(services),
    };
  });

  const attentionProjects = projectCards.filter((project) => project.status === "down" || project.status === "degraded").length;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <header
        className="sticky top-0 z-50 backdrop-blur-xl"
        style={{ background: "rgba(10, 10, 11, 0.85)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Activity className="w-[18px] h-[18px]" style={{ color: "var(--accent)" }} />
            <div>
              <h1 className="text-sm font-semibold leading-none" style={{ color: "var(--foreground)" }}>Platform Status</h1>
              <p className="text-[11px] mt-1" style={{ color: "var(--muted-2)" }}>
                Project portfolio overview
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link
              href="/team"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
              style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
            >
              <Users className="w-3.5 h-3.5" />
              Team
            </Link>

            {connectionMode === "live" ? (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md" style={{ color: "var(--color-operational)" }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--color-operational)" }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "var(--color-operational)" }} />
                </span>
                Live
              </span>
            ) : connectionMode === "connecting" ? (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md" style={{ color: "var(--color-degraded)" }}>
                <RefreshCw className="w-3 h-3 animate-spin" />
                Connecting
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md" style={{ color: "var(--muted)" }}>
                <WifiOff className="w-3 h-3" />
                Polling
              </span>
            )}

            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="text-xs px-2.5 py-1.5 rounded-md transition-colors"
              style={{
                color: autoRefresh ? "var(--color-operational)" : "var(--muted)",
                border: `1px solid ${autoRefresh ? "rgba(61, 214, 140, 0.15)" : "var(--border)"}`,
                background: autoRefresh ? "rgba(61, 214, 140, 0.06)" : "transparent",
              }}
            >
              {autoRefresh ? "Auto ON" : "Auto OFF"}
            </button>

            <button
              onClick={triggerCheck}
              disabled={isChecking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <RefreshCw className={`w-3 h-3 ${isChecking ? "animate-spin" : ""}`} />
              {isChecking ? "Checking..." : "Check All"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1380px] mx-auto px-4 sm:px-6 py-6">
        <section
          className="relative overflow-hidden rounded-[28px] p-5 sm:p-6 lg:p-7 mb-6"
          style={{
            background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--card)) 0%, var(--card) 42%, color-mix(in srgb, var(--color-operational) 10%, var(--card)) 100%)",
            border: "1px solid color-mix(in srgb, var(--accent) 16%, var(--border))",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(circle at top right, rgba(124, 102, 220, 0.24), transparent 34%), radial-gradient(circle at bottom left, rgba(61, 214, 140, 0.16), transparent 30%)",
            }}
          />

          <div className="relative">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <div
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
                  style={{
                    color: "var(--foreground)",
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <Activity className="w-3 h-3" style={{ color: attentionProjects > 0 ? "var(--color-degraded)" : "var(--color-operational)" }} />
                  Portfolio Status Board
                </div>
                <h2 className="text-[26px] leading-tight sm:text-[34px] font-semibold mt-4" style={{ color: "var(--foreground)" }}>
                  Project-Level Health At A Glance
                </h2>
                <p className="text-sm sm:text-[15px] leading-7 mt-3 max-w-2xl" style={{ color: "var(--muted)" }}>
                  Each card represents the complete health of a project. Open a project to inspect the individual services, dependencies, incidents, and maintenance windows under it.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:min-w-[340px]">
                <SignalCard label="Projects" value={`${projectCards.length}`} hint="Monitored product groups" tone="var(--foreground)" />
                <SignalCard label="Attention" value={`${attentionProjects}`} hint="Projects with active issues" tone={attentionProjects > 0 ? "var(--color-down)" : "var(--color-operational)"} />
                <SignalCard label="Incidents" value={`${data.activeIncidents.length}`} hint="Open incidents across the platform" tone={data.activeIncidents.length > 0 ? "var(--color-degraded)" : "var(--foreground)"} />
                <SignalCard label="Updated" value={new Date(data.summary.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} hint={connectionMode === "live" ? "Live stream active" : "Fallback sync mode"} tone="var(--foreground)" />
              </div>
            </div>

            <div className="mt-6">
              <OverallStatus summary={data.summary} />
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {projectCards.map((project) => (
            <Link
              key={project.group.id}
              href={`/projects/${project.group.id}`}
              className="block rounded-[24px] p-5 transition-transform"
              style={{
                background: "color-mix(in srgb, var(--panel) 92%, transparent)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-soft)",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--muted-2)" }}>
                    {project.group.shortName}
                  </p>
                  <h3 className="text-lg font-semibold mt-2" style={{ color: "var(--foreground)" }}>
                    {project.group.name}
                  </h3>
                  <p className="text-sm leading-6 mt-2" style={{ color: "var(--muted)" }}>
                    {project.group.description}
                  </p>
                </div>
                <StatusBadge status={project.status} size="sm" />
              </div>

              <div className="grid grid-cols-2 gap-3 mt-5">
                <ProjectMetric label="Healthy" value={`${project.healthy}/${project.services.length}`} tone="var(--color-operational)" />
                <ProjectMetric label="30d Uptime" value={`${project.avgUptime}%`} tone={project.avgUptime >= 99.9 ? "var(--color-operational)" : project.avgUptime >= 99 ? "var(--color-degraded)" : "var(--color-down)"} />
                <ProjectMetric label="Incidents" value={`${project.incidents.length}`} tone={project.incidents.length > 0 ? "var(--color-degraded)" : "var(--foreground)"} />
                <ProjectMetric label="Ownership" value={`${project.ownerCoverage}/${project.services.length}`} tone={project.ownerCoverage === project.services.length ? "var(--color-operational)" : "var(--color-degraded)"} />
              </div>

              <div className="flex items-center gap-2 mt-5 text-[12px]" style={{ color: "var(--muted)" }}>
                {project.down > 0 && <span style={{ color: "var(--color-down)" }}>{project.down} down</span>}
                {project.degraded > 0 && <span style={{ color: "var(--color-degraded)" }}>{project.degraded} degraded</span>}
                {project.maintenance.length > 0 && <span style={{ color: "var(--color-maintenance)" }}>{project.maintenance.length} in maintenance</span>}
                {project.down === 0 && project.degraded === 0 && project.maintenance.length === 0 && (
                  <span style={{ color: "var(--color-operational)" }}>All tracked services operational</span>
                )}
              </div>

              <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                  Open project dashboard
                </span>
                <ChevronRight className="w-4 h-4" style={{ color: "var(--muted)" }} />
              </div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}

function getProjectStatus(services: ServiceWithStatus[]): ServiceStatus {
  if (services.some((service) => service.currentStatus === "down")) return "down";
  if (services.some((service) => service.currentStatus === "degraded")) return "degraded";
  if (services.some((service) => service.currentStatus === "maintenance")) return "maintenance";
  if (services.some((service) => service.currentStatus === "unknown")) return "unknown";
  return "operational";
}

function ProjectMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      className="rounded-[18px] px-4 py-3"
      style={{
        background: "rgba(11, 16, 24, 0.42)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--muted-2)" }}>{label}</p>
      <p className="text-base font-semibold mt-2" style={{ color: tone }}>{value}</p>
    </div>
  );
}

function SignalCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <div
      className="rounded-[18px] px-4 py-3"
      style={{
        background: "rgba(11, 16, 24, 0.42)",
        border: "1px solid rgba(255, 255, 255, 0.07)",
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--muted-2)" }}>{label}</p>
      <p className="text-base font-semibold mt-2" style={{ color: tone }}>{value}</p>
      <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>{hint}</p>
    </div>
  );
}
