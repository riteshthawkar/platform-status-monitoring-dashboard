// ============================================================
// POST /api/health-check - Trigger health checks for all services
// GET  /api/health-check - Get latest status for all services
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { checkAllServices } from "@/lib/health-checker";
import { getEnabledServices } from "@/lib/services-config";
import {
  getLatestCheck,
  getRecentChecks,
  getUptimePercent,
  getActiveIncidents,
} from "@/lib/database";
import { DashboardSummary, ServiceWithStatus, ServiceStatus } from "@/types";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const results = await checkAllServices();
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
}

export async function GET(request: NextRequest) {
  try {
    const services = getEnabledServices();
    const activeIncidents = getActiveIncidents();

    const servicesWithStatus: ServiceWithStatus[] = services.map((service) => {
      const latestCheck = getLatestCheck(service.id);
      const recentChecks = getRecentChecks(service.id, 50);

      // Check if service is in maintenance (has an active maintenance incident)
      const hasMaintenanceIncident = activeIncidents.some(
        (i) => i.serviceId === service.id && i.status === "monitoring"
      );

      return {
        ...service,
        currentStatus: hasMaintenanceIncident
          ? "maintenance"
          : latestCheck?.status ?? "unknown",
        lastChecked: latestCheck?.timestamp ?? null,
        lastResponseTime: latestCheck?.responseTimeMs ?? null,
        uptimePercent24h: getUptimePercent(service.id, 24),
        uptimePercent7d: getUptimePercent(service.id, 168),
        uptimePercent30d: getUptimePercent(service.id, 720),
        recentChecks: recentChecks,
      };
    });

    // Summary
    const statusCounts = servicesWithStatus.reduce(
      (acc, s) => {
        acc[s.currentStatus] = (acc[s.currentStatus] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    let overallStatus: ServiceStatus = "operational";
    if (statusCounts["down"] > 0) overallStatus = "down";
    else if (statusCounts["degraded"] > 0) overallStatus = "degraded";
    else if (statusCounts["maintenance"] > 0) overallStatus = "maintenance";

    const summary: DashboardSummary = {
      totalServices: services.length,
      operational: statusCounts["operational"] || 0,
      degraded: statusCounts["degraded"] || 0,
      down: statusCounts["down"] || 0,
      maintenance: statusCounts["maintenance"] || 0,
      overallStatus,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json({
      summary,
      services: servicesWithStatus,
      activeIncidents,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
