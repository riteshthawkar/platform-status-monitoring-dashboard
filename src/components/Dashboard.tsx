"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  ExternalLink,
  GitBranch,
  RefreshCw,
  Search,
  Server,
  TrendingUp,
  TriangleAlert,
  UserRound,
  WifiOff,
  Zap,
} from "lucide-react";
import { DashboardSummary, ServiceDeployment, ServiceWithStatus } from "@/types";
import AppHeader from "./AppHeader";
import IncidentsList from "./IncidentsList";
import MaintenanceList from "./MaintenanceList";
import ProductTabs from "./ProductTabs";
import ServiceCard from "./ServiceCard";
import StatusBadge from "./StatusBadge";
import { useDashboardData } from "./useDashboardData";
import { categoryLabels, categoryOrder, getGroupById, serviceGroups } from "@/lib/services-config";
import { getGroupNavIcon } from "@/lib/navigation-icons";
import {
  accentButtonClass,
  cn,
  foregroundTextClass,
  mutedText2Class,
  mutedTextClass,
  pageClass,
  toneChipClasses,
  toneTextClasses,
} from "@/lib/ui";

interface DashboardProps {
  forcedGroupId?: string;
}

type Tone = "foreground" | "operational" | "degraded" | "down" | "maintenance";

export default function Dashboard({ forcedGroupId }: DashboardProps) {
  const {
    data,
    loading,
    error,
    isChecking,
    autoRefresh,
    connectionMode,
    fetchStatus,
    triggerCheck,
    refreshSingleService,
    setAutoRefresh,
  } = useDashboardData();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState(forcedGroupId || "all");

  useEffect(() => {
    if (forcedGroupId) setActiveTab(forcedGroupId);
  }, [forcedGroupId]);

  const groupCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, { total: number; operational: number; down: number; degraded: number }> = {
      all: {
        total: data.services.length,
        operational: data.services.filter((s) => s.currentStatus === "operational").length,
        down: data.services.filter((s) => s.currentStatus === "down").length,
        degraded: data.services.filter((s) => s.currentStatus === "degraded").length,
      },
    };
    for (const group of serviceGroups) {
      const services = data.services.filter((s) => s.group === group.id);
      counts[group.id] = {
        total: services.length,
        operational: services.filter((s) => s.currentStatus === "operational").length,
        down: services.filter((s) => s.currentStatus === "down").length,
        degraded: services.filter((s) => s.currentStatus === "degraded").length,
      };
    }
    return counts;
  }, [data]);

  const scopedServices = useMemo(() => {
    if (!data) return [];
    return activeTab === "all" ? data.services : data.services.filter((s) => s.group === activeTab);
  }, [data, activeTab]);

  const filteredServices = useMemo(() => {
    if (!searchQuery) return scopedServices;
    const q = searchQuery.toLowerCase();
    return scopedServices.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
  }, [scopedServices, searchQuery]);

  const groupedServices = useMemo(() => {
    return categoryOrder
      .map((cat) => ({ category: cat, label: categoryLabels[cat], services: filteredServices.filter((s) => s.category === cat) }))
      .filter((g) => g.services.length > 0);
  }, [filteredServices]);

  const scopedIncidents = useMemo(() => {
    if (!data) return [];
    if (activeTab === "all") return data.activeIncidents;
    const ids = new Set(data.services.filter((s) => s.group === activeTab).map((s) => s.id));
    return data.activeIncidents.filter((i) => ids.has(i.serviceId));
  }, [data, activeTab]);

  const scopedMaintenance = useMemo(() => {
    if (!data) return [];
    if (activeTab === "all") return data.activeMaintenanceWindows;
    return data.activeMaintenanceWindows.filter((w) => w.serviceGroup === activeTab);
  }, [data, activeTab]);

  const scopedSummary = useMemo((): DashboardSummary | null => {
    if (!data) return null;
    if (activeTab === "all") return data.summary;
    const counts = scopedServices.reduce((acc, s) => { acc[s.currentStatus] = (acc[s.currentStatus] || 0) + 1; return acc; }, {} as Record<string, number>);
    let overallStatus: DashboardSummary["overallStatus"] = "operational";
    if (counts.down > 0) overallStatus = "down";
    else if (counts.degraded > 0) overallStatus = "degraded";
    else if (counts.maintenance > 0) overallStatus = "maintenance";
    else if (counts.unknown > 0) overallStatus = "unknown";
    return {
      totalServices: scopedServices.length,
      operational: counts.operational || 0,
      degraded: counts.degraded || 0,
      down: counts.down || 0,
      maintenance: counts.maintenance || 0,
      overallStatus,
      lastUpdated: data.summary.lastUpdated,
    };
  }, [data, activeTab, scopedServices]);

  const activeGroup = activeTab !== "all" ? getGroupById(activeTab) || null : null;
  const attentionServices = scopedServices.filter((s) => s.currentStatus === "down" || s.currentStatus === "degraded");
  const ownerCoverageCount = scopedServices.filter((s) => s.owner?.memberId).length;
  const ownerCoveragePercent = scopedServices.length > 0 ? Math.round((ownerCoverageCount / scopedServices.length) * 100) : 0;
  const avgLatency = (() => {
    const rts = scopedServices.map((s) => s.lastResponseTime).filter((t): t is number => t !== null);
    return rts.length === 0 ? null : Math.round(rts.reduce((sum, t) => sum + t, 0) / rts.length);
  })();
  const avgUptime30d = scopedServices.length > 0
    ? Math.round((scopedServices.reduce((sum, s) => sum + s.uptimePercent30d, 0) / scopedServices.length) * 100) / 100
    : 100;
  const watchlist = [...scopedServices]
    .sort((a, b) => getWatchScore(b) - getWatchScore(a))
    .filter((s) => getWatchScore(s) > 0)
    .slice(0, 5);
  const latestDeployment = scopedServices
    .map((service) => service.latestDeployment)
    .filter((deployment): deployment is ServiceDeployment => !!deployment)
    .sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime())[0] ?? null;

  if (loading) {
    return (
      <div className={cn(pageClass, "flex items-center justify-center py-20")}>
        <div className={cn("flex items-center gap-3 text-sm", mutedTextClass)}>
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={cn(pageClass, "flex items-center justify-center py-20")}>
        <div className="w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 text-center">
          <p className={cn("text-sm font-medium", toneTextClasses.down)}>Failed to load dashboard</p>
          <p className={cn("mt-2 text-xs leading-6", mutedTextClass)}>{error}</p>
          <button onClick={fetchStatus} className={cn("mt-5 px-4 py-2 text-xs font-medium", accentButtonClass)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || !scopedSummary) return null;

  const ScopeIcon = activeGroup ? getGroupNavIcon(activeGroup.id) : Activity;
  const owners = [...new Set(scopedServices.map((s) => s.owner?.memberName).filter(Boolean))];

  return (
    <div className={pageClass}>
      <AppHeader />

      <main className="space-y-5">
        {/* Controls bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {activeGroup && (
              <Link href="/" className="rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">
                Portfolio
              </Link>
            )}
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

        {/* Scope tabs */}
        {!forcedGroupId && (
          <ProductTabs groups={serviceGroups} activeTab={activeTab} onTabChange={setActiveTab} groupCounts={groupCounts} />
        )}

        {/* Scope header card */}
        <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white accent-glow">
                <ScopeIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("text-xs font-medium", mutedTextClass)}>
                    {activeGroup ? "Project status" : "Platform status"}
                  </p>
                  <StatusBadge status={scopedSummary.overallStatus} size="sm" />
                </div>
                <h2 className={cn("mt-2 text-xl font-bold tracking-tight sm:text-2xl", foregroundTextClass)}>
                  {activeGroup ? activeGroup.name : "Platform Overview"}
                </h2>
                <p className={cn("mt-1 max-w-2xl text-sm", mutedTextClass)}>
                  {activeGroup ? activeGroup.description : "Monitor service health, incidents, and ownership across the full platform."}
                </p>
                <div className={cn("mt-3 flex flex-wrap items-center gap-4 text-[11px]", mutedTextClass)}>
                  {activeGroup?.baseUrl && (
                    <a href={activeGroup.baseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                      <ExternalLink className="h-3 w-3" />
                      {activeGroup.baseUrl.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  {activeGroup?.repo && (
                    <a href={`https://${activeGroup.repo}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                      <GitBranch className="h-3 w-3" />
                      {activeGroup.repo.replace("github.com/", "")}
                    </a>
                  )}
                  {owners.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="h-3 w-3" />
                      {owners.join(", ")}
                    </span>
                  )}
                  {latestDeployment && (
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {latestDeployment.version} · {formatDistanceToNowStrict(new Date(latestDeployment.deployedAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            iconBg="bg-[var(--accent-soft)] text-[var(--accent)]"
            label="Healthy Services"
            value={`${scopedSummary.operational}/${scopedSummary.totalServices}`}
            tone="operational"
          />
          <StatCard
            icon={<TriangleAlert className="h-5 w-5" />}
            iconBg="bg-[color-mix(in_srgb,var(--color-down)_10%,transparent)] text-[var(--color-down)]"
            label="Attention"
            value={String(attentionServices.length)}
            tone={attentionServices.length > 0 ? "down" : "operational"}
          />
          <StatCard
            icon={<Zap className="h-5 w-5" />}
            iconBg="bg-[color-mix(in_srgb,var(--color-degraded)_10%,transparent)] text-[var(--color-degraded)]"
            label="Avg Latency"
            value={avgLatency !== null ? `${avgLatency}ms` : "--"}
            tone={avgLatency !== null && avgLatency <= 500 ? "operational" : avgLatency !== null && avgLatency <= 1200 ? "degraded" : "foreground"}
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            iconBg="bg-[color-mix(in_srgb,var(--color-operational)_10%,transparent)] text-[var(--color-operational)]"
            label="30d Uptime"
            value={`${avgUptime30d}%`}
            tone={avgUptime30d >= 99.9 ? "operational" : avgUptime30d >= 99 ? "degraded" : "down"}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Services table */}
          <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[var(--card)]">
            <div className="flex flex-col gap-3 border-b border-[color:var(--border)] px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className={cn("text-xs font-medium", mutedTextClass)}>Services</p>
                <h2 className={cn("mt-1 text-lg font-semibold", foregroundTextClass)}>
                  {activeGroup ? `${activeGroup.shortName} service health` : "All monitored services"}
                </h2>
              </div>
              <div className="relative w-full lg:max-w-[320px]">
                <Search className={cn("absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2", mutedText2Class)} />
                <input
                  type="text"
                  placeholder={activeGroup ? `Search ${activeGroup.shortName} services...` : "Search services..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn("w-full rounded-xl bg-[var(--surface-glass-soft)] py-2 pl-9 pr-3 text-sm outline-none placeholder:text-[var(--muted-2)]", foregroundTextClass)}
                />
              </div>
            </div>

            {groupedServices.map((group) => {
              const down = group.services.filter((s) => s.currentStatus === "down").length;
              const degraded = group.services.filter((s) => s.currentStatus === "degraded").length;
              const tone: Tone = down > 0 ? "down" : degraded > 0 ? "degraded" : "operational";

              return (
                <section key={group.category}>
                  <div className="flex items-end justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3">
                    <div>
                      <p className={cn("text-[10px] font-medium uppercase tracking-wider", mutedText2Class)}>Category</p>
                      <h3 className={cn("mt-1 text-sm font-semibold", foregroundTextClass)}>{group.label}</h3>
                    </div>
                    <span className={cn("rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", toneChipClasses[tone])}>
                      {down > 0 ? `${down} down` : degraded > 0 ? `${degraded} degraded` : "Stable"}
                    </span>
                  </div>

                  <div className={cn("hidden border-b border-[color:var(--border)] bg-[var(--surface-glass-soft)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider xl:grid xl:grid-cols-[minmax(0,1.8fr)_110px_120px_110px_120px_48px] xl:gap-4", mutedText2Class)}>
                    <span>Service</span>
                    <span>Status</span>
                    <span>Latency</span>
                    <span>30d uptime</span>
                    <span>Last check</span>
                    <span />
                  </div>

                  <div>
                    {group.services.map((service, i) => (
                      <ServiceCard key={service.id} service={service} onRefresh={refreshSingleService} isLast={i === group.services.length - 1} />
                    ))}
                  </div>
                </section>
              );
            })}

            {filteredServices.length === 0 && (
              <div className={cn("px-6 py-16 text-center text-sm", mutedTextClass)}>
                No services match the current search.
              </div>
            )}
          </section>

          {/* Right aside */}
          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            {/* Scope summary */}
            <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className={cn("text-sm font-semibold", foregroundTextClass)}>Scope Summary</h3>
                <Activity className={cn("h-4 w-4", toneTextClasses.maintenance)} />
              </div>
              <div className="mt-4 space-y-2">
                <SummaryRow label="Services in scope" value={String(scopedSummary.totalServices)} tone="foreground" />
                <SummaryRow label="Operational" value={String(scopedSummary.operational)} tone="operational" />
                <SummaryRow label="Active incidents" value={String(scopedIncidents.length)} tone={scopedIncidents.length > 0 ? "degraded" : "foreground"} />
                <SummaryRow label="Maintenance" value={String(scopedMaintenance.length)} tone={scopedMaintenance.length > 0 ? "maintenance" : "foreground"} />
                <SummaryRow label="Owner coverage" value={`${ownerCoveragePercent}%`} tone={ownerCoveragePercent >= 90 ? "operational" : ownerCoveragePercent >= 70 ? "degraded" : "down"} />
                <SummaryRow label="Latest release" value={latestDeployment ? latestDeployment.version : "Not logged"} tone={latestDeployment ? "operational" : "foreground"} />
              </div>
            </section>

            <IncidentsList incidents={scopedIncidents} />
            <MaintenanceList windows={scopedMaintenance} />

            {/* Watchlist */}
            <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className={cn("text-sm font-semibold", foregroundTextClass)}>Watchlist</h3>
                <TriangleAlert className={cn("h-4 w-4", toneTextClasses.degraded)} />
              </div>
              <div className="mt-4 space-y-2">
                {watchlist.length === 0 ? (
                  <div className={cn("rounded-xl bg-[var(--surface-glass-soft)] px-4 py-3.5 text-xs", mutedTextClass)}>
                    Nothing needs escalation in this scope.
                  </div>
                ) : (
                  watchlist.map((service) => (
                    <div key={service.id} className="rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={cn("truncate text-sm font-medium", foregroundTextClass)}>{service.name}</p>
                          <p className={cn("mt-0.5 truncate text-[11px]", mutedTextClass)}>
                            {service.owner?.memberName || "Owner unassigned"}
                          </p>
                        </div>
                        <span className={cn(
                          "text-[11px] font-semibold capitalize",
                          service.currentStatus === "down" ? toneTextClasses.down : service.currentStatus === "degraded" ? toneTextClasses.degraded : toneTextClasses.maintenance,
                        )}>
                          {service.currentStatus}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, iconBg, label, value, tone }: { icon: React.ReactNode; iconBg: string; label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg)}>{icon}</div>
        <ArrowUpRight className={cn("h-4 w-4", mutedText2Class)} />
      </div>
      <p className={cn("mt-4 text-xs font-medium", mutedTextClass)}>{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight", tone === "foreground" ? foregroundTextClass : toneTextClasses[tone])}>{value}</p>
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-2.5">
      <span className={cn("text-xs", mutedTextClass)}>{label}</span>
      <span className={cn("text-xs font-semibold", tone === "foreground" ? foregroundTextClass : toneTextClasses[tone])}>{value}</span>
    </div>
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

function getWatchScore(service: ServiceWithStatus): number {
  if (service.currentStatus === "down") return 4000 + (service.lastResponseTime || 0);
  if (service.currentStatus === "degraded") return 3000 + (service.lastResponseTime || 0);
  if (service.currentStatus === "maintenance") return 2000;
  if (!service.owner?.memberId && service.tags?.includes("critical")) return 1500;
  return service.lastResponseTime || 0;
}
