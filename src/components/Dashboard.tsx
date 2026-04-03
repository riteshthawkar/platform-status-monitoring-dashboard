"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ServiceWithStatus, DashboardSummary, Incident, HealthCheckResult } from "@/types";
import OverallStatus from "./OverallStatus";
import ServiceCard from "./ServiceCard";
import IncidentsList from "./IncidentsList";
import ProductTabs from "./ProductTabs";
import ProductHeader from "./ProductHeader";
import {
  RefreshCw,
  Activity,
  Search,
  Radio,
  WifiOff,
  Users,
} from "lucide-react";
import Link from "next/link";
import { categoryLabels, categoryOrder, serviceGroups } from "@/lib/services-config";

type ConnectionMode = "connecting" | "live" | "polling";

interface DashboardData {
  summary: DashboardSummary;
  services: ServiceWithStatus[];
  activeIncidents: Incident[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("connecting");

  // Refs for SSE reconnection
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxReconnectAttempts = 10;

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/health-check", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerCheck = async () => {
    setIsChecking(true);
    try {
      await fetch("/api/health-check", { method: "POST" });
      // If not on SSE, fetch manually; SSE will push the update automatically
      if (connectionMode !== "live") {
        await fetchStatus();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsChecking(false);
    }
  };

  const refreshSingleService = async (serviceId: string) => {
    try {
      await fetch(`/api/services/${serviceId}`, { method: "POST" });
      // If not on SSE, fetch manually
      if (connectionMode !== "live") {
        await fetchStatus();
      }
    } catch (err) {
      console.error("Failed to refresh service:", err);
    }
  };

  // ─── SSE Connection ──────────────────────────────────────────

  const connectSSE = useCallback(() => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnectionMode("connecting");

    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.addEventListener("status", (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as DashboardData;
        setData(payload);
        setError(null);
        setLoading(false);
        setConnectionMode("live");
        reconnectAttemptRef.current = 0; // Reset backoff on successful message
      } catch (err) {
        console.error("[SSE] Failed to parse status event:", err);
      }
    });

    es.addEventListener("service-update", (event: MessageEvent) => {
      try {
        const { serviceId, result } = JSON.parse(event.data) as {
          serviceId: string;
          result: HealthCheckResult;
        };
        setData((prev) => {
          if (!prev) return prev;
          const updatedServices = prev.services.map((s) => {
            if (s.id !== serviceId) return s;
            return {
              ...s,
              currentStatus: result.status,
              lastChecked: result.timestamp,
              lastResponseTime: result.responseTimeMs,
              recentChecks: [result, ...s.recentChecks.slice(0, 49)],
            };
          });
          return { ...prev, services: updatedServices };
        });
      } catch (err) {
        console.error("[SSE] Failed to parse service-update event:", err);
      }
    });

    es.addEventListener("ping", () => {
      // Keepalive received — connection is healthy
    });

    es.onopen = () => {
      setConnectionMode("live");
      reconnectAttemptRef.current = 0;
      console.log("[SSE] Connected");
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      const attempt = reconnectAttemptRef.current;

      if (attempt >= maxReconnectAttempts) {
        // Give up on SSE — fall back to polling permanently
        console.log("[SSE] Max reconnect attempts reached, falling back to polling");
        setConnectionMode("polling");
        return;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s... capped at 30s
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      reconnectAttemptRef.current = attempt + 1;
      console.log(`[SSE] Disconnected, reconnecting in ${delay}ms (attempt ${attempt + 1}/${maxReconnectAttempts})`);

      setConnectionMode("polling"); // Show polling while reconnecting

      reconnectTimerRef.current = setTimeout(() => {
        connectSSE();
      }, delay);
    };
  }, [maxReconnectAttempts]);

  // ─── Initialize: SSE + initial fetch ─────────────────────────

