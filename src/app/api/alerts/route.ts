// ============================================================
// GET /api/alerts — Get alert configuration status
// POST /api/alerts — Test alert (Slack + Email) or verify email
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAlertConfig, sendAlert, verifyEmailConfig, isEmailConfigured } from "@/lib/alerting";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getAlertConfig();
  return NextResponse.json(config);
}

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Test alert (sends via all configured channels: console + Slack + email)
    if (body.type === "test") {
      await sendAlert(
        {
          serviceId: "test",
          timestamp: new Date().toISOString(),
          status: "down",
          responseTimeMs: 0,
          statusCode: null,
          errorMessage: "This is a test alert from Platform Status Dashboard",
        },
        "failure"
      );

      const config = getAlertConfig();
      const channels: string[] = ["console"];
      if (config.slackConfigured) channels.push("slack");
      if (config.emailConfigured) channels.push("email");

      return NextResponse.json({
        success: true,
        message: `Test alert sent via: ${channels.join(", ")}`,
        channels,
      });
    }

    // Verify email configuration (tests SMTP connection without sending)
    if (body.type === "verify-email") {
      if (!isEmailConfigured()) {
        return NextResponse.json({
          success: false,
          error: "Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and ALERT_EMAIL_TO in .env.local",
        });
      }

      const result = await verifyEmailConfig();
      return NextResponse.json(result);
    }

    // Test email only
    if (body.type === "test-email") {
      if (!isEmailConfigured()) {
        return NextResponse.json({
          success: false,
          error: "Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and ALERT_EMAIL_TO in .env.local",
        });
      }

      await sendAlert(
        {
          serviceId: "test-email",
          timestamp: new Date().toISOString(),
          status: "down",
          responseTimeMs: 999,
          statusCode: 503,
          errorMessage: "This is a TEST email alert. If you received this, email alerting is working correctly!",
        },
        "failure"
      );

      return NextResponse.json({
        success: true,
        message: `Test email sent to: ${getAlertConfig().emailTo}`,
      });
    }

    // Test recovery email
    if (body.type === "test-recovery") {
      await sendAlert(
        {
          serviceId: "test-recovery",
          timestamp: new Date().toISOString(),
          status: "operational",
          responseTimeMs: 150,
          statusCode: 200,
          errorMessage: null,
        },
        "recovery"
      );

      const config = getAlertConfig();
      const channels: string[] = ["console"];
      if (config.slackConfigured) channels.push("slack");
      if (config.emailConfigured) channels.push("email");

      return NextResponse.json({
        success: true,
        message: `Recovery test sent via: ${channels.join(", ")}`,
        channels,
      });
    }

    return NextResponse.json({ error: "Unknown alert type. Use: test, test-email, test-recovery, verify-email" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
});
