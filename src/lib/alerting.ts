// ============================================================
// Alerting System
// Slack webhooks, Email (SMTP via Nodemailer), Console logging
// ============================================================

import { HealthCheckResult, ServiceStatus } from "@/types";
import { getServiceById } from "./services-config";
import {
  logAlert,
  getCooldown,
  setCooldown,
  clearCooldown,
  getAllCooldowns,
} from "./database";
import nodemailer from "nodemailer";

// ─── Config from environment ─────────────────────────────────

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const ALERT_COOLDOWN_MINUTES = parseInt(process.env.ALERT_COOLDOWN_MINUTES || "10", 10);

// Email config
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE = process.env.SMTP_SECURE === "true"; // true for 465, false for 587/STARTTLS
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || SMTP_USER;
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO || ""; // comma-separated list

// ─── Cooldown tracking (in-memory cache backed by DB) ───────

// In-memory map acts as fast cache; DB is the source of truth
const lastAlertTimes: Map<string, number> = new Map();
let cooldownsCacheLoaded = false;

/** Load all cooldowns from DB into the in-memory cache (called once on startup) */
function loadCooldownsFromDb(): void {
  if (cooldownsCacheLoaded) return;
  try {
    const rows = getAllCooldowns();
    for (const row of rows) {
      const ts = new Date(row.lastAlertAt + "Z").getTime(); // DB stores UTC without 'Z'
      lastAlertTimes.set(row.serviceId, ts);
    }
    cooldownsCacheLoaded = true;
  } catch {
    // DB may not be ready yet; will retry next call
  }
}

function shouldAlert(serviceId: string): boolean {
  loadCooldownsFromDb();

  const now = Date.now();
  const cooldownMs = ALERT_COOLDOWN_MINUTES * 60 * 1000;

  // Check in-memory cache first (fast path)
  const cachedTime = lastAlertTimes.get(serviceId);
  if (cachedTime && now - cachedTime < cooldownMs) {
    return false; // Still in cooldown per cache
  }

  // Double-check against DB (source of truth)
  const dbCooldown = getCooldown(serviceId);
  if (dbCooldown) {
    const dbTime = new Date(dbCooldown.lastAlertAt + "Z").getTime();
    if (now - dbTime < cooldownMs) {
      // Update cache to match DB
      lastAlertTimes.set(serviceId, dbTime);
      return false; // Still in cooldown per DB
    }
  }

  // Cooldown expired or no previous alert — allow alert
  lastAlertTimes.set(serviceId, now);
  setCooldown(serviceId, "failure");
  return true;
}

// ─── Status helpers ──────────────────────────────────────────

const statusEmoji: Record<ServiceStatus, string> = {
  operational: "\u2705",
  degraded: "\u26a0\ufe0f",
  down: "\ud83d\udd34",
  maintenance: "\ud83d\udd27",
  unknown: "\u2753",
};

const statusColor: Record<ServiceStatus, string> = {
  operational: "#22c55e",
  degraded: "#f59e0b",
  down: "#ef4444",
  maintenance: "#6366f1",
  unknown: "#6b7280",
};

// ─── Email Transport (lazy init) ─────────────────────────────

let transporter: nodemailer.Transporter | null = null;

function getEmailTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !ALERT_EMAIL_TO) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      // Timeout settings
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }

  return transporter;
}

export function isEmailConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS && ALERT_EMAIL_TO);
}

// ─── Email Alerting ─────────────────────────────────────────