  useEffect(() => {
    // Always do an initial fetch so we have data immediately
    fetchStatus();

    // Try to establish SSE connection
    connectSSE();

    return () => {
      // Cleanup on unmount
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [fetchStatus, connectSSE]);

  // ─── Polling fallback (only when SSE is not connected) ───────

  useEffect(() => {
    if (!autoRefresh) return;
    if (connectionMode === "live") return; // SSE is handling updates
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus, connectionMode]);

  // Compute group counts for tab badges
  const groupCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, { total: number; operational: number; down: number; degraded: number }> = {};

    // All
    counts["all"] = {
      total: data.services.length,
      operational: data.services.filter((s) => s.currentStatus === "operational").length,
      down: data.services.filter((s) => s.currentStatus === "down").length,
      degraded: data.services.filter((s) => s.currentStatus === "degraded").length,
    };

    // Per group
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

  // Filter services by active tab + search
  const filteredServices = useMemo(() => {
    if (!data) return [];

    return data.services.filter((s) => {
      // Tab filter
      if (activeTab !== "all" && s.group !== activeTab) return false;

      // Search filter
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
  }, [data, activeTab, searchQuery]);

  // Group filtered services by category
  const groupedServices = useMemo(() => {
    return categoryOrder
      .map((cat) => ({
        category: cat,
        label: categoryLabels[cat],
        services: filteredServices.filter((s) => s.category === cat),
      }))
      .filter((group) => group.services.length > 0);
  }, [filteredServices]);

  // Active incidents scoped to current tab
  const scopedIncidents = useMemo(() => {
    if (!data) return [];
    if (activeTab === "all") return data.activeIncidents;
    const groupServiceIds = data.services.filter((s) => s.group === activeTab).map((s) => s.id);
    return data.activeIncidents.filter((i) => groupServiceIds.includes(i.serviceId));
  }, [data, activeTab]);

  // Compute summary for current tab
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

  // Get the active group config
  const activeGroup = activeTab !== "all" ? serviceGroups.find((g) => g.id === activeTab) : null;
  const activeGroupServices = activeGroup ? filteredServices : [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading status...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load dashboard</p>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchStatus}
            className="px-4 py-2 bg-gray-800 rounded-lg text-sm text-gray-300 hover:bg-gray-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || !scopedSummary) return null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-gray-950/80 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-6 h-6 text-indigo-400" />
              <h1 className="text-xl font-bold text-white">Platform Status</h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Team page link */}
              <Link
                href="/team"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
              >
                <Users className="w-3 h-3" />
                Team
              </Link>
              {/* Connection mode indicator */}
              {connectionMode === "live" ? (
                <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Radio className="w-3 h-3" />
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  Live
                </span>
              ) : connectionMode === "connecting" ? (
                <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Connecting...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 border border-gray-700">
                  <WifiOff className="w-3 h-3" />
                  Polling
                </span>
              )}

              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  autoRefresh
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-gray-800 text-gray-400 border border-gray-700"
                }`}
              >
                {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
              </button>

              <button
                onClick={triggerCheck}
                disabled={isChecking}
                className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500
                           rounded-lg text-sm text-white font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin" : ""}`} />
                {isChecking ? "Checking..." : "Check All"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Product Tabs */}
        <ProductTabs
          groups={serviceGroups}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          groupCounts={groupCounts}
        />

        {/* Product Header (when a specific product is selected) */}
        {activeGroup && (
          <ProductHeader group={activeGroup} services={activeGroupServices} />
        )}

        {/* Overall Status Banner (only on All tab) */}
        {activeTab === "all" && <OverallStatus summary={scopedSummary} />}

        {/* Active Incidents (scoped to tab) */}
        <IncidentsList incidents={scopedIncidents} />

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder={
                activeGroup
                  ? `Search ${activeGroup.shortName} endpoints...`
                  : "Search all services..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg
                         text-sm text-gray-300 placeholder-gray-600
                         focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        {/* Service Groups */}
        <div className="space-y-8">
          {groupedServices.map((group) => (
            <div key={group.category}>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {group.label}
                <span className="ml-2 text-xs font-normal text-gray-600">
                  ({group.services.length})
                </span>
              </h2>
              <div className="space-y-2">
                {group.services.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    onRefresh={refreshSingleService}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {filteredServices.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>No services match your search</p>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-gray-800/50 text-center">
          <p className="text-xs text-gray-600">
            Platform Status Dashboard |{" "}
            {connectionMode === "live"
              ? "Real-time via SSE"
              : "Auto-refreshes every 30s"}{" "}
            | {data.summary.totalServices} services monitored across{" "}
            {serviceGroups.length} products
          </p>
        </footer>
      </main>
    </div>
  );
}
