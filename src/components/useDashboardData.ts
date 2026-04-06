"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardSummary, HealthCheckResult, Incident, MaintenanceWindow, ServiceWithStatus } from "@/types";

export type ConnectionMode = "connecting" | "live" | "polling";

export interface DashboardDataPayload {
  summary: DashboardSummary;
  services: ServiceWithStatus[];
  activeIncidents: Incident[];
  activeMaintenanceWindows: MaintenanceWindow[];
}

async function getRequestError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    if (json?.error) return json.error;
  } catch {
    // Ignore non-JSON error bodies.
  }

  return `HTTP ${res.status}`;
}

export function useDashboardData() {
  const [data, setData] = useState<DashboardDataPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("connecting");

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

  const triggerCheck = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await fetch("/api/health-check", { method: "POST" });
      if (!res.ok) throw new Error(await getRequestError(res));
      if (connectionMode !== "live") {
        await fetchStatus();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsChecking(false);
    }
  }, [connectionMode, fetchStatus]);

  const refreshSingleService = useCallback(async (serviceId: string) => {
    try {
      const res = await fetch(`/api/services/${serviceId}`, { method: "POST" });
      if (!res.ok) throw new Error(await getRequestError(res));
      if (connectionMode !== "live") {
        await fetchStatus();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error("Failed to refresh service:", err);
    }
  }, [connectionMode, fetchStatus]);

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnectionMode("connecting");

    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.addEventListener("status", (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as DashboardDataPayload;
        setData(payload);
        setError(null);
        setLoading(false);
        setConnectionMode("live");
        reconnectAttemptRef.current = 0;
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
          const updatedServices = prev.services.map((service) => {
            if (service.id !== serviceId) return service;
            return {
              ...service,
              currentStatus: service.activeMaintenance ? "maintenance" : result.status,
              lastChecked: result.timestamp,
              lastResponseTime: result.responseTimeMs,
              recentChecks: [result, ...service.recentChecks.slice(0, 49)],
            };
          });

          return { ...prev, services: updatedServices };
        });
      } catch (err) {
        console.error("[SSE] Failed to parse service-update event:", err);
      }
    });

    es.addEventListener("ping", () => {});

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
        console.log("[SSE] Max reconnect attempts reached, falling back to polling");
        setConnectionMode("polling");
        return;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      reconnectAttemptRef.current = attempt + 1;
      console.log(`[SSE] Disconnected, reconnecting in ${delay}ms (attempt ${attempt + 1}/${maxReconnectAttempts})`);

      setConnectionMode("polling");

      reconnectTimerRef.current = setTimeout(() => {
        connectSSE();
      }, delay);
    };
  }, []);

  useEffect(() => {
    fetchStatus();
    connectSSE();

    return () => {
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

  useEffect(() => {
    if (!autoRefresh) return;
    if (connectionMode === "live") return;

    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, connectionMode, fetchStatus]);

  return {
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
  };
}
