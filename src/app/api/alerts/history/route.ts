// ============================================================
// GET /api/alerts/history — Get alert history and statistics
// Query params: limit (default 50), serviceId (optional filter)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAlertHistory, getAlertStats, getProbeUsageByService, getProbeUsageSummary } from "@/lib/database";
import { getAlertConfig } from "@/lib/alerting";
import { getProbePolicyConfig } from "@/lib/probe-policy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const serviceId = searchParams.get("serviceId") || undefined;

    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 500) : 50;

    const alerts = getAlertHistory(limit, serviceId);
    const stats = getAlertStats();
    const config = getAlertConfig();
    const probeUsageSummary = getProbeUsageSummary();
    const probeUsageByService = getProbeUsageByService(undefined, 100);
    const probePolicy = getProbePolicyConfig();

    return NextResponse.json({
      alerts,
      stats: {
        total24h: stats.total24h,
        totalFailures24h: stats.totalFailures24h,
        totalRecoveries24h: stats.totalRecoveries24h,
        totalReminders24h: stats.totalReminders24h,
        totalEscalations24h: stats.totalEscalations24h,
        byChannel: stats.byChannel,
      },
      config,
      probeBudget: {
        policy: probePolicy,
        usage: probeUsageSummary,
        services: probeUsageByService,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch alert history: ${error}` },
      { status: 500 }
    );
  }
}
