"use client";

import Link from "next/link";
import { formatDistanceToNowStrict, isAfter, subHours } from "date-fns";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
  TrendingUp,
  WifiOff,
  Zap,
} from "lucide-react";
import AppHeader from "./AppHeader";
import StatusBadge from "./StatusBadge";
import { useDashboardData } from "./useDashboardData";
import { ServiceDeployment, ServiceStatus, ServiceWithStatus } from "@/types";
import { serviceGroups } from "@/lib/services-config";
import {
  accentButtonClass,
  cn,
  foregroundTextClass,
  mutedText2Class,
  mutedTextClass,
  pageClass,
  softSurfaceClass,
  surfaceClass,
  toneChipClasses,
  toneTextClasses,
} from "@/lib/ui";

type Tone = "foreground" | "operational" | "degraded" | "down" | "maintenance";

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
      <div className={cn(pageClass, "flex items-center justify-center py-20")}>
        <div className={cn("flex items-center gap-3 text-sm", mutedTextClass)}>
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading portfolio...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={cn(pageClass, "flex items-center justify-center py-20")}>
        <div className={cn("w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 text-center")}>
          <p className={cn("text-sm font-medium", toneTextClasses.down)}>
            Failed to load the portfolio
          </p>
          <p className={cn("mt-2 text-xs leading-6", mutedTextClass)}>{error}</p>
          <button onClick={fetchStatus} className={cn("mt-5 px-4 py-2 text-xs font-medium", accentButtonClass)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const projectRows = serviceGroups.map((group) => {
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
    const latestDeployment = services
      .map((service) => service.latestDeployment)
      .filter((deployment): deployment is ServiceDeployment => !!deployment)
      .sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime())[0] ?? null;

    return { group, services, incidents, maintenance, healthy, degraded, down, ownerCoverage, avgUptime, latestDeployment, status: getProjectStatus(services) };
  });

  const sortedProjects = [...projectRows].sort((a, b) => {
    const scoreDiff = getProjectPriorityScore(b.status, b.incidents.length, b.down, b.degraded)
      - getProjectPriorityScore(a.status, a.incidents.length, a.down, a.degraded);
    if (scoreDiff !== 0) return scoreDiff;
    return a.group.name.localeCompare(b.group.name);
  });

  const healthScore = projectRows.length > 0
    ? Math.round((projectRows.filter((project) => project.status === "operational").length / projectRows.length) * 100)
    : 100;
  const projectsNeedingAttention = sortedProjects.filter((project) => project.status === "down" || project.status === "degraded");
  const ownerCoveragePercent = data.services.length > 0
    ? Math.round((data.services.filter((service) => service.owner?.memberId).length / data.services.length) * 100)
    : 0;
  const fleetUptime = data.services.length > 0
    ? Math.round((data.services.reduce((sum, service) => sum + service.uptimePercent30d, 0) / data.services.length) * 100) / 100
    : 100;
  const deploymentsLast24h = data.recentDeployments.filter((deployment) =>
    isAfter(new Date(deployment.deployedAt), subHours(new Date(), 24))
  ).length;

  return (
    <div className={pageClass}>
      <AppHeader />

      <main className="space-y-5">
        {/* Top controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ConnectionBadge mode={connectionMode} />
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                "rounded-xl px-3.5 py-2 text-xs font-medium transition-colors",
                autoRefresh
                  ? "bg-[color-mix(in_srgb,var(--color-operational)_8%,transparent)] text-[var(--color-operational)]"
                  : "bg-[var(--surface-glass-soft)] text-[var(--muted)]",
              )}
            >
              {autoRefresh ? "Auto refresh on" : "Auto refresh off"}
            </button>
          </div>

          <button
            onClick={triggerCheck}
            disabled={isChecking}
            className={cn("inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold disabled:opacity-50", accentButtonClass)}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isChecking && "animate-spin")} />
            {isChecking ? "Checking..." : "Check all"}
          </button>
        </div>

        {/* Stat cards row */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            iconBg="bg-[var(--accent-soft)] text-[var(--accent)]"
            label="Health Score"
            value={`${healthScore}%`}
            meta={healthScore >= 95 ? "All systems normal" : `${projectsNeedingAttention.length} need attention`}
            metaTone={healthScore >= 95 ? "operational" : "degraded"}
          />
          <StatCard
            icon={<Server className="h-5 w-5" />}
            iconBg="bg-[color-mix(in_srgb,var(--color-maintenance)_10%,transparent)] text-[var(--color-maintenance)]"
            label="Total Services"
            value={String(data.services.length)}
            meta={`${data.summary.operational} operational`}
            metaTone="operational"
          />
          <StatCard
            icon={<Zap className="h-5 w-5" />}
            iconBg="bg-[color-mix(in_srgb,var(--color-degraded)_10%,transparent)] text-[var(--color-degraded)]"
            label="Active Incidents"
            value={String(data.activeIncidents.length)}
            meta={`${deploymentsLast24h} deploys in 24h`}
            metaTone={data.activeIncidents.length > 0 ? "down" : "foreground"}
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            iconBg="bg-[color-mix(in_srgb,var(--color-operational)_10%,transparent)] text-[var(--color-operational)]"
            label="Fleet Uptime"
            value={`${fleetUptime}%`}
            meta="30-day average"
            metaTone={fleetUptime >= 99.9 ? "operational" : fleetUptime >= 99 ? "degraded" : "down"}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Projects table */}
          <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[var(--card)]">
            <div className="flex items-end justify-between gap-4 px-5 py-4">
              <div>
                <p className={cn("text-xs font-medium", mutedTextClass)}>Portfolio</p>
                <h2 className={cn("mt-1 text-lg font-semibold", foregroundTextClass)}>
                  Project Health
                </h2>
              </div>
              <p className={cn("text-xs", mutedTextClass)}>
                {projectsNeedingAttention.length > 0
                  ? `${projectsNeedingAttention.length} project${projectsNeedingAttention.length === 1 ? "" : "s"} need attention`
                  : "All projects stable"}
              </p>
            </div>

            {/* Desktop table */}
            <div className="hidden xl:block">
              <div className={cn(
                "grid grid-cols-[minmax(0,1.85fr)_110px_100px_120px_100px_110px_28px] gap-4 border-t border-b border-[color:var(--border)] bg-[var(--surface-glass-soft)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider",
                mutedText2Class,
              )}>
                <span>Project</span>
                <span>Status</span>
                <span>Services</span>
                <span>30d Uptime</span>
                <span>Incidents</span>
                <span>Owners</span>
                <span />
              </div>

              {sortedProjects.map((project, index) => (
                <PortfolioRow key={project.group.id} project={project} showBorder={index < sortedProjects.length - 1} />
              ))}
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 p-4 xl:hidden">
              {sortedProjects.map((project) => (
                <Link
                  key={project.group.id}
                  href={`/projects/${project.group.id}`}
                  className="rounded-xl border border-[color:var(--border)] bg-[var(--surface-glass-soft)] p-4 transition-colors hover:bg-[var(--surface-glass-hover)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn("text-xs font-medium", mutedTextClass)}>{project.group.shortName}</p>
                      <h3 className={cn("mt-1 truncate text-sm font-semibold", foregroundTextClass)}>{project.group.name}</h3>
                    </div>
                    <StatusBadge status={project.status} size="sm" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <CompactMetric label="Services" value={`${project.healthy}/${project.services.length}`} tone="operational" />
                    <CompactMetric label="30d uptime" value={`${project.avgUptime}%`} tone={project.avgUptime >= 99.9 ? "operational" : project.avgUptime >= 99 ? "degraded" : "down"} />
                    <CompactMetric label="Incidents" value={String(project.incidents.length)} tone={project.incidents.length > 0 ? "degraded" : "foreground"} />
                    <CompactMetric label="Owners" value={`${project.ownerCoverage}/${project.services.length}`} tone={project.ownerCoverage === project.services.length ? "operational" : "degraded"} />
                  </div>
                  <p className={cn("mt-3 text-[11px]", mutedTextClass)}>
                    {formatDeploymentSummary(project.latestDeployment)}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          {/* Right sidebar panels */}
          <div className="space-y-4">
            {/* System health */}
            <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className={cn("text-sm font-semibold", foregroundTextClass)}>System Health</h3>
                <span className="rounded-lg bg-[var(--accent-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--accent)]">
                  Live
                </span>
              </div>

              <div className="mt-5 flex items-end gap-2">
                <span className={cn("text-4xl font-bold leading-none tracking-tight", foregroundTextClass)}>
                  {healthScore}%
                </span>
                <span className={cn("mb-1 text-xs", mutedTextClass)}>healthy</span>
              </div>

              {/* Progress bar */}
              <div className="mt-4 flex gap-1">
                {Array.from({ length: 20 }, (_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      index < Math.max(1, Math.round(healthScore / 5))
                        ? "bg-[var(--accent)]"
                        : "bg-[var(--surface-glass-soft)]",
                    )}
                  />
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <MiniStat label="Operational" value={String(data.summary.operational)} tone="operational" />
                <MiniStat label="Degraded" value={String(data.summary.degraded)} tone="degraded" />
                <MiniStat label="Down" value={String(data.summary.down)} tone="down" />
                <MiniStat label="Maintenance" value={String(data.summary.maintenance)} tone="maintenance" />
              </div>
            </section>

            {/* Attention queue */}
            <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className={cn("text-sm font-semibold", foregroundTextClass)}>Attention Queue</h3>
                <TriangleAlert className={cn("h-4 w-4", toneTextClasses.degraded)} />
              </div>

              <div className="mt-4 space-y-2">
                {projectsNeedingAttention.length === 0 ? (
                  <EmptyState message="No projects need intervention." />
                ) : (
                  projectsNeedingAttention.slice(0, 4).map((project) => (
                    <Link
                      key={project.group.id}
                      href={`/projects/${project.group.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-3 transition-colors hover:bg-[var(--surface-glass-hover)]"
                    >
                      <div className="min-w-0">
                        <p className={cn("truncate text-sm font-medium", foregroundTextClass)}>{project.group.name}</p>
                        <p className={cn("mt-0.5 text-[11px]", mutedTextClass)}>
                          {project.down > 0 ? `${project.down} down` : `${project.degraded} degraded`} · {project.incidents.length} incident{project.incidents.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <ArrowUpRight className={cn("h-3.5 w-3.5 flex-shrink-0", mutedText2Class)} />
                    </Link>
                  ))
                )}
              </div>
            </section>

            {/* Readiness */}
            <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className={cn("text-sm font-semibold", foregroundTextClass)}>Operational Readiness</h3>
                <ShieldCheck className={cn("h-4 w-4", toneTextClasses.operational)} />
              </div>

              <div className="mt-4 space-y-2">
                <ReadinessRow label="Owner coverage" value={`${ownerCoveragePercent}%`} tone={ownerCoveragePercent >= 90 ? "operational" : ownerCoveragePercent >= 70 ? "degraded" : "down"} />
                <ReadinessRow label="Fleet uptime" value={`${fleetUptime}%`} tone={fleetUptime >= 99.9 ? "operational" : fleetUptime >= 99 ? "degraded" : "down"} />
                <ReadinessRow label="Incidents" value={String(data.activeIncidents.length)} tone={data.activeIncidents.length > 0 ? "degraded" : "foreground"} />
                <ReadinessRow label="Maintenance" value={String(data.activeMaintenanceWindows.length)} tone={data.activeMaintenanceWindows.length > 0 ? "maintenance" : "foreground"} />
              </div>
            </section>

            <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className={cn("text-sm font-semibold", foregroundTextClass)}>Recent Deployments</h3>
                <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold", softSurfaceClass, mutedTextClass)}>
                  {data.recentDeployments.length}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {data.recentDeployments.length === 0 ? (
                  <EmptyState message="No deployments logged yet." />
                ) : (
                  data.recentDeployments.slice(0, 5).map((deployment) => (
                    <div key={deployment.id} className="rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={cn("truncate text-sm font-medium", foregroundTextClass)}>{deployment.serviceName}</p>
                          <p className={cn("mt-0.5 truncate text-[11px]", mutedTextClass)}>
                            {deployment.environment} · {deployment.deployedBy || "Unknown deployer"}
                          </p>
                        </div>
                        <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold", toneChipClasses.operational)}>
                          {deployment.version}
                        </span>
                      </div>
                      <p className={cn("mt-2 text-[11px]", mutedText2Class)}>
                        {formatDistanceToNowStrict(new Date(deployment.deployedAt), { addSuffix: true })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  meta,
  metaTone,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  meta: string;
  metaTone: Tone;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg)}>
          {icon}
        </div>
        <ArrowUpRight className={cn("h-4 w-4", mutedText2Class)} />
      </div>
      <p className={cn("mt-4 text-xs font-medium", mutedTextClass)}>{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight", foregroundTextClass)}>{value}</p>
      <p className={cn("mt-2 text-[11px] font-medium", metaTone === "foreground" ? mutedTextClass : toneTextClasses[metaTone])}>
        {meta}
      </p>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-3">
      <p className={cn("text-[11px] font-medium", mutedText2Class)}>{label}</p>
      <p className={cn("mt-1.5 text-lg font-bold", tone === "foreground" ? foregroundTextClass : toneTextClasses[tone])}>{value}</p>
    </div>
  );
}

function ReadinessRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-2.5">
      <span className={cn("text-xs", mutedTextClass)}>{label}</span>
      <span className={cn("text-xs font-semibold", tone === "foreground" ? foregroundTextClass : toneTextClasses[tone])}>{value}</span>
    </div>
  );
}

function CompactMetric({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-lg bg-[var(--surface-glass-soft)] px-3 py-2">
      <p className={cn("text-[10px] font-medium uppercase tracking-wider", mutedText2Class)}>{label}</p>
      <p className={cn("mt-1 text-sm font-semibold", tone === "foreground" ? foregroundTextClass : toneTextClasses[tone])}>{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className={cn("rounded-xl bg-[var(--surface-glass-soft)] px-4 py-3.5 text-xs", mutedTextClass)}>
      {message}
    </div>
  );
}

function PortfolioRow({
  project,
  showBorder,
}: {
  project: {
    group: typeof serviceGroups[number];
    services: ServiceWithStatus[];
    incidents: Array<{ id?: number }>;
    maintenance: Array<{ id?: number }>;
    healthy: number;
    degraded: number;
    down: number;
    ownerCoverage: number;
    avgUptime: number;
    latestDeployment: ServiceDeployment | null;
    status: ServiceStatus;
  };
  showBorder: boolean;
}) {
  return (
    <Link
      href={`/projects/${project.group.id}`}
      className={cn(
        "grid grid-cols-[minmax(0,1.85fr)_110px_100px_120px_100px_110px_28px] gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--surface-glass-hover)]",
        showBorder && "border-b border-[color:var(--border)]",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn("truncate text-sm font-semibold", foregroundTextClass)}>{project.group.name}</p>
          {project.maintenance.length > 0 && (
            <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium", toneChipClasses.maintenance)}>
              {project.maintenance.length} maint.
            </span>
          )}
        </div>
        <p className={cn("mt-0.5 truncate text-[11px]", mutedTextClass)}>
          {project.group.description} · {formatDeploymentSummary(project.latestDeployment)}
        </p>
      </div>

      <div className="flex items-center">
        <StatusBadge status={project.status} size="sm" />
      </div>

      <div className="flex items-center">
        <span className={cn("text-sm font-semibold", foregroundTextClass)}>
          {project.healthy}/{project.services.length}
        </span>
      </div>

      <div className="flex items-center">
        <span className={cn(
          "text-sm font-semibold",
          project.avgUptime >= 99.9 ? toneTextClasses.operational : project.avgUptime >= 99 ? toneTextClasses.degraded : toneTextClasses.down,
        )}>
          {project.avgUptime}%
        </span>
      </div>

      <div className="flex items-center">
        <span className={cn("text-sm font-semibold", project.incidents.length > 0 ? toneTextClasses.degraded : foregroundTextClass)}>
          {project.incidents.length}
        </span>
      </div>

      <div className="flex items-center">
        <span className={cn("text-sm font-semibold", project.ownerCoverage === project.services.length ? toneTextClasses.operational : toneTextClasses.degraded)}>
          {project.ownerCoverage}/{project.services.length}
        </span>
      </div>

      <div className="flex items-center justify-end">
        <ChevronRight className={cn("h-3.5 w-3.5", mutedText2Class)} />
      </div>
    </Link>
  );
}

function ConnectionBadge({ mode }: { mode: "connecting" | "live" | "polling" }) {
  if (mode === "live") {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--color-operational)_8%,transparent)] px-3.5 py-2 text-xs font-medium text-[var(--color-operational)]">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-operational)] opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-operational)]" />
        </span>
        Live
      </span>
    );
  }

  if (mode === "connecting") {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--color-degraded)_8%,transparent)] px-3.5 py-2 text-xs font-medium text-[var(--color-degraded)]">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Syncing
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2 rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-2 text-xs font-medium", mutedTextClass)}>
      <WifiOff className="h-3.5 w-3.5" />
      Polling
    </span>
  );
}

function getProjectStatus(services: ServiceWithStatus[]): ServiceStatus {
  if (services.some((service) => service.currentStatus === "down")) return "down";
  if (services.some((service) => service.currentStatus === "degraded")) return "degraded";
  if (services.some((service) => service.currentStatus === "maintenance")) return "maintenance";
  if (services.some((service) => service.currentStatus === "unknown")) return "unknown";
  return "operational";
}

function getProjectPriorityScore(status: ServiceStatus, incidents: number, down: number, degraded: number) {
  const statusWeight = {
    down: 400,
    degraded: 300,
    maintenance: 200,
    unknown: 100,
    operational: 0,
  }[status];

  return statusWeight + incidents * 10 + down * 5 + degraded * 3;
}

function formatDeploymentSummary(deployment: ServiceDeployment | null) {
  if (!deployment) return "No deployment recorded";
  return `${deployment.version} deployed ${formatDistanceToNowStrict(new Date(deployment.deployedAt), { addSuffix: true })}`;
}
