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
  getIncidentUpdates,
  getIncidentById,
  acknowledgeIncident,
  assignIncidentOwner,
  getTeamMemberById,
} from "@/lib/database";
import { withAuth } from "@/lib/auth";
import { eventBus } from "@/lib/event-bus";

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

    if (body.type === "acknowledge") {
      const incidentId = parseInt(String(body.incidentId), 10);
      const memberId = parseInt(String(body.memberId), 10);

      if (Number.isNaN(incidentId) || Number.isNaN(memberId)) {
        return NextResponse.json({ error: "incidentId and memberId are required" }, { status: 400 });
      }

      const incident = getIncidentById(incidentId);
      if (!incident) {
        return NextResponse.json({ error: "Incident not found" }, { status: 404 });
      }
      if (incident.status === "resolved") {
        return NextResponse.json({ error: "Resolved incidents cannot be acknowledged" }, { status: 400 });
      }

      const member = getTeamMemberById(memberId);
      if (!member) {
        return NextResponse.json({ error: "Team member not found" }, { status: 404 });
      }

      acknowledgeIncident(incidentId, memberId);
      addIncidentUpdate({
        incidentId,
        message: body.message || `Incident acknowledged by ${member.name}.`,
        status: incident.status,
      });
      eventBus.broadcastDashboardRefresh();
      return NextResponse.json({ success: true });
    }

    if (body.type === "assign-owner") {
      const incidentId = parseInt(String(body.incidentId), 10);
      const memberId = body.memberId === null || body.memberId === "" || body.memberId === undefined
        ? null
        : parseInt(String(body.memberId), 10);

      if (Number.isNaN(incidentId)) {
        return NextResponse.json({ error: "incidentId is required" }, { status: 400 });
      }

      const incident = getIncidentById(incidentId);
      if (!incident) {
        return NextResponse.json({ error: "Incident not found" }, { status: 404 });
      }

      let memberName: string | null = null;
      if (memberId !== null) {
        if (Number.isNaN(memberId)) {
          return NextResponse.json({ error: "Invalid memberId" }, { status: 400 });
        }
        const member = getTeamMemberById(memberId);
        if (!member) {
          return NextResponse.json({ error: "Team member not found" }, { status: 404 });
        }
        memberName = member.name;
      }

      assignIncidentOwner(incidentId, memberId);
      addIncidentUpdate({
        incidentId,
        message: memberId !== null
          ? `On-call owner assigned to ${memberName}.`
          : "On-call owner cleared.",
        status: incident.status,
      });
      eventBus.broadcastDashboardRefresh();
      return NextResponse.json({ success: true });
    }

    if (body.type === "update") {
      // Add an update to an existing incident
      addIncidentUpdate({
        incidentId: body.incidentId,
        message: body.message,
        status: body.status,
      });
      eventBus.broadcastDashboardRefresh();
      return NextResponse.json({ success: true });
    }

    if (body.type === "resolve") {
      addIncidentUpdate({
        incidentId: body.incidentId,
        message: body.message || "Incident resolved.",
        status: "resolved",
      });
      eventBus.broadcastDashboardRefresh();
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

    eventBus.broadcastDashboardRefresh();
    return NextResponse.json({ success: true, incidentId: id });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
});
