// ============================================================
// GET /api/alerts/history — Get alert history and statistics
// Query params: limit (default 50), serviceId (optional filter)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAlertHistory, getAlertStats } from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const serviceId = searchParams.get("serviceId") || undefined;

    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 500) : 50;

    const alerts = getAlertHistory(limit, serviceId);
    const stats = getAlertStats();

    return NextResponse.json({
      alerts,
      stats: {
        total24h: stats.total24h,
        totalFailures24h: stats.totalFailures24h,
        totalRecoveries24h: stats.totalRecoveries24h,
        byChannel: stats.byChannel,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch alert history: ${error}` },
      { status: 500 }
    );
  }
}
