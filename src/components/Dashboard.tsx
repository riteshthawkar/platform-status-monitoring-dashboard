"use client";

import { useEffect, useMemo, useState, type ElementType, type ReactNode } from "react";
import { ServiceWithStatus, DashboardSummary } from "@/types";
import OverallStatus from "./OverallStatus";
import ServiceCard from "./ServiceCard";
import IncidentsList from "./IncidentsList";
import ProductTabs from "./ProductTabs";
import ProductHeader from "./ProductHeader";
import MaintenanceList from "./MaintenanceList";
import { useDashboardData } from "./useDashboardData";
import {
  RefreshCw,
  Activity,
  Search,
  Radio,
  WifiOff,
  Users,
  AlertTriangle,
  CheckCircle2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { categoryLabels, categoryOrder, getGroupById, serviceGroups } from "@/lib/services-config";

interface DashboardProps {
  forcedGroupId?: string;
}

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
    if (forcedGroupId) {
      setActiveTab(forcedGroupId);
    }
  }, [forcedGroupId]);

  // Compute group counts for tab badges
  const groupCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, { total: number; operational: number; down: number; degraded: number }> = {};

    counts["all"] = {
      total: data.services.length,
      operational: data.services.filter((s) => s.currentStatus === "operational").length,
      down: data.services.filter((s) => s.currentStatus === "down").length,
      degraded: data.services.filter((s) => s.currentStatus === "degraded").length,
    };

    for (const group of serviceGroups) {
      const groupServices = data.services.filter((s) => s.group === group.id);
      counts[group.id] = {
        total: groupServices.length,
        operational: groupServices.filter((s) => s.currentStatus === "operational").length,
        down: groupServices.filter((s) => s.currentStatus === "down").length,
        degraded: groupServices.filter((s) => s.currentStatus === "degraded").length,
      };
    }

    return counts;
  }, [data]);

  const scopedServices = useMemo(() => {
    if (!data) return [];
    if (activeTab === "all") return data.services;
    return data.services.filter((service) => service.group === activeTab);
  }, [data, activeTab]);

  const filteredServices = useMemo(() => {
    if (!scopedServices.length) return [];

    return scopedServices.filter((s) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !s.name.toLowerCase().includes(q) &&
          !s.description.toLowerCase().includes(q) &&
          !s.id.toLowerCase().includes(q)
        )
          return false;
      }

      return true;
    });
  }, [scopedServices, searchQuery]);

  const groupedServices = useMemo(() => {
    return categoryOrder
      .map((cat) => ({
        category: cat,
        label: categoryLabels[cat],
        services: filteredServices.filter((s) => s.category === cat),
      }))
      .filter((group) => group.services.length > 0);
  }, [filteredServices]);

  const scopedIncidents = useMemo(() => {
    if (!data) return [];
    if (activeTab === "all") return data.activeIncidents;
    const groupServiceIds = data.services.filter((s) => s.group === activeTab).map((s) => s.id);
    return data.activeIncidents.filter((i) => groupServiceIds.includes(i.serviceId));
  }, [data, activeTab]);

  const scopedMaintenance = useMemo(() => {
    if (!data) return [];
    if (activeTab === "all") return data.activeMaintenanceWindows;
    return data.activeMaintenanceWindows.filter((window) => window.serviceGroup === activeTab);
  }, [data, activeTab]);

  const scopedSummary = useMemo((): DashboardSummary | null => {
    if (!data) return null;

    if (activeTab === "all") return data.summary;

    const services = data.services.filter((s) => s.group === activeTab);
    const statusCounts = services.reduce(
      (acc, s) => {
        acc[s.currentStatus] = (acc[s.currentStatus] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    let overallStatus: DashboardSummary["overallStatus"] = "operational";
    if (statusCounts["down"] > 0) overallStatus = "down";
    else if (statusCounts["degraded"] > 0) overallStatus = "degraded";
    else if (statusCounts["maintenance"] > 0) overallStatus = "maintenance";

    return {
      totalServices: services.length,
      operational: statusCounts["operational"] || 0,
      degraded: statusCounts["degraded"] || 0,
      down: statusCounts["down"] || 0,
      maintenance: statusCounts["maintenance"] || 0,
      overallStatus,
      lastUpdated: data.summary.lastUpdated,
    };
  }, [data, activeTab]);

  const activeGroup = activeTab !== "all" ? getGroupById(activeTab) || null : null;
  const activeGroupServices = activeGroup ? scopedServices : [];
  const attentionServices = useMemo(
    () => scopedServices.filter((service) => service.currentStatus === "down" || service.currentStatus === "degraded"),
    [scopedServices]
  );
  const ownerCoverageCount = useMemo(
    () => scopedServices.filter((service) => service.owner?.memberId).length,
    [scopedServices]
  );
  const ownerCoveragePercent = scopedServices.length > 0
    ? Math.round((ownerCoverageCount / scopedServices.length) * 100)
    : 0;
  const avgLatency = useMemo(() => {
    const responseTimes = scopedServices
      .map((service) => service.lastResponseTime)
      .filter((time): time is number => time !== null);

    if (responseTimes.length === 0) return null;
    return Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length);
  }, [scopedServices]);
  const avgUptime30d = useMemo(() => {
    if (scopedServices.length === 0) return 0;
    return Math.round((scopedServices.reduce((sum, service) => sum + service.uptimePercent30d, 0) / scopedServices.length) * 100) / 100;
  }, [scopedServices]);
  const watchlist = useMemo(() => {
    return [...scopedServices]
      .sort((a, b) => getWatchScore(b) - getWatchScore(a))
      .filter((service) => getWatchScore(service) > 0)
      .slice(0, 5);
  }, [scopedServices]);
  const productPulse = useMemo(() => {
    if (!data) return [];

    const groupsInScope = activeTab === "all"
      ? serviceGroups
      : serviceGroups.filter((group) => group.id === activeTab);

    return groupsInScope
      .map((group) => {
        const services = data.services.filter((service) => service.group === group.id);
        if (services.length === 0) return null;

        const down = services.filter((service) => service.currentStatus === "down").length;
        const degraded = services.filter((service) => service.currentStatus === "degraded").length;
        const maintenance = services.filter((service) => service.currentStatus === "maintenance").length;
        const healthy = services.filter((service) => service.currentStatus === "operational").length;

        return {
          id: group.id,
          name: group.shortName,
          total: services.length,
          down,
          degraded,
          maintenance,
          healthy,
        };
      })
      .filter((group): group is {
        id: string;
        name: string;
        total: number;
        down: number;
        degraded: number;
        maintenance: number;
        healthy: number;
      } => group !== null);
  }, [data, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="flex items-center gap-3" style={{ color: "var(--muted)" }}>
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading status...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="text-center">
          <p className="text-sm mb-2" style={{ color: "var(--color-down)" }}>Failed to load dashboard</p>
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

  if (!data || !scopedSummary) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Header */}
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
                Operations dashboard for startup projects and services
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Team link */}
                <Link
                  href="/"
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
                  style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--card-hover)";
                    e.currentTarget.style.borderColor = "var(--border-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "var(--border)";
                  }}
                >
                  Projects
                </Link>

                <Link
                  href="/team"
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
                  style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--card-hover)";
                e.currentTarget.style.borderColor = "var(--border-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <Users className="w-3.5 h-3.5" />
              Team
            </Link>

            {/* Connection indicator */}
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

            {/* Auto-refresh toggle */}
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

            {/* Check All */}
            <button
              onClick={triggerCheck}
              disabled={isChecking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#fff" }}
              onMouseEnter={(e) => { if (!isChecking) e.currentTarget.style.background = "var(--accent-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
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
                  <Radio className="w-3 h-3" style={{ color: connectionMode === "live" ? "var(--color-operational)" : "var(--color-degraded)" }} />
                  {activeGroup ? `${activeGroup.shortName} Project Dashboard` : "Cross-Platform Operations Desk"}
                </div>
                <h2 className="text-[26px] leading-tight sm:text-[34px] font-semibold mt-4" style={{ color: "var(--foreground)" }}>
                  {activeGroup ? `${activeGroup.name} Service Dashboard` : "Startup Platform Command Center"}
                </h2>
                <p className="text-sm sm:text-[15px] leading-7 mt-3 max-w-2xl" style={{ color: "var(--muted)" }}>
                  {activeGroup
                    ? "Inspect the live status of every monitored service, dependency, and maintenance window under this project."
                    : "Monitor live health, active incidents, planned maintenance, and service ownership in a single operational view built for rapid response."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:min-w-[340px]">
                <SignalCard
                  label="Connection"
                  value={connectionMode === "live" ? "Live" : connectionMode === "connecting" ? "Syncing" : "Polling"}
                  tone={connectionMode === "live" ? "var(--color-operational)" : "var(--color-degraded)"}
                  hint={connectionMode === "live" ? "SSE stream active" : connectionMode === "connecting" ? "Reconnecting to stream" : "30s fallback polling"}
                />
                <SignalCard
                  label="Coverage"
                  value={`${ownerCoveragePercent}%`}
                  tone={ownerCoveragePercent >= 90 ? "var(--color-operational)" : ownerCoveragePercent >= 70 ? "var(--color-degraded)" : "var(--color-down)"}
                  hint={`${ownerCoverageCount}/${scopedServices.length} services owned`}
                />
                <SignalCard
                  label="Updated"
                  value={new Date(scopedSummary.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  tone="var(--foreground)"
                  hint={new Date(scopedSummary.lastUpdated).toLocaleDateString([], { month: "short", day: "numeric" })}
                />
                <SignalCard
                  label="Scope"
                  value={`${scopedServices.length}`}
                  tone="var(--foreground)"
                  hint={activeGroup ? activeGroup.name : `${serviceGroups.length} product groups`}
                />
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Needs Attention"
                value={String(attentionServices.length)}
                description={attentionServices.length > 0 ? "Down or degraded services in scope" : "No degraded or down services"}
                icon={AlertTriangle}
                tone={attentionServices.length > 0 ? "var(--color-down)" : "var(--color-operational)"}
              />
              <MetricCard
                label="Active Incidents"
                value={String(scopedIncidents.length)}
                description={scopedIncidents.length > 0 ? "Open investigation and monitoring items" : "No unresolved incidents"}
                icon={Activity}
                tone={scopedIncidents.length > 0 ? "var(--color-degraded)" : "var(--foreground)"}
              />
              <MetricCard
                label="Avg Latency"
                value={avgLatency !== null ? `${avgLatency}ms` : "--"}
                description="Across services with a recent response"
                icon={Zap}
                tone={avgLatency !== null && avgLatency <= 500 ? "var(--color-operational)" : avgLatency !== null && avgLatency <= 1200 ? "var(--color-degraded)" : "var(--foreground)"}
              />
              <MetricCard
                label="30d Fleet Uptime"
                value={`${avgUptime30d}%`}
                description="Average across the current scope"
                icon={CheckCircle2}
                tone={avgUptime30d >= 99.9 ? "var(--color-operational)" : avgUptime30d >= 99 ? "var(--color-degraded)" : "var(--color-down)"}
              />
            </div>

            <div className="mt-6">
              {activeGroup ? (
                <ProductHeader group={activeGroup} services={activeGroupServices} />
              ) : (
                <OverallStatus summary={scopedSummary} />
              )}
            </div>
          </div>
        </section>

        {/* Product Tabs */}
        {!forcedGroupId && (
          <ProductTabs
            groups={serviceGroups}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            groupCounts={groupCounts}
          />
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_360px]">
          <section className="space-y-6 min-w-0">
            {/* Search */}
            <div
              className="rounded-[22px] p-4 sm:p-5"
              style={{
                background: "color-mix(in srgb, var(--panel) 92%, transparent)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-soft)",
              }}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted-2)" }}>
                    Service Grid
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--foreground)" }}>
                    {filteredServices.length} visible services
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    Search endpoints, drill into categories, and trigger checks without leaving the operational view.
                  </p>
                </div>

                <div className="relative w-full lg:max-w-[360px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--muted-2)" }} />
                  <input
                    type="text"
                    placeholder={
                      activeGroup
                        ? `Search ${activeGroup.shortName} endpoints...`
                        : "Search services..."
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm placeholder:text-[var(--muted-2)] focus:outline-none"
                    style={{
                      background: "var(--background-secondary)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Service Groups */}
            <div className="space-y-6">
              {groupedServices.map((group) => {
                const down = group.services.filter((service) => service.currentStatus === "down").length;
                const degraded = group.services.filter((service) => service.currentStatus === "degraded").length;

                return (
                  <div
                    key={group.category}
                    className="rounded-[22px] overflow-hidden"
                    style={{
                      border: "1px solid var(--border)",
                      background: "color-mix(in srgb, var(--panel) 90%, transparent)",
                      boxShadow: "var(--shadow-soft)",
                    }}
                  >
                    <div
                      className="flex items-center justify-between gap-4 px-4 py-3.5"
                      style={{
                        background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <div>
                        <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--foreground)" }}>
                          {group.label}
                        </h3>
                        <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                          {group.services.length} services
                          {down > 0 && ` · ${down} down`}
                          {degraded > 0 && ` · ${degraded} degraded`}
                        </p>
                      </div>
                      <span
                        className="text-[11px] px-2 py-1 rounded-full"
                        style={{
                          color: down > 0 ? "var(--color-down)" : degraded > 0 ? "var(--color-degraded)" : "var(--color-operational)",
                          background: down > 0
                            ? "color-mix(in srgb, var(--color-down) 10%, transparent)"
                            : degraded > 0
                              ? "color-mix(in srgb, var(--color-degraded) 10%, transparent)"
                              : "color-mix(in srgb, var(--color-operational) 10%, transparent)",
                        }}
                      >
                        {down > 0 ? "Action Needed" : degraded > 0 ? "Watch Closely" : "Stable"}
                      </span>
                    </div>
                    <div>
                      {group.services.map((service, i) => (
                        <ServiceCard
                          key={service.id}
                          service={service}
                          onRefresh={refreshSingleService}
                          isLast={i === group.services.length - 1}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredServices.length === 0 && (
              <div className="text-center py-16 text-sm rounded-[22px]" style={{ color: "var(--muted)", border: "1px solid var(--border)", background: "var(--panel)" }}>
                No services match your search
              </div>
            )}
          </section>

          <aside className="space-y-6 xl:sticky xl:top-24 self-start">
            <RailPanel
              title="Ops Snapshot"
              eyebrow="Current scope"
              action={
                <Link href="/team" className="text-[11px] hover:underline" style={{ color: "var(--muted)" }}>
                  Open team
                </Link>
              }
            >
              <div className="space-y-3">
                <SnapshotRow label="Services in scope" value={String(scopedServices.length)} />
                <SnapshotRow label="Needs attention" value={String(attentionServices.length)} tone={attentionServices.length > 0 ? "var(--color-down)" : "var(--color-operational)"} />
                <SnapshotRow label="Active incidents" value={String(scopedIncidents.length)} tone={scopedIncidents.length > 0 ? "var(--color-degraded)" : "var(--foreground)"} />
                <SnapshotRow label="Maintenance windows" value={String(scopedMaintenance.length)} tone={scopedMaintenance.length > 0 ? "var(--color-maintenance)" : "var(--foreground)"} />
                <SnapshotRow label="Owner coverage" value={`${ownerCoveragePercent}%`} tone={ownerCoveragePercent >= 90 ? "var(--color-operational)" : ownerCoveragePercent >= 70 ? "var(--color-degraded)" : "var(--color-down)"} />
                <SnapshotRow label="Last updated" value={new Date(scopedSummary.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
              </div>
            </RailPanel>

            <IncidentsList incidents={scopedIncidents} />
            <MaintenanceList windows={scopedMaintenance} />

            <RailPanel title="Watchlist" eyebrow="Priority queue">
              {watchlist.length === 0 ? (
                <p className="text-xs leading-6" style={{ color: "var(--muted)" }}>
                  No services currently require special attention in this scope.
                </p>
              ) : (
                <div className="space-y-2">
                  {watchlist.map((service) => (
                    <div
                      key={service.id}
                      className="rounded-xl px-3 py-2.5"
                      style={{
                        background: "var(--background-secondary)",
                        border: "1px solid color-mix(in srgb, var(--border) 82%, transparent)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                            {service.name}
                          </p>
                          <p className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                            {service.owner?.memberName || "Unassigned owner"}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-medium" style={{ color: service.currentStatus === "down" ? "var(--color-down)" : service.currentStatus === "degraded" ? "var(--color-degraded)" : "var(--color-maintenance)" }}>
                            {service.currentStatus}
                          </p>
                          <p className="text-[11px]" style={{ color: "var(--muted-2)" }}>
                            {service.lastResponseTime !== null ? `${Math.round(service.lastResponseTime)}ms` : "--"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </RailPanel>

            {!forcedGroupId && productPulse.length > 0 && (
              <RailPanel title="Product Pulse" eyebrow="Group health">
                <div className="space-y-2">
                  {productPulse.map((group) => (
                    <div
                      key={group.id}
                      className="rounded-xl px-3 py-2.5"
                      style={{
                        background: "var(--background-secondary)",
                        border: "1px solid color-mix(in srgb, var(--border) 82%, transparent)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{group.name}</p>
                          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                            {group.healthy}/{group.total} healthy
                          </p>
                        </div>
                        <div className="text-right text-[11px]" style={{ color: "var(--muted-2)" }}>
                          {group.down > 0 && <div style={{ color: "var(--color-down)" }}>{group.down} down</div>}
                          {group.degraded > 0 && <div style={{ color: "var(--color-degraded)" }}>{group.degraded} degraded</div>}
                          {group.maintenance > 0 && <div style={{ color: "var(--color-maintenance)" }}>{group.maintenance} maint.</div>}
                          {group.down === 0 && group.degraded === 0 && group.maintenance === 0 && (
                            <div style={{ color: "var(--color-operational)" }}>stable</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </RailPanel>
            )}
          </aside>
        </div>

        {/* Footer */}
        <footer className="mt-14 pt-6 text-center" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-[11px]" style={{ color: "var(--muted-2)" }}>
            Platform Status Dashboard |{" "}
            {connectionMode === "live" ? "Real-time via SSE" : "Auto-refreshes every 30s"}{" "}
            | {data.summary.totalServices} services across {serviceGroups.length} products
          </p>
        </footer>
      </main>
    </div>
  );
}

function getWatchScore(service: ServiceWithStatus): number {
  if (service.currentStatus === "down") return 4000 + (service.lastResponseTime || 0);
  if (service.currentStatus === "degraded") return 3000 + (service.lastResponseTime || 0);
  if (service.currentStatus === "maintenance") return 2000;
  if (!service.owner?.memberId && service.tags?.includes("critical")) return 1500;
  return service.lastResponseTime || 0;
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  icon: ElementType;
  tone: string;
}) {
  return (
    <div
      className="rounded-[20px] p-4"
      style={{
        background: "rgba(11, 16, 24, 0.42)",
        border: "1px solid rgba(255, 255, 255, 0.07)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--muted-2)" }}>{label}</p>
          <p className="text-[26px] font-semibold mt-2" style={{ color: tone }}>{value}</p>
        </div>
        <div
          className="rounded-xl p-2.5"
          style={{ background: `color-mix(in srgb, ${tone} 14%, rgba(255, 255, 255, 0.02))` }}
        >
          <Icon className="w-4 h-4" style={{ color: tone }} />
        </div>
      </div>
      <p className="text-xs leading-5 mt-3" style={{ color: "var(--muted)" }}>{description}</p>
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

function RailPanel({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-[22px] p-4 sm:p-5"
      style={{
        background: "color-mix(in srgb, var(--panel) 92%, transparent)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          {eyebrow && (
            <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--muted-2)" }}>
              {eyebrow}
            </p>
          )}
          <h3 className="text-sm font-semibold mt-1" style={{ color: "var(--foreground)" }}>{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span className="font-medium" style={{ color: tone || "var(--foreground)" }}>{value}</span>
    </div>
  );
}
