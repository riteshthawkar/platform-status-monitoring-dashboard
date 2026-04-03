import { NextRequest, NextResponse } from "next/server";
import {
  createTeamMember,
  getTeamMembers,
  updateTeamMember,
  deleteTeamMember,
} from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const members = getTeamMembers();
    return NextResponse.json({ members });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, role, action, id } = body;

    if (action === "delete" && id) {
      deleteTeamMember(id);
      return NextResponse.json({ success: true });
    }

    if (action === "update" && id) {
      updateTeamMember(id, { name, email, role });
      return NextResponse.json({ success: true });
    }

    // Create new member
    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    const newId = createTeamMember({
      name,
      email,
      role: role || "engineer",
    });

    return NextResponse.json({ success: true, id: newId });
  } catch (error) {
    const msg = String(error);
    if (msg.includes("UNIQUE constraint")) {
      return NextResponse.json(
        { error: "A team member with this email already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
