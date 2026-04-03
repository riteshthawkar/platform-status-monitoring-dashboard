import { NextRequest, NextResponse } from "next/server";
import {
  createAssignment,
  getAssignments,
  updateAssignment,
  deleteAssignment,
  getTeamMemberById,
} from "@/lib/database";
import { sendAssignmentEmail } from "@/lib/alerting";
import { AssignmentStatus } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assigneeId = searchParams.get("assigneeId");
    const incidentId = searchParams.get("incidentId");
    const status = searchParams.get("status") as AssignmentStatus | null;

    const assignments = getAssignments({
      assigneeId: assigneeId ? parseInt(assigneeId) : undefined,
      incidentId: incidentId ? parseInt(incidentId) : undefined,
      status: status || undefined,
    });

    return NextResponse.json({ assignments });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, id, incidentId, assigneeId, notes, deadline, status } = body;

    if (action === "delete" && id) {
      deleteAssignment(id);
      return NextResponse.json({ success: true });
    }

    if (action === "update" && id) {
      updateAssignment(id, { status, notes, deadline });
      return NextResponse.json({ success: true });
    }

    // Create new assignment
    if (!incidentId || !assigneeId) {
      return NextResponse.json(
        { error: "incidentId and assigneeId are required" },
        { status: 400 }
      );
    }

    const newId = createAssignment({
      incidentId,
      assigneeId,
      notes: notes || undefined,
      deadline: deadline || undefined,
    });

    // Send assignment email notification
    const member = getTeamMemberById(assigneeId);
    if (member) {
      // Fire and forget — don't block the response
      sendAssignmentEmail({
        toEmail: member.email,
        toName: member.name,
        incidentId,
        assignmentId: newId,
        notes: notes || null,
        deadline: deadline || null,
        type: "assigned",
      }).catch((err) => console.error("[Assignment] Email failed:", err));
    }

    return NextResponse.json({ success: true, id: newId });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