async function sendEmailAlert(payload: {
  serviceId: string;
  serviceName: string;
  status: ServiceStatus;
  responseTimeMs: number;
  error: string | null;
  type: "failure" | "recovery";
}): Promise<boolean> {
  const transport = getEmailTransporter();
  if (!transport) return false;

  const service = getServiceById(payload.serviceId);
  const url = service?.url || "";
  const emoji = statusEmoji[payload.status];
  const color = payload.type === "recovery" ? "#22c55e" : statusColor[payload.status];
  const timestamp = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "long",
  });

  const isRecovery = payload.type === "recovery";
  const subject = isRecovery
    ? `\u2705 RECOVERED: ${payload.serviceName} is back online`
    : `\ud83d\udea8 ALERT: ${payload.serviceName} is ${payload.status.toUpperCase()}`;

  const groupName = service?.group
    ? service.group.charAt(0).toUpperCase() + service.group.slice(1).replace(/-/g, " ")
    : "Unknown";

  // Build rich HTML email
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a; padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#1e293b; border-radius:12px; overflow:hidden; border:1px solid #334155;">

          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, ${color}, ${color}88); padding:28px 32px;">
              <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">
                ${isRecovery ? "\u2705" : "\ud83d\udea8"} ${isRecovery ? "Service Recovered" : "Service Alert"}
              </h1>
              <p style="margin:6px 0 0; color:#ffffffcc; font-size:14px;">
                Platform Status Dashboard
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:28px 32px;">

              <!-- Service Name -->
              <h2 style="margin:0 0 20px; color:#f1f5f9; font-size:20px;">
                ${emoji} ${payload.serviceName}
              </h2>

              <!-- Status Badge -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:${color}22; border:1px solid ${color}55; border-radius:6px; padding:8px 16px;">
                    <span style="color:${color}; font-weight:600; font-size:14px; text-transform:uppercase;">
                      ${emoji} ${isRecovery ? "Operational" : payload.status}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Details Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 0; border-bottom:1px solid #334155;">
                    <span style="color:#94a3b8; font-size:13px;">Product</span><br>
                    <span style="color:#e2e8f0; font-size:15px; font-weight:500;">${groupName}</span>
                  </td>
                  <td style="padding:12px 0; border-bottom:1px solid #334155; text-align:right;">
                    <span style="color:#94a3b8; font-size:13px;">Response Time</span><br>
                    <span style="color:#e2e8f0; font-size:15px; font-weight:500;">${payload.responseTimeMs}ms</span>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:12px 0; border-bottom:1px solid #334155;">
                    <span style="color:#94a3b8; font-size:13px;">Endpoint</span><br>
                    <a href="${url}" style="color:#60a5fa; font-size:14px; text-decoration:none; word-break:break-all;">${url}</a>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:12px 0; border-bottom:1px solid #334155;">
                    <span style="color:#94a3b8; font-size:13px;">Detected At</span><br>
                    <span style="color:#e2e8f0; font-size:15px;">${timestamp}</span>
                  </td>
                </tr>
              </table>

              ${
                payload.error
                  ? `
              <!-- Error Details -->
              <div style="background-color:#1a0a0a; border:1px solid #7f1d1d; border-radius:8px; padding:16px; margin-bottom:24px;">
                <p style="margin:0 0 8px; color:#fca5a5; font-size:13px; font-weight:600;">ERROR DETAILS</p>
                <p style="margin:0; color:#fecaca; font-size:13px; font-family:monospace; white-space:pre-wrap; word-break:break-all;">${payload.error}</p>
              </div>
              `
                  : ""
              }

              ${
                isRecovery
                  ? `
              <!-- Recovery Message -->
              <div style="background-color:#052e16; border:1px solid #166534; border-radius:8px; padding:16px; margin-bottom:24px;">
                <p style="margin:0; color:#86efac; font-size:14px;">
                  \u2705 This service has recovered and is now responding normally. No further action is required.
                </p>
              </div>
              `
                  : `
              <!-- Action Required -->
              <div style="background-color:#1a1a0a; border:1px solid #854d0e; border-radius:8px; padding:16px; margin-bottom:24px;">
                <p style="margin:0 0 8px; color:#fde68a; font-size:13px; font-weight:600;">ACTION REQUIRED</p>
                <p style="margin:0; color:#fef3c7; font-size:13px;">
                  Please investigate this service. Check the server logs, resource usage, and dependencies.
                </p>
              </div>
              `
              }

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#0f172a; padding:20px 32px; border-top:1px solid #334155;">
              <p style="margin:0; color:#64748b; font-size:12px; text-align:center;">
                Platform Status Dashboard &middot; Automated Alert<br>
                Alert cooldown: ${ALERT_COOLDOWN_MINUTES} minutes per service
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain text fallback
  const text = [
    isRecovery
      ? `RECOVERED: ${payload.serviceName} is back online`
      : `ALERT: ${payload.serviceName} is ${payload.status.toUpperCase()}`,
    "",
    `Product: ${groupName}`,
    `Status: ${payload.status}`,
    `Response Time: ${payload.responseTimeMs}ms`,
    `Endpoint: ${url}`,
    `Detected At: ${timestamp}`,
    "",
    payload.error ? `Error: ${payload.error}\n` : "",
    isRecovery
      ? "This service has recovered and is now responding normally."
      : "Please investigate this service. Check the server logs, resource usage, and dependencies.",
    "",
    "---",
    `Platform Status Dashboard | Cooldown: ${ALERT_COOLDOWN_MINUTES}min`,
  ].join("\n");

  const recipients = ALERT_EMAIL_TO.split(",").map((e) => e.trim()).filter(Boolean);

  try {
    await transport.sendMail({
      from: `"Platform Status" <${ALERT_EMAIL_FROM}>`,
      to: recipients.join(", "),
      subject,
      text,
      html,
    });
    return true;
  } catch (err) {
    console.error(`  \u274c Failed to send email alert: ${err}`);
    return false;
  }
}

