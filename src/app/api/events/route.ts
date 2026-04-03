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
import { ServiceWithStatus, HealthCheckResult } from "@/types";

export const dynamic = "force-dynamic";

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

      // 1. Send current status immediately on connection (from cache)
      try {
        const cached = eventBus.getDashboardPayload();
        send("status", {
          summary: cached.summary,
          services: cached.services,
          activeIncidents: cached.activeIncidents,
        });
      } catch (err) {
        console.error("[SSE] Failed to send initial status:", err);
      }

      // 2. Listen for full status updates from the event bus
      const onStatusUpdate = (_services: ServiceWithStatus[]) => {
        // Use fresh cache — scheduler rebuilds it before emitting
        try {
          const cached = eventBus.getDashboardPayload();
          send("status", {
            summary: cached.summary,
            services: cached.services,
            activeIncidents: cached.activeIncidents,
          });
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
