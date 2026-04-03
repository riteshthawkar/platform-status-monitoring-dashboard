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
  getUptimePercent,
  createIncident,
  getActiveIncidents,
  updateIncident,
  cleanOldChecks,
} from "./database";
import { processAlertsForResults, getAlertConfig } from "./alerting";
import { eventBus } from "./event-bus";
import { HealthCheckResult, ServiceStatus, ServiceWithStatus } from "@/types";

const CONSECUTIVE_FAILURES_THRESHOLD = 3;
let isRunning = false;
let schedulerStarted = false;

/** Tracks when each service was last checked (epoch ms). */
const lastCheckTimes: Map<string, number> = new Map();

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

    // Filter to only services whose check interval has elapsed
    const servicesToCheck = enabledServices.filter((service) => {
      const lastCheck = lastCheckTimes.get(service.id) || 0;
      const intervalMs = (service.checkIntervalSeconds || 120) * 1000;
      return (now - lastCheck) >= intervalMs;
    });

    const skipped = enabledServices.length - servicesToCheck.length;

    console.log(
      `\n[Scheduler] ─── Health check cycle started at ${timestamp} ───`
    );
    console.log(
      `[Scheduler] Checking ${servicesToCheck.length}/${enabledServices.length} services (${skipped} not yet due)`
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

    // Broadcast updated status to all connected SSE clients
    if (eventBus.connectedClients > 0) {
      try {
        const allServices = getEnabledServices();
        const allIncidents = getActiveIncidents();
        const servicesWithStatus: ServiceWithStatus[] = allServices.map((service) => {
          const latest = getLatestCheck(service.id);
          const recent = getRecentChecks(service.id, 50);
          const hasMaintenanceIncident = allIncidents.some(
            (i) => i.serviceId === service.id && i.status === "monitoring"
          );
          return {
            ...service,
            currentStatus: hasMaintenanceIncident
              ? "maintenance"
              : latest?.status ?? "unknown",
            lastChecked: latest?.timestamp ?? null,
            lastResponseTime: latest?.responseTimeMs ?? null,
            uptimePercent24h: getUptimePercent(service.id, 24),
            uptimePercent7d: getUptimePercent(service.id, 168),
            uptimePercent30d: getUptimePercent(service.id, 720),
            recentChecks: recent,
          };
        });
        eventBus.emitStatusUpdate(servicesWithStatus);
      } catch (emitErr) {
        console.error("[Scheduler] Failed to emit SSE status update:", emitErr);
      }
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
