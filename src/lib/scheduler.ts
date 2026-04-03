// ============================================================
// In-Process Background Health Check Scheduler
//
// Replaces system cron for managed platforms (Render, Railway, Fly.io).
// Runs every minute and checks each service according to its own
// checkIntervalSeconds (30, 60, 120, 300 etc.) from services-config.
// Activated automatically in production via instrumentation.ts.
// ============================================================

import cron from "node-cron";
import { getEnabledServices } from "./services-config";
import { checkService } from "./health-checker";
import {
  insertHealthCheck,
  getLatestCheck,
  getRecentChecks,
  createIncident,
  getActiveIncidents,
  updateIncident,
  cleanOldChecks,
} from "./database";
// NOTE: getUptimePercent is used by eventBus.rebuildDashboardCache() in event-bus.ts
import { processAlertsForResults, getAlertConfig } from "./alerting";
import { eventBus } from "./event-bus";
import { HealthCheckResult, ServiceStatus } from "@/types";

const CONSECUTIVE_FAILURES_THRESHOLD = 3;

/** After this many consecutive failures, back off to CIRCUIT_BREAKER_INTERVAL_MS */
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let isRunning = false;
let schedulerStarted = false;

/** Tracks when each service was last checked (epoch ms). */
const lastCheckTimes: Map<string, number> = new Map();

/** Tracks consecutive failure count per service for circuit breaker. */
const consecutiveFailures: Map<string, number> = new Map();

/**
 * Run a single round of health checks for services whose interval has elapsed.
 * Stores results, manages incidents, and sends alerts.
 */
async function runHealthCheckCycle(): Promise<void> {
  if (isRunning) {
    console.log("[Scheduler] Previous cycle still running, skipping...");
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const enabledServices = getEnabledServices();
    const now = Date.now();

    // Filter to only services whose check interval has elapsed.
    // Circuit breaker: if a service has failed CIRCUIT_BREAKER_THRESHOLD times
    // consecutively, slow its check interval to 5 minutes to avoid wasting
    // resources on persistently down services (each timeout = up to 49 seconds).
    let circuitBroken = 0;
    const servicesToCheck = enabledServices.filter((service) => {
      const lastCheck = lastCheckTimes.get(service.id) || 0;
      const failures = consecutiveFailures.get(service.id) || 0;

      // Circuit breaker: use slower interval for persistently failing services
      const isCircuitOpen = failures >= CIRCUIT_BREAKER_THRESHOLD;
      const intervalMs = isCircuitOpen
        ? CIRCUIT_BREAKER_INTERVAL_MS
        : (service.checkIntervalSeconds || 120) * 1000;

      if (isCircuitOpen && (now - lastCheck) < intervalMs) {
        circuitBroken++;
      }

      return (now - lastCheck) >= intervalMs;
    });

    const skipped = enabledServices.length - servicesToCheck.length - circuitBroken;

    console.log(
      `\n[Scheduler] ─── Health check cycle started at ${timestamp} ───`
    );
    console.log(
      `[Scheduler] Checking ${servicesToCheck.length}/${enabledServices.length} services` +
      ` (${skipped} not yet due${circuitBroken > 0 ? `, ${circuitBroken} circuit-broken` : ""})`
    );

    if (servicesToCheck.length === 0) {
      console.log(`[Scheduler] ─── No services due, cycle skipped ───\n`);
      return;
    }

    // Capture previous statuses for alert comparison
    const previousStatuses = new Map<string, ServiceStatus>();
    for (const service of servicesToCheck) {
      const lastCheck = getLatestCheck(service.id);
      if (lastCheck) {
        previousStatuses.set(service.id, lastCheck.status);
      }
    }

    // Run checks only for services that are due
    const results: HealthCheckResult[] = [];
    for (const service of servicesToCheck) {
      try {
        const result = await checkService(service);
        results.push(result);

        // Store in database
        insertHealthCheck(result);

        // Update last check time for this service
        lastCheckTimes.set(service.id, Date.now());

        // Circuit breaker: track consecutive failures
        if (result.status === "down" || result.status === "degraded") {
          const prev = consecutiveFailures.get(service.id) || 0;
          const newCount = prev + 1;
          consecutiveFailures.set(service.id, newCount);
          if (newCount === CIRCUIT_BREAKER_THRESHOLD) {
            console.log(`[Scheduler] ⚡ CIRCUIT OPEN: ${service.name} — ${newCount} consecutive failures, backing off to 5min intervals`);
          }
        } else {
          // Reset on success
          if (consecutiveFailures.has(service.id) && consecutiveFailures.get(service.id)! >= CIRCUIT_BREAKER_THRESHOLD) {
            console.log(`[Scheduler] ⚡ CIRCUIT CLOSED: ${service.name} — recovered, resuming normal interval`);
          }
          consecutiveFailures.delete(service.id);
        }

        // Manage incidents
        manageIncidents(service.id, service.name, result);

        // Emit individual service update to SSE clients
        eventBus.emitServiceUpdate(service.id, result);
      } catch (err) {
        console.error(`[Scheduler] Check failed for ${service.name}: ${err}`);
        const failResult: HealthCheckResult = {
          serviceId: service.id,
          timestamp: new Date().toISOString(),
          status: "unknown",
          responseTimeMs: 0,
          statusCode: null,
          errorMessage: `Check exception: ${err}`,
        };
        results.push(failResult);
        insertHealthCheck(failResult);

        // Still update last check time so we don't retry immediately
        lastCheckTimes.set(service.id, Date.now());
      }
    }

    // Process alerts (failures and recoveries)
    const { failures, recoveries } = await processAlertsForResults(results, previousStatuses);

    // Summary
    const operational = results.filter((r) => r.status === "operational").length;
    const degraded = results.filter((r) => r.status === "degraded").length;
    const down = results.filter((r) => r.status === "down").length;
    const duration = Date.now() - startTime;

    console.log(
      `[Scheduler] ─── Cycle complete: ${operational}✅ ${degraded}⚠️ ${down}🔴 | ` +
        `${failures.length} new failures, ${recoveries.length} recoveries | ${duration}ms ───\n`
    );

    // Clean old records once per cycle (keeps last 90 days)
    cleanOldChecks(90);

    // Rebuild the dashboard cache (used by API routes + SSE)
    // This runs the 153+ SQLite queries once, then all consumers read from cache.
    try {
      const cached = eventBus.rebuildDashboardCache();

      // Broadcast to connected SSE clients
      if (eventBus.connectedClients > 0) {
        eventBus.emitStatusUpdate(cached.services);
      }
    } catch (emitErr) {
      console.error("[Scheduler] Failed to rebuild cache / emit SSE update:", emitErr);
    }
  } catch (err) {
    console.error(`[Scheduler] Cycle error: ${err}`);
  } finally {
    isRunning = false;
  }
}

