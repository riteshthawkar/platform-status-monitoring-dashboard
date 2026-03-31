// ============================================================
// In-Process Background Health Check Scheduler
//
// Replaces system cron for managed platforms (Render, Railway, Fly.io).
// Runs health checks every CRON_INTERVAL_MINUTES (default: 2 min).
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
import { processAlertsForResults, getAlertConfig } from "./alerting";
import { HealthCheckResult, ServiceStatus } from "@/types";

const CONSECUTIVE_FAILURES_THRESHOLD = 3;
const CRON_INTERVAL = process.env.CRON_INTERVAL_MINUTES || "2";
let isRunning = false;
let schedulerStarted = false;

/**
 * Run a single round of health checks for all services.
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
    console.log(`\n[Scheduler] ─── Health check cycle started at ${timestamp} ───`);

    const services = getEnabledServices();

    // Capture previous statuses for alert comparison
    const previousStatuses = new Map<string, ServiceStatus>();
    for (const service of services) {
      const lastCheck = getLatestCheck(service.id);
      if (lastCheck) {
        previousStatuses.set(service.id, lastCheck.status);
      }
    }

    // Run all checks with retry logic
    const results: HealthCheckResult[] = [];
    for (const service of services) {
      try {
        const result = await checkService(service);
        results.push(result);

        // Store in database
        insertHealthCheck(result);

        // Manage incidents
        manageIncidents(service.id, service.name, result);
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
 */
export function startScheduler(): void {
  if (schedulerStarted) {
    console.log("[Scheduler] Already running, skipping duplicate start.");
    return;
  }

  const alertConfig = getAlertConfig();
  console.log(`[Scheduler] ═══════════════════════════════════════════════`);
  console.log(`[Scheduler] Background health checker starting...`);
  console.log(`[Scheduler] Interval: every ${CRON_INTERVAL} minutes`);
  console.log(`[Scheduler] Services: ${getEnabledServices().length}`);
  console.log(`[Scheduler] Slack: ${alertConfig.slackConfigured ? "✅" : "❌"}`);
  console.log(`[Scheduler] Email: ${alertConfig.emailConfigured ? "✅" : "❌"}`);
  console.log(`[Scheduler] ═══════════════════════════════════════════════`);

  // Schedule with node-cron: "*/2 * * * *" = every 2 minutes
  cron.schedule(`*/${CRON_INTERVAL} * * * *`, () => {
    runHealthCheckCycle();
  });

  schedulerStarted = true;

  // Run first check immediately after 5s delay (let the server finish booting)
  setTimeout(() => {
    console.log("[Scheduler] Running initial health check cycle...");
    runHealthCheckCycle();
  }, 5000);
}
