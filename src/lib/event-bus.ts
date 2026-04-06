// ============================================================
// Event Bus — Server-Side Pub/Sub for SSE Broadcasting
//
// Provides a simple EventEmitter-based mechanism to broadcast
// health check results to all connected SSE clients.
// ============================================================

import { ServiceWithStatus, HealthCheckResult, DashboardSummary, ServiceStatus, Incident, MaintenanceWindow, ServiceOwner } from "@/types";
import { getEnabledServices } from "./services-config";
import {
  getLatestCheck,
  getRecentChecks,
  getUptimePercent,
  getActiveIncidents,
  getAllServiceOwners,
  getActiveMaintenanceWindows,
} from "./database";

type StatusUpdateCallback = (services: ServiceWithStatus[]) => void;
type ServiceUpdateCallback = (serviceId: string, result: HealthCheckResult) => void;

interface CachedDashboard {
  summary: DashboardSummary;
  services: ServiceWithStatus[];
  activeIncidents: Incident[];
  activeMaintenanceWindows: MaintenanceWindow[];
  cachedAt: number;
}

class EventBus {
  private statusListeners: Set<StatusUpdateCallback> = new Set();
  private serviceListeners: Set<ServiceUpdateCallback> = new Set();

  /** Cached dashboard payload — set by the scheduler after each cycle */
  private _dashboardCache: CachedDashboard | null = null;
  private static CACHE_TTL_MS = 60_000; // 60-second TTL

  /**
   * Get the cached dashboard payload, or rebuild it if stale/missing.
   * Eliminates 153+ SQLite queries on every API request/SSE connection.
   */
  getDashboardPayload(): CachedDashboard {
    const now = Date.now();
    if (this._dashboardCache && (now - this._dashboardCache.cachedAt) < EventBus.CACHE_TTL_MS) {
      return this._dashboardCache;
    }
    // Cache miss or stale — rebuild
    return this.rebuildDashboardCache();
  }

  /**
   * Force-rebuild the dashboard cache from the database.
   * Called by the scheduler after each cycle completes.
   */
  rebuildDashboardCache(): CachedDashboard {
    const services = getEnabledServices();
    const activeIncidents = getActiveIncidents();
    const activeMaintenanceWindows = getActiveMaintenanceWindows().map((window) => {
      const service = services.find((s) => s.id === window.serviceId);
      return {
        ...window,
        serviceName: service?.name || window.serviceId,
        serviceGroup: service?.group || "unknown",
      };
    });
    const maintenanceByService = new Map(activeMaintenanceWindows.map((window) => [window.serviceId, window]));
    const ownerByService = new Map<string, ServiceOwner>(getAllServiceOwners().map((owner) => [owner.serviceId, owner]));

    const servicesWithStatus: ServiceWithStatus[] = services.map((service) => {
      const latestCheck = getLatestCheck(service.id);
      const recentChecks = getRecentChecks(service.id, 50);
      const hasMaintenanceIncident = activeIncidents.some(
        (i) => i.serviceId === service.id && i.status === "monitoring"
      );
      const activeMaintenance = maintenanceByService.get(service.id) ?? null;
      return {
        ...service,
        currentStatus: activeMaintenance || hasMaintenanceIncident
          ? ("maintenance" as ServiceStatus)
          : latestCheck?.status ?? ("unknown" as ServiceStatus),
        lastChecked: latestCheck?.timestamp ?? null,
        lastResponseTime: latestCheck?.responseTimeMs ?? null,
        uptimePercent24h: getUptimePercent(service.id, 24),
        uptimePercent7d: getUptimePercent(service.id, 168),
        uptimePercent30d: getUptimePercent(service.id, 720),
        recentChecks: recentChecks,
        owner: ownerByService.get(service.id) ?? null,
        activeMaintenance,
      };
    });

    const statusCounts = servicesWithStatus.reduce(
      (acc, s) => {
        acc[s.currentStatus] = (acc[s.currentStatus] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    let overallStatus: ServiceStatus = "operational";
    if (statusCounts["down"] > 0) overallStatus = "down";
    else if (statusCounts["degraded"] > 0) overallStatus = "degraded";
    else if (statusCounts["maintenance"] > 0) overallStatus = "maintenance";

    const summary: DashboardSummary = {
      totalServices: services.length,
      operational: statusCounts["operational"] || 0,
      degraded: statusCounts["degraded"] || 0,
      down: statusCounts["down"] || 0,
      maintenance: statusCounts["maintenance"] || 0,
      overallStatus,
      lastUpdated: new Date().toISOString(),
    };

    this._dashboardCache = {
      summary,
      services: servicesWithStatus,
      activeIncidents,
      activeMaintenanceWindows,
      cachedAt: Date.now(),
    };
    return this._dashboardCache;
  }

  /**
   * Rebuild the cached dashboard payload and broadcast it to SSE clients.
   */
  broadcastDashboardRefresh(): CachedDashboard {
    const cached = this.rebuildDashboardCache();
    this.emitStatusUpdate(cached.services);
    return cached;
  }

  /** Number of currently connected SSE clients */
  get connectedClients(): number {
    return this.statusListeners.size;
  }

  // ─── Status Updates (full dashboard refresh) ──────────────

  onStatusUpdate(callback: StatusUpdateCallback): void {
    this.statusListeners.add(callback);
    console.log(`[EventBus] Client connected (${this.connectedClients} total)`);
  }

  offStatusUpdate(callback: StatusUpdateCallback): void {
    this.statusListeners.delete(callback);
    console.log(`[EventBus] Client disconnected (${this.connectedClients} total)`);
  }

  emitStatusUpdate(services: ServiceWithStatus[]): void {
    if (this.statusListeners.size === 0) return;
    console.log(`[EventBus] Broadcasting status update to ${this.statusListeners.size} client(s)`);
    for (const listener of this.statusListeners) {
      try {
        listener(services);
      } catch (err) {
        console.error("[EventBus] Error in status listener:", err);
      }
    }
  }

  // ─── Service Updates (single service change) ─────────────

  onServiceUpdate(callback: ServiceUpdateCallback): void {
    this.serviceListeners.add(callback);
  }

  offServiceUpdate(callback: ServiceUpdateCallback): void {
    this.serviceListeners.delete(callback);
  }

  emitServiceUpdate(serviceId: string, result: HealthCheckResult): void {
    if (this.serviceListeners.size === 0) return;
    for (const listener of this.serviceListeners) {
      try {
        listener(serviceId, result);
      } catch (err) {
        console.error("[EventBus] Error in service listener:", err);
      }
    }
  }
}

// Global singleton — survives across hot reloads in development
const globalForEventBus = globalThis as unknown as { __eventBus?: EventBus };

if (!globalForEventBus.__eventBus) {
  globalForEventBus.__eventBus = new EventBus();
}

export const eventBus: EventBus = globalForEventBus.__eventBus;
