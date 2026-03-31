// ============================================================
// Health Check Engine (with Retry Logic)
// Performs HTTP/TCP/keyword/JSON checks with automatic retries
// ============================================================

import { ServiceConfig, ServiceStatus, HealthCheckResult } from "@/types";
import { getEnabledServices } from "./services-config";
import { insertHealthCheck, getRecentChecks, createIncident, getActiveIncidents, updateIncident } from "./database";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

interface CheckResult {
  status: ServiceStatus;
  responseTimeMs: number;
  statusCode: number | null;
  errorMessage: string | null;
  retries: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function performHttpCheck(service: ServiceConfig): Promise<Omit<CheckResult, "retries">> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), service.timeoutMs);

  const start = performance.now();

  try {
    const response = await fetch(service.url, {
      method: service.method || "GET",
      headers: service.headers || {},
      body: service.method === "POST" ? service.body || "" : undefined,
      signal: controller.signal,
    });

    const responseTime = Math.round(performance.now() - start);
    clearTimeout(timeout);

    const expectedStatus = service.expectedStatusCode || 200;

    // For keyword checks, we need to read the body
    if (service.checkType === "keyword" && service.expectedKeyword) {
      const body = await response.text();
      if (body.includes(service.expectedKeyword)) {
        return {
          status: "operational",
          responseTimeMs: responseTime,
          statusCode: response.status,
          errorMessage: null,
        };
      } else {
        return {
          status: "degraded",
          responseTimeMs: responseTime,
          statusCode: response.status,
          errorMessage: `Expected keyword "${service.expectedKeyword}" not found in response`,
        };
      }
    }

    // For JSON query checks
    if (service.checkType === "json_query" && service.jsonPath && service.jsonExpectedValue) {
      try {
        const json = await response.json();
        const value = getNestedValue(json, service.jsonPath);
        if (String(value) === service.jsonExpectedValue) {
          return {
            status: "operational",
            responseTimeMs: responseTime,
            statusCode: response.status,
            errorMessage: null,
          };
        } else {
          return {
            status: "degraded",
            responseTimeMs: responseTime,
            statusCode: response.status,
            errorMessage: `JSON path "${service.jsonPath}" returned "${value}", expected "${service.jsonExpectedValue}"`,
          };
        }
      } catch {
        return {
          status: "degraded",
          responseTimeMs: responseTime,
          statusCode: response.status,
          errorMessage: "Failed to parse JSON response",
        };
      }
    }

    // Standard HTTP status check
    if (response.status === expectedStatus) {
      // Check if response is slow (> 5 seconds)
      if (responseTime > 5000) {
        return {
          status: "degraded",
          responseTimeMs: responseTime,
          statusCode: response.status,
          errorMessage: `Response time ${responseTime}ms exceeds 5000ms threshold`,
        };
      }
      return {
        status: "operational",
        responseTimeMs: responseTime,
        statusCode: response.status,
        errorMessage: null,
      };
    } else {
      return {
        status: "degraded",
        responseTimeMs: responseTime,
        statusCode: response.status,
        errorMessage: `Expected status ${expectedStatus}, got ${response.status}`,
      };
    }
  } catch (error: unknown) {
    clearTimeout(timeout);
    const responseTime = Math.round(performance.now() - start);

    const errorMessage =
      error instanceof Error
        ? error.name === "AbortError"
          ? `Timeout after ${service.timeoutMs}ms`
          : error.message
        : "Unknown error";

    return {
      status: "down",
      responseTimeMs: responseTime,
      statusCode: null,
      errorMessage,
    };
  }
}

/**
 * Perform check WITH retries.
 * If the first attempt fails (down), retry up to MAX_RETRIES times.
 * Only returns "down" if ALL attempts fail.
 */
async function performCheckWithRetry(service: ServiceConfig): Promise<CheckResult> {
  let lastResult = await performHttpCheck(service);
  let retries = 0;

  // Only retry on hard failures (down), not on degraded
  while (lastResult.status === "down" && retries < MAX_RETRIES) {
    retries++;
    console.log(
      `  [RETRY ${retries}/${MAX_RETRIES}] ${service.name} — retrying in ${RETRY_DELAY_MS}ms...`
    );
    await sleep(RETRY_DELAY_MS);
    lastResult = await performHttpCheck(service);
  }

  return { ...lastResult, retries };
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export async function checkService(service: ServiceConfig): Promise<HealthCheckResult> {
  const result = await performCheckWithRetry(service);

  const healthCheck: HealthCheckResult = {
    serviceId: service.id,
    timestamp: new Date().toISOString(),
    status: result.status,
    responseTimeMs: result.responseTimeMs,
    statusCode: result.statusCode,
    errorMessage:
      result.retries > 0
        ? `${result.errorMessage} (after ${result.retries} retries)`
        : result.errorMessage,
  };

  return healthCheck;
}

export async function checkServiceAndStore(service: ServiceConfig): Promise<HealthCheckResult> {
  const result = await checkService(service);

  // Store in database
  insertHealthCheck(result);

  // Auto-incident management (with consecutive failure check)
  manageAutoIncidents(service, result);

  return result;
}

/**
 * Improved incident management:
 * - Requires 3 consecutive failures before creating an incident
 * - Grace period: skip incident creation if <3 checks exist (service just added)
 * - Auto-resolves when service comes back
 */
function manageAutoIncidents(service: ServiceConfig, check: HealthCheckResult) {
  const activeIncidents = getActiveIncidents().filter((i) => i.serviceId === service.id);

  if (check.status === "down" || check.status === "degraded") {
    if (activeIncidents.length === 0) {
      // Look at the last 3 checks (including the current one just stored)
      const recentChecks = getRecentChecks(service.id, 3);

      // Grace period: need at least 3 checks to determine a pattern
      if (recentChecks.length < 3) return;

      // All 3 most recent checks must be non-operational
      const allBad = recentChecks.every((c) => c.status !== "operational");

      if (allBad) {
        const isDown = recentChecks.some((c) => c.status === "down");
        createIncident({
          serviceId: service.id,
          title: `${service.name} is ${isDown ? "down" : "degraded"}`,
          description: check.errorMessage || `Service detected as ${check.status}`,
          status: "investigating",
          severity: isDown ? "critical" : "minor",
        });
      }
    }
  } else if (check.status === "operational") {
    // Auto-resolve active incidents when service recovers
    for (const incident of activeIncidents) {
      updateIncident(incident.id!, { status: "resolved" });
    }
  }
}

export async function checkAllServices(): Promise<HealthCheckResult[]> {
  const services = getEnabledServices();
  const results = await Promise.allSettled(services.map((s) => checkServiceAndStore(s)));

  return results.map((r, i) => {
    if (r.status === "fulfilled") {
      return r.value;
    }
    return {
      serviceId: services[i].id,
      timestamp: new Date().toISOString(),
      status: "unknown" as ServiceStatus,
      responseTimeMs: 0,
      statusCode: null,
      errorMessage: `Check failed: ${r.reason}`,
    };
  });
}
