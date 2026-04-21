#!/usr/bin/env npx tsx
// ============================================================
// Background Health Check Runner (Cron Script)
//
// Run manually:   npx tsx src/scripts/cron-checker.ts
// Run via cron:   */2 * * * * cd /path/to/dashboard && npx tsx src/scripts/cron-checker.ts >> logs/cron.log 2>&1
//
// Environment variables:
//   SLACK_WEBHOOK_URL       - Slack incoming webhook URL (optional)
//   ALERT_EMAIL             - Email for alerts (future)
//   ALERT_COOLDOWN_MINUTES  - Minutes between repeated alerts (default: 10)
// ============================================================

import { getEnabledServices } from "../lib/services-config";
import { checkService } from "../lib/health-checker";
import {
  insertHealthCheck,
  getLatestCheck,
  getRecentChecks,
  createIncident,
  getActiveIncidents,
  updateIncident,
  getActiveMaintenanceWindow,
  getProbeUsageTotals,
  recordProbeBudgetSkip,
  recordProbeUsage,
} from "../lib/database";
import { processAlertsForResults, getAlertConfig } from "../lib/alerting";
import { HealthCheckResult, ServiceStatus } from "../types";
import {
  decideTokenProbeBudget,
  estimateProbeTokens,
  getProbePolicyConfig,
  isTokenMeteredProbe,
} from "../lib/probe-policy";

const CONSECUTIVE_FAILURES_THRESHOLD = 3;