// ─── Verify Email Config ────────────────────────────────────

export async function verifyEmailConfig(): Promise<{ success: boolean; error?: string }> {
  const transport = getEmailTransporter();
  if (!transport) {
    return {
      success: false,
      error: "Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and ALERT_EMAIL_TO in .env.local",
    };
  }

  try {
    await transport.verify();
    return { success: true };
  } catch (err) {
    return { success: false, error: `SMTP connection failed: ${err}` };
  }
}

// ─── Slack Alerting ──────────────────────────────────────────

async function sendSlackAlert(payload: {
  serviceId: string;
  serviceName: string;
  status: ServiceStatus;
  responseTimeMs: number;
  error: string | null;
  type: "failure" | "recovery";
}): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) return false;

  const emoji = statusEmoji[payload.status];
  const color = payload.type === "recovery" ? "#36a64f" : payload.status === "down" ? "#dc3545" : "#ffc107";
  const service = getServiceById(payload.serviceId);
  const url = service?.url || "";

  const slackPayload = {
    username: "Status Monitor",
    icon_emoji: payload.type === "recovery" ? ":white_check_mark:" : ":rotating_light:",
    attachments: [
      {
        color,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text:
                payload.type === "recovery"
                  ? `${emoji} RECOVERED: ${payload.serviceName}`
                  : `${emoji} ALERT: ${payload.serviceName} is ${payload.status.toUpperCase()}`,
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Service:*\n${payload.serviceName}` },
              { type: "mrkdwn", text: `*Status:*\n${emoji} ${payload.status}` },
              { type: "mrkdwn", text: `*Response Time:*\n${payload.responseTimeMs}ms` },
              {
                type: "mrkdwn",
                text: `*Endpoint:*\n<${url}|${url.length > 50 ? url.substring(0, 50) + "..." : url}>`,
              },
            ],
          },
          ...(payload.error
            ? [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `*Error:*\n\`\`\`${payload.error}\`\`\``,
                  },
                },
              ]
            : []),
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `\ud83d\udd50 ${new Date().toISOString()} | Platform Status Dashboard`,
              },
            ],
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload),
    });
    return response.ok;
  } catch (err) {
    console.error(`  \u274c Failed to send Slack alert: ${err}`);
    return false;
  }
}

// ─── Console Alerting (always active) ────────────────────────

