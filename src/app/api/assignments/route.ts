import { NextRequest, NextResponse } from "next/server";
import {
  createAssignment,
  getAssignments,
  updateAssignment,
  deleteAssignment,
  getTeamMemberById,
} from "@/lib/database";
import { sendAssignmentEmail } from "@/lib/alerting";
import { withAuth } from "@/lib/auth";
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

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, id, incidentId, assigneeId, notes, deadline, status } = body;

    if (action === "delete" && id) {
      deleteAssignment(id);
      return NextResponse.json({ success: true });
    }

    if (action === "update" && id) {
      // Get the current assignment before updating to find the assignee
      const currentAssignments = getAssignments({});
      const current = currentAssignments.find((a) => a.id === id);

      updateAssignment(id, { status, notes, deadline });

      // Send status update email if status changed
      if (status && current && status !== current.status) {
        const member = current.assigneeId ? getTeamMemberById(current.assigneeId) : null;
        if (member) {
          sendAssignmentEmail({
            toEmail: member.email,
            toName: member.name,
            incidentId: current.incidentId,
            assignmentId: id,
            notes: notes || current.notes || null,
            deadline: current.deadline || null,
            type: "status_update",
            newStatus: status,
          }).catch((err) => console.error("[Assignment] Status update email failed:", err));
        }
      }

      return NextResponse.json({ success: true });
    }

    // Send manual reminder
    if (action === "remind" && id) {
      const currentAssignments = getAssignments({});
      const current = currentAssignments.find((a) => a.id === id);
      if (!current) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }

      const member = current.assigneeId ? getTeamMemberById(current.assigneeId) : null;
      if (!member) {
        return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
      }

      const sent = await sendAssignmentEmail({
        toEmail: member.email,
        toName: member.name,
        incidentId: current.incidentId,
        assignmentId: id,
        notes: current.notes || null,
        deadline: current.deadline || null,
        type: "deadline_reminder",
      });

      return NextResponse.json({ success: sent, emailSent: sent });
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
});
