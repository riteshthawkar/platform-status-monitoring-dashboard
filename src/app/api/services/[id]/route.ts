// ============================================================
// GET /api/services/[id] - Get detailed status for a single service
// POST /api/services/[id] - Trigger a health check for a single service
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getServiceById } from "@/lib/services-config";
import { checkServiceAndStore } from "@/lib/health-checker";
import { eventBus } from "@/lib/event-bus";
import { withAuth } from "@/lib/auth";
import {
  getLatestCheck,
  getRecentChecks,
  getUptimePercent,
  getDailyUptimeBars,
} from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const service = getServiceById(id);

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const latestCheck = getLatestCheck(id);
  const recentChecks = getRecentChecks(id, 100);
  const uptimeBars = getDailyUptimeBars(id, 90);

  return NextResponse.json({
    service: {
      ...service,
      currentStatus: latestCheck?.status ?? "unknown",
      lastChecked: latestCheck?.timestamp ?? null,
      lastResponseTime: latestCheck?.responseTimeMs ?? null,
      uptimePercent24h: getUptimePercent(id, 24),
      uptimePercent7d: getUptimePercent(id, 168),
      uptimePercent30d: getUptimePercent(id, 720),
    },
    recentChecks,
    uptimeBars,
  });
}

export const POST = withAuth(async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const service = getServiceById(id);

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const result = await checkServiceAndStore(service);
  eventBus.broadcastDashboardRefresh();

  return NextResponse.json({
    success: true,
    result,
  });
});