function consoleAlert(payload: {
  serviceName: string;
  status: ServiceStatus;
  responseTimeMs: number;
  error: string | null;
  type: "failure" | "recovery";
}) {
  const emoji = statusEmoji[payload.status];
  const timestamp = new Date().toLocaleString();

  if (payload.type === "recovery") {
    console.log(`\n  \u2705 RECOVERED: ${payload.serviceName} is back to operational at ${timestamp}`);
  } else {
    console.log(`\n  ${emoji} ALERT: ${payload.serviceName} is ${payload.status.toUpperCase()}`);
    console.log(`     Response time: ${payload.responseTimeMs}ms`);
    if (payload.error) console.log(`     Error: ${payload.error}`);
    console.log(`     Time: ${timestamp}`);
  }
}

// ─── Main Alert Dispatcher ───────────────────────────────────

export async function sendAlert(
  check: HealthCheckResult,
  type: "failure" | "recovery"
): Promise<void> {
  const service = getServiceById(check.serviceId);
  const serviceName = service?.name || check.serviceId;

  // Check cooldown (skip for recoveries — always send those)
  if (type === "failure" && !shouldAlert(check.serviceId)) {
    console.log(`  \u23f3 Alert suppressed for ${serviceName} (cooldown active)`);
    return;
  }

  // Clear cooldown on recovery (both cache and DB)
  if (type === "recovery") {
    lastAlertTimes.delete(check.serviceId);
    clearCooldown(check.serviceId);
  }

  const alertType = type === "recovery" ? "recovery" : check.status === "degraded" ? "degraded" : "failure";
  const alertMessage =
    type === "recovery"
      ? `RECOVERED: ${serviceName} is back online`
      : `ALERT: ${serviceName} is ${check.status.toUpperCase()}${check.errorMessage ? ` — ${check.errorMessage}` : ""}`;

  const payload = {
    serviceId: check.serviceId,
    serviceName,
    status: check.status,
    responseTimeMs: check.responseTimeMs,
    error: check.errorMessage,
    type,
  };

  // Always log to console
  consoleAlert(payload);
  logAlert(check.serviceId, alertType, "console", "sent", alertMessage, null);

  // Send to Slack if configured
  if (SLACK_WEBHOOK_URL) {
    const sent = await sendSlackAlert(payload);
    if (sent) {
      console.log(`  \ud83d\udce4 Slack alert sent for ${serviceName}`);
      logAlert(check.serviceId, alertType, "slack", "sent", alertMessage, null);
    } else {
      logAlert(check.serviceId, alertType, "slack", "failed", alertMessage, null);
    }
  }

  // Send email if configured
  if (isEmailConfigured()) {
    const recipients = ALERT_EMAIL_TO;
    const sent = await sendEmailAlert(payload);
    if (sent) {
      console.log(`  \ud83d\udce7 Email alert sent for ${serviceName}`);
      logAlert(check.serviceId, alertType, "email", "sent", alertMessage, recipients);
    } else {
      logAlert(check.serviceId, alertType, "email", "failed", alertMessage, recipients);
    }
  }
}

// ─── Batch Alert Processor ───────────────────────────────────
// Analyzes results and sends alerts for failures and recoveries

export async function processAlertsForResults(
  results: HealthCheckResult[],
  previousStatuses: Map<string, ServiceStatus>
): Promise<{ failures: string[]; recoveries: string[] }> {
  const failures: string[] = [];
  const recoveries: string[] = [];

  for (const result of results) {
    const prevStatus = previousStatuses.get(result.serviceId);

    // New failure: was operational (or first check), now is down/degraded
    if (
      (result.status === "down" || result.status === "degraded") &&
      prevStatus === "operational"
    ) {
      failures.push(result.serviceId);
      await sendAlert(result, "failure");
    }

    // Recovery: was down/degraded, now operational
    if (
      result.status === "operational" &&
      (prevStatus === "down" || prevStatus === "degraded")
    ) {
      recoveries.push(result.serviceId);
      await sendAlert(result, "recovery");
    }
  }

  return { failures, recoveries };
}

// ─── Assignment Email Notifications ─────────────────────────

