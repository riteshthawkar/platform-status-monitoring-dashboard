// ============================================================
// GET /api/trends — Aggregate response time trends across all services
//
// Returns time-bucketed response time and success rate data
// aggregated across all (or filtered) services, plus per-group
// breakdowns.
//
// Query params:
//   period = "1h" | "6h" | "24h" | "7d" | "30d"  (default "24h")
//   group  = service group ID to filter by (optional)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getEnabledServices, getGroupById } from "@/lib/services-config";
import { getDb } from "@/lib/database";

export const dynamic = "force-dynamic";

type Period = "1h" | "6h" | "24h" | "7d" | "30d";

interface TrendDataPoint {
  timestamp: string;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  successRate: number;
  checkCount: number;
}

/**
 * Returns the datetime offset for the requested period.
 */
function getOffset(period: Period): string {
  switch (period) {
    case "1h":
      return "-1 hours";
    case "6h":
      return "-6 hours";
    case "24h":
      return "-24 hours";
    case "7d":
      return "-7 days";
    case "30d":
      return "-30 days";
    default:
      return "-24 hours";
  }
}

/**
 * Build a SQL expression that floors the timestamp to the correct bucket size.
 */
function getBucketExpression(period: Period): string {
  switch (period) {
    case "1h":
    case "6h":
      // 5-minute buckets
      return `strftime('%Y-%m-%d %H:', timestamp) || printf('%02d', (cast(strftime('%M', timestamp) as integer) / 5) * 5)`;
    case "24h":
      // 30-minute buckets
      return `strftime('%Y-%m-%d %H:', timestamp) || printf('%02d', (cast(strftime('%M', timestamp) as integer) / 30) * 30)`;
    case "7d":
      // 6-hour buckets
      return `strftime('%Y-%m-%d ', timestamp) || printf('%02d', (cast(strftime('%H', timestamp) as integer) / 6) * 6) || ':00'`;
    case "30d":
      // 1-day buckets
      return `strftime('%Y-%m-%d', timestamp)`;
    default:
      return `strftime('%Y-%m-%d %H:', timestamp) || printf('%02d', (cast(strftime('%M', timestamp) as integer) / 30) * 30)`;
  }
}

const VALID_PERIODS: Period[] = ["1h", "6h", "24h", "7d", "30d"];

/**
 * Query trend data for a set of service IDs.
 */
function queryTrends(
  serviceIds: string[],
  period: Period
): TrendDataPoint[] {
  if (serviceIds.length === 0) return [];

  const db = getDb();
  const offset = getOffset(period);
  const bucketExpr = getBucketExpression(period);

  const placeholders = serviceIds.map(() => "?").join(", ");

  const rows = db
    .prepare(
      `SELECT
         ${bucketExpr} as bucket,
         ROUND(AVG(response_time_ms), 2) as avgResponseTime,
         ROUND(MIN(response_time_ms), 2) as minResponseTime,
         ROUND(MAX(response_time_ms), 2) as maxResponseTime,
         ROUND(
           CAST(SUM(CASE WHEN status = 'operational' THEN 1 ELSE 0 END) AS REAL)
           / COUNT(*) * 100,
           2
         ) as successRate,
         COUNT(*) as checkCount
       FROM health_checks
       WHERE service_id IN (${placeholders})
         AND timestamp >= datetime('now', ?)
       GROUP BY bucket
       ORDER BY bucket ASC`
    )
    .all(...serviceIds, offset) as Array<{
    bucket: string;
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    successRate: number;
    checkCount: number;
  }>;

  return rows.map((row) => ({
    timestamp: row.bucket,
    avgResponseTime: row.avgResponseTime ?? 0,
    minResponseTime: row.minResponseTime ?? 0,
    maxResponseTime: row.maxResponseTime ?? 0,
    successRate: row.successRate ?? 100,
    checkCount: row.checkCount,
  }));
}

export async function GET(request: NextRequest) {
  const periodParam = request.nextUrl.searchParams.get("period") || "24h";
  const groupFilter = request.nextUrl.searchParams.get("group") || null;

  const period: Period = VALID_PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : "24h";

  try {
    const enabledServices = getEnabledServices();

    // If a group filter is provided, validate it
    if (groupFilter && !getGroupById(groupFilter)) {
      return NextResponse.json(
        { error: `Unknown group: ${groupFilter}` },
        { status: 400 }
      );
    }

    // Determine which services to include in the aggregate
    const filteredServices = groupFilter
      ? enabledServices.filter((s) => s.group === groupFilter)
      : enabledServices;

    const allServiceIds = filteredServices.map((s) => s.id);

    // Aggregate data points across all (filtered) services
    const dataPoints = queryTrends(allServiceIds, period);

    // Build per-group breakdowns
    const byGroup: Record<string, TrendDataPoint[]> = {};

    // Determine which groups to break down
    const groupsToInclude = groupFilter
      ? [groupFilter]
      : [...new Set(enabledServices.map((s) => s.group))];

    for (const groupId of groupsToInclude) {
      const groupServiceIds = enabledServices
        .filter((s) => s.group === groupId)
        .map((s) => s.id);

      if (groupServiceIds.length > 0) {
        byGroup[groupId] = queryTrends(groupServiceIds, period);
      }
    }

    return NextResponse.json({
      period,
      ...(groupFilter ? { group: groupFilter } : {}),
      dataPoints,
      byGroup,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch trends: ${String(error)}` },
      { status: 500 }
    );
  }
}