async function main() {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  PLATFORM STATUS CHECK — ${timestamp}`);
  console.log(`${"═".repeat(60)}`);

  // Alert config info
  const alertConfig = getAlertConfig();
  console.log(`  Slack: ${alertConfig.slackConfigured ? "✅ Configured" : "❌ Not configured (set SLACK_WEBHOOK_URL)"}`);
  console.log(`  Email: ${alertConfig.emailConfigured ? `✅ Configured → ${alertConfig.emailTo}` : "❌ Not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO)"}`);
  console.log(`  Cooldown: ${alertConfig.cooldownMinutes}min\n`);
  const policyConfig = getProbePolicyConfig();
  console.log(
    `  Token probe budget: ${policyConfig.dailyTokenBudget}/day global, ` +
    `${policyConfig.perServiceDailyTokenBudget}/day per-service` +
    `${policyConfig.enforceTokenBudget ? "" : " (enforcement disabled)"}\n`
  );

  const services = getEnabledServices();
  console.log(`  Checking ${services.length} services...\n`);
  const activeIncidentServiceIds = new Set(getActiveIncidents().map((incident) => incident.serviceId));
  let budgetSkipped = 0;
  let cycleEstimatedTokens = 0;

  // Get previous statuses for comparison
  const previousStatuses = new Map<string, ServiceStatus>();
  for (const service of services) {
    const lastCheck = getLatestCheck(service.id);
    if (lastCheck) {
      previousStatuses.set(service.id, lastCheck.status);
    }
  }

  // Run all checks (with built-in retry logic)
  const results: HealthCheckResult[] = [];
  for (const service of services) {
    if (isTokenMeteredProbe(service)) {
      const estimatedTokens = estimateProbeTokens(service);
      const usageTotals = getProbeUsageTotals(service.id);
      const budgetDecision = decideTokenProbeBudget(
        {
          totalEstimatedTokens: usageTotals.totalEstimatedTokens,
          serviceEstimatedTokens: usageTotals.serviceEstimatedTokens,
        },
        service,
        estimatedTokens,
        activeIncidentServiceIds.has(service.id),
        policyConfig
      );

      if (!budgetDecision.allowed) {
        const reason = budgetDecision.reason || "token budget exceeded";
        recordProbeBudgetSkip(service.id, reason);
        budgetSkipped++;
        console.log(
          `  ⏭️ ${service.name.padEnd(40)} ${"skipped".padStart(8)} token budget (${reason})`
        );
        results.push({
          serviceId: service.id,
          timestamp: new Date().toISOString(),
          status: "unknown",
          responseTimeMs: 0,
          statusCode: null,
          errorMessage: `Token-heavy probe skipped: ${reason}`,
        });
        continue;
      }
    }

    try {
      const result = await checkService(service);
      results.push(result);

      // Store in database
      insertHealthCheck(result);

      if (isTokenMeteredProbe(service) && result.statusCode !== null) {
        const estimatedTokens = estimateProbeTokens(service);
        if (estimatedTokens > 0) {
          recordProbeUsage(service.id, estimatedTokens);
          cycleEstimatedTokens += estimatedTokens;
        }
      }

      // Manage auto-incidents (with consecutive failure logic)
      manageIncidents(service.id, service.name, result);

      // Status indicator
      const icon =
        result.status === "operational" ? "✅" :
        result.status === "degraded" ? "⚠️" :
        result.status === "down" ? "🔴" : "❓";

      const retryNote = result.errorMessage?.includes("retries") ? " (retried)" : "";
      console.log(
        `  ${icon} ${service.name.padEnd(40)} ${String(result.responseTimeMs + "ms").padStart(8)} ${result.status}${retryNote}`
      );

      if (result.errorMessage && result.status !== "operational") {
        console.log(`     └─ ${result.errorMessage}`);
      }
    } catch (err) {
      console.error(`  ❌ ${service.name.padEnd(40)} CHECK FAILED: ${err}`);
      results.push({
        serviceId: service.id,
        timestamp: new Date().toISOString(),
        status: "unknown",
        responseTimeMs: 0,
        statusCode: null,
        errorMessage: `Check exception: ${err}`,
      });
    }
  }

  // Process alerts (failures and recoveries)
  console.log("");
  const { failures, recoveries } = await processAlertsForResults(results, previousStatuses);

  // Summary
  const operational = results.filter((r) => r.status === "operational").length;
  const degraded = results.filter((r) => r.status === "degraded").length;
  const down = results.filter((r) => r.status === "down").length;
  const unknown = results.filter((r) => r.status === "unknown").length;
  const duration = Date.now() - startTime;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  SUMMARY: ${operational}✅ ${degraded}⚠️  ${down}🔴 ${unknown}❓  (${duration}ms)`);
  if (cycleEstimatedTokens > 0 || budgetSkipped > 0) {
    console.log(
      `  TOKEN PROBES: +${cycleEstimatedTokens} estimated tokens` +
      `${budgetSkipped > 0 ? `, ${budgetSkipped} skipped by budget` : ""}`
    );
  }
  if (failures.length > 0) console.log(`  NEW FAILURES: ${failures.length}`);
  if (recoveries.length > 0) console.log(`  RECOVERIES: ${recoveries.length}`);
  console.log(`${"─".repeat(60)}\n`);

  // Exit with error code if any critical service is down
  const criticalDown = results.filter((r) => {
    const svc = services.find((s) => s.id === r.serviceId);
    return r.status === "down" && svc?.tags?.includes("critical");
  });

  if (criticalDown.length > 0) {
    console.error(`  ⚠️  ${criticalDown.length} CRITICAL service(s) are DOWN!`);
    process.exit(1);
  }

  process.exit(0);
}

/**
 * Manage incidents with consecutive failure threshold.
 * Only creates an incident after CONSECUTIVE_FAILURES_THRESHOLD consecutive bad checks.
 */
function manageIncidents(serviceId: string, serviceName: string, check: HealthCheckResult) {
  if (getActiveMaintenanceWindow(serviceId)) {
    return;
  }

  const activeIncidents = getActiveIncidents().filter((i) => i.serviceId === serviceId);

  if (check.status === "down" || check.status === "degraded") {
    if (activeIncidents.length === 0) {
      const recentChecks = getRecentChecks(serviceId, CONSECUTIVE_FAILURES_THRESHOLD);

      // Grace period: need enough checks
      if (recentChecks.length < CONSECUTIVE_FAILURES_THRESHOLD) return;

      // All recent checks must be non-operational
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
        console.log(`  🚨 INCIDENT CREATED: ${serviceName} — ${CONSECUTIVE_FAILURES_THRESHOLD} consecutive failures`);
      }
    }
  } else if (check.status === "operational") {
    for (const incident of activeIncidents) {
      updateIncident(incident.id!, { status: "resolved" });
      console.log(`  ✅ INCIDENT RESOLVED: ${serviceName}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error in cron checker:", err);
  process.exit(2);
});
