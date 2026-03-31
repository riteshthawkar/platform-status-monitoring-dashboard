// ============================================================
// GET /api/health-status — Lightweight health check for Render
//
// Render pings this endpoint to verify the service is alive.
// Returns 200 OK if the server and database are accessible.
// This is separate from /api/health-check which runs full
// service checks and is more expensive.
// ============================================================

import { NextResponse } from "next/server";
import { getDb } from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Verify database is accessible
    const db = getDb();
    const result = db.prepare("SELECT COUNT(*) as count FROM health_checks").get() as {
      count: number;
    };

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
      totalChecks: result.count,
      uptime: process.uptime(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: String(error),
      },
      { status: 503 }
    );
  }
}
