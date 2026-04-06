import { NextRequest, NextResponse } from "next/server";
import { getEnabledServices, getServiceById } from "@/lib/services-config";
import { getAllServiceOwners, getTeamMemberById, setServiceOwner } from "@/lib/database";
import { withAuth } from "@/lib/auth";
import { eventBus } from "@/lib/event-bus";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const owners = new Map(getAllServiceOwners().map((owner) => [owner.serviceId, owner]));
    const services = getEnabledServices()
      .map((service) => ({
        serviceId: service.id,
        serviceName: service.name,
        serviceGroup: service.group,
        description: service.description,
        owner: owners.get(service.id) ?? null,
      }))
      .sort((a, b) => a.serviceGroup.localeCompare(b.serviceGroup) || a.serviceName.localeCompare(b.serviceName));

    return NextResponse.json({ services });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const serviceId = String(body.serviceId || "");
    const memberId = body.memberId === null || body.memberId === "" || body.memberId === undefined
      ? null
      : parseInt(String(body.memberId), 10);

    if (!serviceId) {
      return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
    }

    if (!getServiceById(serviceId)) {
      return NextResponse.json({ error: "Unknown service" }, { status: 404 });
    }

    if (memberId !== null && !getTeamMemberById(memberId)) {
      return NextResponse.json({ error: "Unknown team member" }, { status: 404 });
    }

    setServiceOwner(serviceId, Number.isNaN(memberId as number) ? null : memberId);
    eventBus.broadcastDashboardRefresh();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
});
