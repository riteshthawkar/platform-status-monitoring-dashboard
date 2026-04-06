import { NextRequest, NextResponse } from "next/server";
import { getServiceById } from "@/lib/services-config";
import { cancelMaintenanceWindow, createMaintenanceWindow, getMaintenanceWindows } from "@/lib/database";
import { withAuth } from "@/lib/auth";
import { eventBus } from "@/lib/event-bus";

export const dynamic = "force-dynamic";

function enrichWindows() {
  return getMaintenanceWindows({ includeCancelled: false, limit: 100 })
    .filter((window) => window.isActive || window.isUpcoming)
    .map((window) => {
      const service = getServiceById(window.serviceId);
      return {
        ...window,
        serviceName: service?.name || window.serviceId,
        serviceGroup: service?.group || "unknown",
      };
    });
}

export async function GET() {
  try {
    return NextResponse.json({ windows: enrichWindows() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "cancel" && body.id) {
      cancelMaintenanceWindow(parseInt(String(body.id), 10));
      eventBus.broadcastDashboardRefresh();
      return NextResponse.json({ success: true, windows: enrichWindows() });
    }

    const serviceId = String(body.serviceId || "");
    const title = String(body.title || "").trim();
    const startsAt = String(body.startsAt || "");
    const endsAt = String(body.endsAt || "");

    if (!serviceId || !title || !startsAt || !endsAt) {
      return NextResponse.json(
        { error: "serviceId, title, startsAt, and endsAt are required" },
        { status: 400 }
      );
    }

    if (!getServiceById(serviceId)) {
      return NextResponse.json({ error: "Unknown service" }, { status: 404 });
    }

    const startMs = new Date(startsAt).getTime();
    const endMs = new Date(endsAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return NextResponse.json({ error: "Invalid maintenance time window" }, { status: 400 });
    }

    const id = createMaintenanceWindow({
      serviceId,
      title,
      notes: body.notes ? String(body.notes) : undefined,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
    });

    eventBus.broadcastDashboardRefresh();
    return NextResponse.json({ success: true, id, windows: enrichWindows() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
});
