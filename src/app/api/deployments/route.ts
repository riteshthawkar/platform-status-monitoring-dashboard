import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { eventBus } from "@/lib/event-bus";
import { createServiceDeployment, getLatestDeployments, getServiceDeployments } from "@/lib/database";
import { getServiceById } from "@/lib/services-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const serviceId = request.nextUrl.searchParams.get("serviceId") || undefined;
    const limit = request.nextUrl.searchParams.get("limit");
    const recent = getServiceDeployments({
      serviceId,
      limit: limit ? Math.max(1, Math.min(100, parseInt(limit, 10))) : 20,
    }).map(annotateDeployment);

    const latestDeployments = getLatestDeployments().map(annotateDeployment);

    return NextResponse.json({
      deployments: recent,
      latestDeployments,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serviceId, environment, version, commitSha, deployedBy, deployedAt, notes } = body ?? {};

    if (!serviceId || !version || !deployedAt) {
      return NextResponse.json(
        { error: "serviceId, version, and deployedAt are required" },
        { status: 400 }
      );
    }

    const service = getServiceById(serviceId);
    if (!service) {
      return NextResponse.json({ error: "Unknown serviceId" }, { status: 404 });
    }

    const id = createServiceDeployment({
      serviceId,
      environment: typeof environment === "string" && environment.trim() ? environment.trim() : "production",
      version: String(version).trim(),
      commitSha: typeof commitSha === "string" && commitSha.trim() ? commitSha.trim() : null,
      deployedBy: typeof deployedBy === "string" && deployedBy.trim() ? deployedBy.trim() : null,
      deployedAt: String(deployedAt),
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    });

    eventBus.broadcastDashboardRefresh();
    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
});

function annotateDeployment<T extends { serviceId: string }>(deployment: T) {
  const service = getServiceById(deployment.serviceId);
  return {
    ...deployment,
    serviceName: service?.name || deployment.serviceId,
    serviceGroup: service?.group || "unknown",
  };
}