/**
 * Manage incidents with consecutive failure threshold.
 */
function manageIncidents(serviceId: string, serviceName: string, check: HealthCheckResult) {
  const activeIncidents = getActiveIncidents().filter((i) => i.serviceId === serviceId);

  if (check.status === "down" || check.status === "degraded") {
    if (activeIncidents.length === 0) {
      const recentChecks = getRecentChecks(serviceId, CONSECUTIVE_FAILURES_THRESHOLD);
      if (recentChecks.length < CONSECUTIVE_FAILURES_THRESHOLD) return;

      const allBad = recentChecks.every((c) => c.status !== "operational");
      if (allBad) {
        const isDown = recentChecks.some((c) => c.status === "down");
        createIncident({
          serviceId,
          title: `${serviceName} is ${isDown ? "down" : "degraded"}`,
          description: check.errorMessage || `Service detected as ${check.status}`,
          status: "investigating",
          severity: isDown ? "critical" : "minor",
        });
        console.log(`[Scheduler] 🚨 INCIDENT CREATED: ${serviceName}`);
      }
    }
  } else if (check.status === "operational") {
    for (const incident of activeIncidents) {
      updateIncident(incident.id!, { status: "resolved" });
      console.log(`[Scheduler] ✅ INCIDENT RESOLVED: ${serviceName}`);
    }
  }
}

/**
 * Start the background scheduler.
 * Safe to call multiple times — only starts once.
 *
 * The cron runs every minute so it can catch services with 30-second
 * intervals on every tick.  Each service is only checked when its own
 * checkIntervalSeconds has elapsed since the last check.
 */
export function startScheduler(): void {
  if (schedulerStarted) {
    console.log("[Scheduler] Already running, skipping duplicate start.");
    return;
  }

  const alertConfig = getAlertConfig();
  const services = getEnabledServices();

  // Collect distinct intervals for the startup log
  const intervals = [...new Set(services.map((s) => s.checkIntervalSeconds || 120))].sort(
    (a, b) => a - b
  );

  console.log(`[Scheduler] ═══════════════════════════════════════════════`);
  console.log(`[Scheduler] Background health checker starting...`);
  console.log(`[Scheduler] Cron tick: every 1 minute`);
  console.log(`[Scheduler] Services: ${services.length}`);
  console.log(`[Scheduler] Per-service intervals: ${intervals.map((i) => `${i}s`).join(", ")}`);
  console.log(`[Scheduler] Slack: ${alertConfig.slackConfigured ? "✅" : "❌"}`);
  console.log(`[Scheduler] Email: ${alertConfig.emailConfigured ? "✅" : "❌"}`);
  console.log(`[Scheduler] ═══════════════════════════════════════════════`);

  // Schedule with node-cron: "*/1 * * * *" = every 1 minute
  cron.schedule("*/1 * * * *", () => {
    runHealthCheckCycle();
  });

  schedulerStarted = true;

  // Run first check immediately after 5s delay (let the server finish booting)
  setTimeout(() => {
    console.log("[Scheduler] Running initial health check cycle...");
    runHealthCheckCycle();
  }, 5000);
}
