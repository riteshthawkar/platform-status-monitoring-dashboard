// ============================================================
// Event Bus — Server-Side Pub/Sub for SSE Broadcasting
//
// Provides a simple EventEmitter-based mechanism to broadcast
// health check results to all connected SSE clients.
// ============================================================

import { ServiceWithStatus, HealthCheckResult } from "@/types";

type StatusUpdateCallback = (services: ServiceWithStatus[]) => void;
type ServiceUpdateCallback = (serviceId: string, result: HealthCheckResult) => void;

class EventBus {
  private statusListeners: Set<StatusUpdateCallback> = new Set();
  private serviceListeners: Set<ServiceUpdateCallback> = new Set();

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
