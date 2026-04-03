// ============================================================
// GET /api/reports — Export uptime report (JSON or CSV)
//
// Query params:
//   format = "json" | "csv"       (default: "json")
//   period = "24h" | "7d" | "30d" | "90d"  (default: "30d")
//   group  = optional service group filter (e.g. "mbzuai")
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getEnabledServices, serviceGroups } from "@/lib/services-config";
import { getDb } from "@/lib/database";

export const dynamic = "force-dynamic";

// ─── Period → hours mapping ──────────────────────────────────

const PERIOD_HOURS: Record<string, number> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  "90d": 2160,
};

// ─── Per-service report row ──────────────────────────────────

interface ServiceReportRow {
  serviceGroup: string;
  serviceGroupId: string;
  serviceName: string;
  serviceId: string;
  uptimePercent: number;
  avgResponseTimeMs: number;
  totalChecks: number;
  failedChecks: number;
  incidents: number;
  longestDowntimeMinutes: number;
  currentStatus: string;
}

// ─── Database helpers (raw queries for report-specific aggregation) ──

function getServiceStats(serviceId: string, hoursAgo: number) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COUNT(*) as totalChecks,
         SUM(CASE WHEN status != 'operational' THEN 1 ELSE 0 END) as failedChecks,
         AVG(response_time_ms) as avgResponseTime
       FROM health_checks
       WHERE service_id = ?
         AND timestamp >= datetime('now', ? || ' hours')`
    )
    .get(serviceId, -hoursAgo) as {
    totalChecks: number;
    failedChecks: number;
    avgResponseTime: number | null;
  } | undefined;

  return {
    totalChecks: row?.totalChecks ?? 0,
    failedChecks: row?.failedChecks ?? 0,
    avgResponseTime: row?.avgResponseTime ?? 0,
  };
}

function getIncidentCount(serviceId: string, hoursAgo: number): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM incidents
       WHERE service_id = ?
         AND created_at >= datetime('now', ? || ' hours')`
    )
    .get(serviceId, -hoursAgo) as { cnt: number } | undefined;

  return row?.cnt ?? 0;
}

function getLongestDowntimeMinutes(serviceId: string, hoursAgo: number): number {
  const db = getDb();

  // Get all checks in the period ordered chronologically
  const checks = db
    .prepare(
      `SELECT timestamp, status
       FROM health_checks
       WHERE service_id = ?
         AND timestamp >= datetime('now', ? || ' hours')
       ORDER BY timestamp ASC`
    )
    .all(serviceId, -hoursAgo) as Array<{ timestamp: string; status: string }>;

  if (checks.length === 0) return 0;

  let maxDowntimeMs = 0;
  let downtimeStart: number | null = null;

  for (const check of checks) {
    const ts = new Date(check.timestamp + "Z").getTime();
    if (check.status !== "operational") {
      if (downtimeStart === null) {
        downtimeStart = ts;
      }
    } else {
      if (downtimeStart !== null) {
        const duration = ts - downtimeStart;
        if (duration > maxDowntimeMs) maxDowntimeMs = duration;
        downtimeStart = null;
      }
    }
  }

  // If still in downtime at the end of the window, close it with the last check time
  if (downtimeStart !== null) {
    const lastTs = new Date(checks[checks.length - 1].timestamp + "Z").getTime();
    const duration = lastTs - downtimeStart;
    if (duration > maxDowntimeMs) maxDowntimeMs = duration;
  }

  return Math.round(maxDowntimeMs / 60000);
}

function getLatestStatus(serviceId: string): string {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT status FROM health_checks
       WHERE service_id = ?
       ORDER BY timestamp DESC LIMIT 1`
    )
    .get(serviceId) as { status: string } | undefined;
  return row?.status ?? "unknown";
}

// ─── GET handler ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate params
    const format = searchParams.get("format") || "json";
    if (format !== "json" && format !== "csv") {
      return NextResponse.json(
        { success: false, error: 'Invalid format. Use "json" or "csv".' },
        { status: 400 }
      );
    }

    const period = searchParams.get("period") || "30d";
    const hoursAgo = PERIOD_HOURS[period];
    if (!hoursAgo) {
      return NextResponse.json(
        { success: false, error: 'Invalid period. Use "24h", "7d", "30d", or "90d".' },
        { status: 400 }
      );
    }

    const groupFilter = searchParams.get("group") || undefined;

    // Build group name lookup
    const groupNameMap: Record<string, string> = {};
    for (const g of serviceGroups) {
      groupNameMap[g.id] = g.name;
    }

    // Collect services
    let services = getEnabledServices();
    if (groupFilter) {
      services = services.filter((s) => s.group === groupFilter);
      if (services.length === 0) {
        return NextResponse.json(
          { success: false, error: `No enabled services found for group "${groupFilter}".` },
          { status: 404 }
        );
      }
    }

    // Build report rows
    const rows: ServiceReportRow[] = services.map((service) => {
      const stats = getServiceStats(service.id, hoursAgo);
      const uptimePercent =
        stats.totalChecks > 0
          ? Math.round(((stats.totalChecks - stats.failedChecks) / stats.totalChecks) * 10000) / 100
          : 100;

      return {
        serviceGroup: groupNameMap[service.group] || service.group,
        serviceGroupId: service.group,
        serviceName: service.name,
        serviceId: service.id,
        uptimePercent,
        avgResponseTimeMs: Math.round((stats.avgResponseTime ?? 0) * 100) / 100,
        totalChecks: stats.totalChecks,
        failedChecks: stats.failedChecks,
        incidents: getIncidentCount(service.id, hoursAgo),
        longestDowntimeMinutes: getLongestDowntimeMinutes(service.id, hoursAgo),
        currentStatus: getLatestStatus(service.id),
      };
    });

    // Sort: by group name ascending, then by uptime ascending (worst first)
    rows.sort((a, b) => {
      const groupCmp = a.serviceGroup.localeCompare(b.serviceGroup);
      if (groupCmp !== 0) return groupCmp;
      return a.uptimePercent - b.uptimePercent;
    });

    // ─── JSON response ─────────────────────────────────────
    if (format === "json") {
      return NextResponse.json({
        report: {
          generatedAt: new Date().toISOString(),
          period,
          periodHours: hoursAgo,
          groupFilter: groupFilter ?? null,
          totalServices: rows.length,
        },
        services: rows,
      });
    }

    // ─── CSV response ──────────────────────────────────────
    const csvHeader =
      "Service Group,Service Name,Uptime %,Avg Response Time (ms),Total Checks,Failed Checks,Incidents,Longest Downtime (min),Status";

    const csvRows = rows.map((r) => {
      // Escape fields that could contain commas
      const group = `"${r.serviceGroup.replace(/"/g, '""')}"`;
      const name = `"${r.serviceName.replace(/"/g, '""')}"`;
      return [
        group,
        name,
        r.uptimePercent.toFixed(2),
        r.avgResponseTimeMs.toFixed(2),
        r.totalChecks,
        r.failedChecks,
        r.incidents,
        r.longestDowntimeMinutes,
        r.currentStatus,
      ].join(",");
    });

    const csvContent = [csvHeader, ...csvRows].join("\n");
    const dateStr = new Date().toISOString().split("T")[0];

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="uptime-report-${dateStr}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