export async function sendAssignmentEmail(payload: {
  toEmail: string;
  toName: string;
  incidentId: number;
  assignmentId: number;
  notes: string | null;
  deadline: string | null;
  type: "assigned" | "deadline_reminder";
}): Promise<boolean> {
  const transport = getEmailTransporter();
  if (!transport) return false;

  const isReminder = payload.type === "deadline_reminder";
  const deadlineStr = payload.deadline
    ? new Date(payload.deadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "No deadline set";

  const subject = isReminder
    ? `\u23f0 Deadline approaching: Incident #${payload.incidentId} assigned to you`
    : `\ud83d\udccc Assigned to you: Incident #${payload.incidentId}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a; padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#1e293b; border-radius:12px; overflow:hidden; border:1px solid #334155;">
        <tr>
          <td style="background: linear-gradient(135deg, ${isReminder ? "#f59e0b" : "#6366f1"}, ${isReminder ? "#f59e0b88" : "#6366f188"}); padding:28px 32px;">
            <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">
              ${isReminder ? "\u23f0 Deadline Reminder" : "\ud83d\udccc Incident Assigned"}
            </h1>
            <p style="margin:6px 0 0; color:#ffffffcc; font-size:14px;">Platform Status Dashboard</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px; color:#e2e8f0; font-size:16px;">
              Hi <strong>${payload.toName}</strong>,
            </p>
            <p style="margin:0 0 24px; color:#cbd5e1; font-size:15px;">
              ${isReminder
                ? `The deadline for incident <strong>#${payload.incidentId}</strong> is approaching.`
                : `You have been assigned to incident <strong>#${payload.incidentId}</strong>.`}
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="padding:12px 0; border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8; font-size:13px;">Deadline</span><br>
                  <span style="color:${isReminder ? "#fbbf24" : "#e2e8f0"}; font-size:15px; font-weight:500;">${deadlineStr}</span>
                </td>
              </tr>
              ${payload.notes ? `
              <tr>
                <td style="padding:12px 0; border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8; font-size:13px;">Notes</span><br>
                  <span style="color:#e2e8f0; font-size:14px;">${payload.notes}</span>
                </td>
              </tr>` : ""}
            </table>
            <div style="background-color:#1a1a2e; border:1px solid #334155; border-radius:8px; padding:16px; margin-bottom:24px;">
              <p style="margin:0; color:#a5b4fc; font-size:14px;">
                ${isReminder
                  ? "Please update the incident status or resolve it before the deadline."
                  : "Please investigate this incident and update its status as you make progress."}
              </p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color:#0f172a; padding:20px 32px; border-top:1px solid #334155;">
            <p style="margin:0; color:#64748b; font-size:12px; text-align:center;">
              Platform Status Dashboard &middot; Assignment Notification
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    isReminder ? `DEADLINE REMINDER: Incident #${payload.incidentId}` : `ASSIGNED: Incident #${payload.incidentId}`,
    "",
    `Hi ${payload.toName},`,
    "",
    isReminder
      ? `The deadline for incident #${payload.incidentId} is approaching.`
      : `You have been assigned to incident #${payload.incidentId}.`,
    `Deadline: ${deadlineStr}`,
    payload.notes ? `Notes: ${payload.notes}` : "",
    "",
    "---",
    "Platform Status Dashboard",
  ].join("\n");

  try {
    await transport.sendMail({
      from: `"Platform Status" <${ALERT_EMAIL_FROM}>`,
      to: payload.toEmail,
      subject,
      text,
      html,
    });
    logAlert("assignment", payload.type, "email", "sent", `${subject} → ${payload.toEmail}`, payload.toEmail);
    return true;
  } catch (err) {
    console.error(`  \u274c Failed to send assignment email: ${err}`);
    logAlert("assignment", payload.type, "email", "failed", `${subject} → ${payload.toEmail}`, payload.toEmail);
    return false;
  }
}

export function getAlertConfig() {
  return {
    slackConfigured: !!SLACK_WEBHOOK_URL,
    emailConfigured: isEmailConfigured(),
    emailTo: ALERT_EMAIL_TO || null,
    smtpHost: SMTP_HOST || null,
    cooldownMinutes: ALERT_COOLDOWN_MINUTES,
  };
}
