// ============================================================
// POST /api/health-check - Trigger health checks for all services
// GET  /api/health-check - Get latest status for all services
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { checkAllServices } from "@/lib/health-checker";
import { eventBus } from "@/lib/event-bus";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const POST = withAuth(async function POST() {
  try {
    const results = await checkAllServices();
    eventBus.broadcastDashboardRefresh();

    return NextResponse.json({
      success: true,
      checked: results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
});

export async function GET(request: NextRequest) {
  try {
    // Use cached dashboard payload — eliminates 153+ SQLite queries per request
    const cached = eventBus.getDashboardPayload();
    return NextResponse.json({
      summary: cached.summary,
      services: cached.services,
      activeIncidents: cached.activeIncidents,
      activeMaintenanceWindows: cached.activeMaintenanceWindows,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
