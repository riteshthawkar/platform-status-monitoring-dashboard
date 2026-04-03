// ============================================================
// GET /api/services/[id]/trends — Response time trend data
//
// Returns time-bucketed response time and success rate data
// for a single service, suitable for charting.
//
// Query params:
//   period = "1h" | "6h" | "24h" | "7d" | "30d"  (default "24h")
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getServiceById } from "@/lib/services-config";
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
 * Returns the SQLite datetime offset for the requested period.
 *
 * Bucketing strategy (handled by getBucketExpression):
 *   1h / 6h  -> 5-minute buckets
 *   24h      -> 30-minute buckets
 *   7d       -> 6-hour buckets
 *   30d      -> 1-day buckets
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
 *
 * SQLite doesn't have DATE_TRUNC, so we use strftime arithmetic:
 *   5-min:  floor minutes to nearest 5  ->  (cast(strftime('%M', timestamp) as integer) / 5) * 5
 *   30-min: floor minutes to nearest 30
 *   6-hour: floor hours to nearest 6
 *   1-day:  just use date()
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const service = getServiceById(id);

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const periodParam = request.nextUrl.searchParams.get("period") || "24h";
  const period: Period = VALID_PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : "24h";

  const offset = getOffset(period);
  const bucketExpr = getBucketExpression(period);

  try {
    const db = getDb();

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
         WHERE service_id = ?
           AND timestamp >= datetime('now', ?)
         GROUP BY bucket
         ORDER BY bucket ASC`
      )
      .all(id, offset) as Array<{
      bucket: string;
      avgResponseTime: number;
      minResponseTime: number;
      maxResponseTime: number;
      successRate: number;
      checkCount: number;
    }>;

    const dataPoints: TrendDataPoint[] = rows.map((row) => ({
      timestamp: row.bucket,
      avgResponseTime: row.avgResponseTime ?? 0,
      minResponseTime: row.minResponseTime ?? 0,
      maxResponseTime: row.maxResponseTime ?? 0,
      successRate: row.successRate ?? 100,
      checkCount: row.checkCount,
    }));

    return NextResponse.json({
      serviceId: id,
      period,
      dataPoints,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch trends: ${String(error)}` },
      { status: 500 }
    );
  }
}
