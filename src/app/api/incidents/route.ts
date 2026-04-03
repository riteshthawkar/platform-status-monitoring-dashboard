// ============================================================
// GET  /api/incidents - List all incidents
// POST /api/incidents - Create a new incident
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  getRecentIncidents,
  getActiveIncidents,
  createIncident,
  addIncidentUpdate,
  updateIncident,
  getIncidentUpdates,
} from "@/lib/database";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "true";
  const incidentId = searchParams.get("id");

  if (incidentId) {
    const updates = getIncidentUpdates(parseInt(incidentId));
    return NextResponse.json({ updates });
  }

  const incidents = activeOnly ? getActiveIncidents() : getRecentIncidents(50);
  return NextResponse.json({ incidents });
}

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.type === "update") {
      // Add an update to an existing incident
      addIncidentUpdate({
        incidentId: body.incidentId,
        message: body.message,
        status: body.status,
      });
      return NextResponse.json({ success: true });
    }

    if (body.type === "resolve") {
      updateIncident(body.incidentId, { status: "resolved" });
      return NextResponse.json({ success: true });
    }

    // Create new incident
    const id = createIncident({
      serviceId: body.serviceId,
      title: body.title,
      description: body.description || "",
      status: body.status || "investigating",
      severity: body.severity || "minor",
    });

    return NextResponse.json({ success: true, incidentId: id });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
});
