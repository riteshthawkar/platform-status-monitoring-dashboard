// ============================================================
// In-Process Background Health Check Scheduler
//
// Replaces system cron for managed platforms (Render, Railway, Fly.io).
// Runs every 30 seconds and checks each service according to its own
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
  getUpcomingDeadlines,
  getActiveMaintenanceWindow,
  getLatestDeployments,
  getProbeUsageSummary,
  getProbeUsageTotals,
  recordProbeBudgetSkip,
  recordProbeUsage,
} from "./database";
import { processAlertsForResults, getAlertConfig, sendAssignmentEmail } from "./alerting";
import { eventBus } from "./event-bus";
import { HealthCheckResult, ServiceStatus } from "@/types";
import {
  decideTokenProbeBudget,
  estimateProbeTokens,
  getAdaptiveIntervalSeconds,
  getProbePolicyConfig,
  isTokenMeteredProbe,
} from "./probe-policy";

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

/** Tracks when deadline reminders were last sent (to avoid spam). */
const deadlineRemindersSent: Map<string, number> = new Map();

interface DueService {
  service: ReturnType<typeof getEnabledServices>[number];
  isCircuitOpen: boolean;
  estimatedTokens: number;
}

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
    const policyConfig = getProbePolicyConfig();
    const activeIncidentServiceIds = new Set(
      getActiveIncidents().map((incident) => incident.serviceId)
    );
    const deploymentWindowMs = policyConfig.postDeployWindowMinutes * 60 * 1000;
    const latestDeployments = getLatestDeployments();
    const latestDeploymentMsByService = new Map<string, number>();
    for (const deployment of latestDeployments) {
      const deployedAtMs = new Date(deployment.deployedAt).getTime();
      if (Number.isNaN(deployedAtMs)) continue;
      const existing = latestDeploymentMsByService.get(deployment.serviceId);
      if (!existing || deployedAtMs > existing) {
        latestDeploymentMsByService.set(deployment.serviceId, deployedAtMs);
      }
    }

    // Filter to only services whose adaptive check interval has elapsed.
    // For token-metered probes we apply daily budget controls.
    let circuitBroken = 0;
    let notYetDue = 0;
    let budgetSkipped = 0;
    let emergencyRuns = 0;
    const servicesToCheck: DueService[] = [];

    for (const service of enabledServices) {
      const lastCheck = lastCheckTimes.get(service.id) || 0;
      const failures = consecutiveFailures.get(service.id) || 0;
      const hasActiveIncident = activeIncidentServiceIds.has(service.id);
      const latestDeploymentMs = latestDeploymentMsByService.get(service.id);
      const hasRecentDeployment = latestDeploymentMs
        ? now - latestDeploymentMs <= deploymentWindowMs
        : false;
      const effectiveIntervalSeconds = getAdaptiveIntervalSeconds(
        service,
        {
          hasActiveIncident,
          hasRecentDeployment,
          isCriticalService: !!service.tags?.includes("critical"),
        },
        policyConfig
      );

      // Circuit breaker: use slower interval for persistently failing services
      const isCircuitOpen = failures >= CIRCUIT_BREAKER_THRESHOLD && !hasActiveIncident;
      const intervalMs = isCircuitOpen
        ? Math.max(CIRCUIT_BREAKER_INTERVAL_MS, effectiveIntervalSeconds * 1000)
        : effectiveIntervalSeconds * 1000;

      if (now - lastCheck < intervalMs) {
        if (isCircuitOpen) {
          circuitBroken++;
        } else {
          notYetDue++;
        }
        continue;
      }

      let estimatedTokens = 0;
      if (isTokenMeteredProbe(service)) {
        estimatedTokens = estimateProbeTokens(service);
        const usageTotals = getProbeUsageTotals(service.id);
        const budgetDecision = decideTokenProbeBudget(
          {
            totalEstimatedTokens: usageTotals.totalEstimatedTokens,
            serviceEstimatedTokens: usageTotals.serviceEstimatedTokens,
          },
          service,
          estimatedTokens,
          hasActiveIncident,
          policyConfig
        );

        if (!budgetDecision.allowed) {
          budgetSkipped++;
          recordProbeBudgetSkip(service.id, budgetDecision.reason || "token budget exceeded");
          // Mark as checked for cadence purposes to avoid hot-looping every 30s.
          lastCheckTimes.set(service.id, now);
          continue;
        }

        if (budgetDecision.usedEmergencyReserve) {
          emergencyRuns++;
        }
      }

      servicesToCheck.push({
        service,
        isCircuitOpen,
        estimatedTokens,
      });
    }

    console.log(
      `\n[Scheduler] ─── Health check cycle started at ${timestamp} ───`
    );
    console.log(
      `[Scheduler] Checking ${servicesToCheck.length}/${enabledServices.length} services` +
      ` (${notYetDue} not yet due` +
      `${circuitBroken > 0 ? `, ${circuitBroken} circuit-broken` : ""}` +
      `${budgetSkipped > 0 ? `, ${budgetSkipped} budget-limited` : ""})`
    );
    if (emergencyRuns > 0) {
      console.log(`[Scheduler] ⚠️  Emergency token reserve used for ${emergencyRuns} incident probe(s)`);
    }

    if (servicesToCheck.length === 0) {
      if (budgetSkipped > 0) {
        console.log(`[Scheduler] ─── No checks executed (all due probes blocked by budget) ───\n`);
      } else {
      console.log(`[Scheduler] ─── No services due, cycle skipped ───\n`);
      }
      return;
    }

    // Capture previous statuses for alert comparison
    const previousStatuses = new Map<string, ServiceStatus>();
    for (const dueService of servicesToCheck) {
      const lastCheck = getLatestCheck(dueService.service.id);
      if (lastCheck) {
        previousStatuses.set(dueService.service.id, lastCheck.status);
      }
    }

    // Run checks only for services that are due
    const results: HealthCheckResult[] = [];
    let cycleEstimatedTokens = 0;
    for (const dueService of servicesToCheck) {
      const { service, estimatedTokens, isCircuitOpen } = dueService;
      try {
        const result = await checkService(service);
        results.push(result);

        // Store in database
        insertHealthCheck(result);

        if (estimatedTokens > 0 && result.statusCode !== null) {
          recordProbeUsage(service.id, estimatedTokens);
          cycleEstimatedTokens += estimatedTokens;
        }

        // Update last check time for this service
        lastCheckTimes.set(service.id, Date.now());

        // Circuit breaker: track consecutive failures
        if (result.status === "down" || result.status === "degraded") {
          const prev = consecutiveFailures.get(service.id) || 0;
          const newCount = prev + 1;
          consecutiveFailures.set(service.id, newCount);
          if (newCount === CIRCUIT_BREAKER_THRESHOLD && !isCircuitOpen) {
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
    const probeUsageSummary = getProbeUsageSummary();

    console.log(
      `[Scheduler] ─── Cycle complete: ${operational}✅ ${degraded}⚠️ ${down}🔴 | ` +
        `${failures.length} new failures, ${recoveries.length} recoveries | ${duration}ms ───`
    );
    if (cycleEstimatedTokens > 0 || budgetSkipped > 0) {
      console.log(
        `[Scheduler] Token probes: +${cycleEstimatedTokens} est. tokens this cycle | ` +
        `today ${probeUsageSummary.totalEstimatedTokens}/${policyConfig.dailyTokenBudget}` +
        `${budgetSkipped > 0 ? ` | skipped ${budgetSkipped}` : ""}`
      );
    }
    console.log("");

    // Clean old records once per cycle (keeps last 90 days)
    cleanOldChecks(90);

    // Check for approaching deadlines (every cycle, ~1 min)
    try {
      const upcoming = getUpcomingDeadlines(2); // within 2 hours
      for (const assignment of upcoming) {
        // Only send reminder once per assignment — use cooldown key
        const cooldownKey = `deadline-reminder-${assignment.id}`;
        const lastReminder = deadlineRemindersSent.get(cooldownKey);
        if (!lastReminder || (Date.now() - lastReminder) > 60 * 60 * 1000) { // max once per hour
          if (assignment.assigneeEmail) {
            sendAssignmentEmail({
              toEmail: assignment.assigneeEmail,
              toName: assignment.assigneeName || "Team Member",
              incidentId: assignment.incidentId,
              assignmentId: assignment.id!,
              notes: assignment.notes,
              deadline: assignment.deadline,
              type: "deadline_reminder",
            }).catch((err) => console.error("[Scheduler] Deadline reminder email failed:", err));
            deadlineRemindersSent.set(cooldownKey, Date.now());
            console.log(`[Scheduler] 📧 Deadline reminder sent to ${assignment.assigneeName} for incident #${assignment.incidentId}`);
          }
        }
      }
    } catch (dlErr) {
      console.error("[Scheduler] Deadline check error:", dlErr);
    }

    // Rebuild the dashboard cache (used by API routes + SSE)
    // This runs the 153+ SQLite queries once, then all consumers read from cache.
    try {
      eventBus.broadcastDashboardRefresh();
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
  if (getActiveMaintenanceWindow(serviceId)) {
    return;
  }

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
 * The cron runs every 30 seconds so it can catch services with 30-second
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
  const policyConfig = getProbePolicyConfig();

  // Collect distinct intervals for the startup log
  const intervals = [...new Set(services.map((s) => s.checkIntervalSeconds || 120))].sort(
    (a, b) => a - b
  );

  console.log(`[Scheduler] ═══════════════════════════════════════════════`);
  console.log(`[Scheduler] Background health checker starting...`);
  console.log(`[Scheduler] Cron tick: every 30 seconds`);
  console.log(`[Scheduler] Services: ${services.length}`);
  console.log(`[Scheduler] Per-service intervals: ${intervals.map((i) => `${i}s`).join(", ")}`);
  console.log(
    `[Scheduler] Token probe policy: generation≥${policyConfig.generationHealthyIntervalSeconds}s, ` +
    `synthetic≥${policyConfig.syntheticHealthyIntervalSeconds}s, ` +
    `incident=${policyConfig.incidentTokenIntervalSeconds}s`
  );
  console.log(
    `[Scheduler] Token budgets: daily=${policyConfig.dailyTokenBudget}, ` +
    `per-service=${policyConfig.perServiceDailyTokenBudget}, ` +
    `emergency=${policyConfig.emergencyTokenReserve}, enforced=${policyConfig.enforceTokenBudget}`
  );
  console.log(`[Scheduler] Slack: ${alertConfig.slackConfigured ? "✅" : "❌"}`);
  console.log(`[Scheduler] Email: ${alertConfig.emailConfigured ? "✅" : "❌"}`);
  console.log(`[Scheduler] ═══════════════════════════════════════════════`);

  // Schedule with node-cron: "*/30 * * * * *" = every 30 seconds
  cron.schedule("*/30 * * * * *", () => {
    runHealthCheckCycle();
  });

  schedulerStarted = true;

  // Run first check immediately after 5s delay (let the server finish booting)
  setTimeout(() => {
    console.log("[Scheduler] Running initial health check cycle...");
    runHealthCheckCycle();
  }, 5000);
}
