// ============================================================
// GET /api/events — Server-Sent Events endpoint
//
// Streams real-time dashboard updates to connected clients.
// On connection: sends the current full status snapshot.
// On health check cycle: sends updated status via event bus.
// On individual service check: sends single service update.
// Sends keepalive pings every 15 seconds.
// ============================================================

import { NextRequest } from "next/server";
import { eventBus } from "@/lib/event-bus";
import { getEnabledServices } from "@/lib/services-config";
import {
  getLatestCheck,
  getRecentChecks,
  getUptimePercent,
  getActiveIncidents,
} from "@/lib/database";
import {
  ServiceWithStatus,
  HealthCheckResult,
  DashboardSummary,
  ServiceStatus,
} from "@/types";

export const dynamic = "force-dynamic";

/**
 * Build the full dashboard payload (same shape as GET /api/health-check).
 */
function buildDashboardPayload() {
  const services = getEnabledServices();
  const activeIncidents = getActiveIncidents();

  const servicesWithStatus: ServiceWithStatus[] = services.map((service) => {
    const latestCheck = getLatestCheck(service.id);
    const recentChecks = getRecentChecks(service.id, 50);

    const hasMaintenanceIncident = activeIncidents.some(
      (i) => i.serviceId === service.id && i.status === "monitoring"
    );

    return {
      ...service,
      currentStatus: hasMaintenanceIncident
        ? "maintenance"
        : latestCheck?.status ?? "unknown",
      lastChecked: latestCheck?.timestamp ?? null,
      lastResponseTime: latestCheck?.responseTimeMs ?? null,
      uptimePercent24h: getUptimePercent(service.id, 24),
      uptimePercent7d: getUptimePercent(service.id, 168),
      uptimePercent30d: getUptimePercent(service.id, 720),
      recentChecks: recentChecks,
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

  return {
    summary,
    services: servicesWithStatus,
    activeIncidents,
  };
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let alive = true;

      // Helper to send an SSE event
      function send(event: string, data: unknown) {
        if (!alive) return;
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Client disconnected — will be cleaned up
        }
      }

      // 1. Send current status immediately on connection
      try {
        const current = buildDashboardPayload();
        send("status", current);
      } catch (err) {
        console.error("[SSE] Failed to send initial status:", err);
      }

      // 2. Listen for full status updates from the event bus
      const onStatusUpdate = (_services: ServiceWithStatus[]) => {
        // Rebuild the full payload to include summary + incidents
        try {
          const payload = buildDashboardPayload();
          send("status", payload);
        } catch {
          // Ignore — client may have disconnected
        }
      };

      // 3. Listen for individual service updates
      const onServiceUpdate = (serviceId: string, result: HealthCheckResult) => {
        send("service-update", { serviceId, result });
      };

      eventBus.onStatusUpdate(onStatusUpdate);
      eventBus.onServiceUpdate(onServiceUpdate);

      // 4. Keepalive ping every 15 seconds
      const pingInterval = setInterval(() => {
        if (!alive) return;
        try {
          const ping = `event: ping\ndata: ${JSON.stringify({ time: new Date().toISOString(), clients: eventBus.connectedClients })}\n\n`;
          controller.enqueue(encoder.encode(ping));
        } catch {
          // Client disconnected
          cleanup();
        }
      }, 15000);

      // 5. Cleanup on disconnect
      function cleanup() {
        if (!alive) return;
        alive = false;
        clearInterval(pingInterval);
        eventBus.offStatusUpdate(onStatusUpdate);
        eventBus.offServiceUpdate(onServiceUpdate);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }

      // Listen for client disconnect via abort signal
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering
    },
  });
}
