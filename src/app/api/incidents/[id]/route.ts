import { NextResponse } from "next/server";
import { getServiceById } from "@/lib/services-config";
import {
  getIncidentById,
  getIncidentUpdates,
  getAssignments,
  getServiceOwner,
  getActiveMaintenanceWindow,
  getTeamMembers,
} from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const incidentId = parseInt(id, 10);
    if (Number.isNaN(incidentId)) {
      return NextResponse.json({ error: "Invalid incident id" }, { status: 400 });
    }

    const incident = getIncidentById(incidentId);
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const service = getServiceById(incident.serviceId);
    const updates = getIncidentUpdates(incidentId);
    const assignments = getAssignments({ incidentId });
    const serviceOwner = getServiceOwner(incident.serviceId);
    const activeMaintenance = getActiveMaintenanceWindow(incident.serviceId);
    const teamMembers = getTeamMembers();

    return NextResponse.json({
      incident,
      updates,
      assignments,
      service: service
        ? {
            id: service.id,
            name: service.name,
            group: service.group,
            url: service.url,
            description: service.description,
          }
        : null,
      serviceOwner,
      activeMaintenance,
      teamMembers,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
