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
  startAlertReminder,
  touchAlertReminder,
  clearAlertReminder,
  claimAlertReminderIfDue,
  AlertReminderRow,
  startAlertEscalation,
  touchAlertEscalation,
  clearAlertEscalation,
  claimAlertEscalationIfDue,
  AlertEscalationRow,
  getActiveMaintenanceWindow,
  getActiveIncidentOwnerByServiceId,
  getServiceOwner,
} from "./database";
import nodemailer from "nodemailer";

// ─── Config from environment ─────────────────────────────────

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const ALERT_COOLDOWN_MINUTES = parseInt(process.env.ALERT_COOLDOWN_MINUTES || "10", 10);
const ALERT_REMINDER_ENABLED = process.env.ALERT_REMINDER_ENABLED !== "false";
const ALERT_REMINDER_DOWN_MINUTES = parseInt(process.env.ALERT_REMINDER_DOWN_MINUTES || "15", 10);
const ALERT_REMINDER_DEGRADED_MINUTES = parseInt(process.env.ALERT_REMINDER_DEGRADED_MINUTES || "30", 10);
const ALERT_REMINDER_REPEAT_MINUTES = parseInt(process.env.ALERT_REMINDER_REPEAT_MINUTES || "60", 10);
const ALERT_ESCALATION_ENABLED = process.env.ALERT_ESCALATION_ENABLED !== "false";
const ALERT_ESCALATION_EMAIL_TO = process.env.ALERT_ESCALATION_EMAIL_TO || "";
const ALERT_ESCALATION_DOWN_MINUTES = parseInt(process.env.ALERT_ESCALATION_DOWN_MINUTES || "30", 10);
const ALERT_ESCALATION_DEGRADED_MINUTES = parseInt(process.env.ALERT_ESCALATION_DEGRADED_MINUTES || "120", 10);
const ALERT_ESCALATION_REPEAT_MINUTES = parseInt(process.env.ALERT_ESCALATION_REPEAT_MINUTES || "180", 10);

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

function hasSmtpConfig(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function parseRecipients(raw: string): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const entry of raw.split(",")) {
    const email = entry.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }

  return recipients;
}

function getPrimaryAlertRecipients(): string[] {
  return parseRecipients(ALERT_EMAIL_TO);
}

function getEscalationRecipients(serviceId: string): string[] {
  const incidentOwner = getActiveIncidentOwnerByServiceId(serviceId);
  const owner = getServiceOwner(serviceId);
  const incidentOwnerEmail = incidentOwner?.email?.trim() || "";
  const serviceOwnerEmail = owner?.memberEmail?.trim() || "";
  return parseRecipients([ALERT_ESCALATION_EMAIL_TO, incidentOwnerEmail, serviceOwnerEmail].filter(Boolean).join(","));
}

function getEmailTransporter(): nodemailer.Transporter | null {
  if (!hasSmtpConfig()) return null;

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
  return hasSmtpConfig() && getPrimaryAlertRecipients().length > 0;
}

function getReminderInitialDelayMinutes(status: ServiceStatus): number {
  return status === "down" ? ALERT_REMINDER_DOWN_MINUTES : ALERT_REMINDER_DEGRADED_MINUTES;
}

function getEscalationInitialDelayMinutes(status: ServiceStatus): number {
  return status === "down" ? ALERT_ESCALATION_DOWN_MINUTES : ALERT_ESCALATION_DEGRADED_MINUTES;
}

function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  return `${hours}h ${minutes}m`;
}

function getOutageDurationMinutes(failureStartedAt: string): number {
  const startedMs = new Date(failureStartedAt + "Z").getTime();
  const diffMs = Math.max(Date.now() - startedMs, 0);
  return Math.max(Math.round(diffMs / 60000), 1);
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

  const recipients = getPrimaryAlertRecipients();

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

async function sendFailureReminderEmail(
  check: HealthCheckResult,
  reminder: AlertReminderRow
): Promise<boolean> {
  const transport = getEmailTransporter();
  const recipients = getPrimaryAlertRecipients();
  if (!transport || !ALERT_REMINDER_ENABLED || recipients.length === 0) return false;

  const service = getServiceById(check.serviceId);
  const serviceName = service?.name || check.serviceId;
  const url = service?.url || "";
  const groupName = service?.group
    ? service.group.charAt(0).toUpperCase() + service.group.slice(1).replace(/-/g, " ")
    : "Unknown";
  const durationMinutes = getOutageDurationMinutes(reminder.failureStartedAt);
  const durationLabel = formatDuration(durationMinutes);
  const reminderLabel = `Reminder #${reminder.reminderCount}`;
  const statusLabel = check.status === "down" ? "DOWN" : "DEGRADED";
  const color = check.status === "down" ? statusColor.down : statusColor.degraded;
  const emoji = statusEmoji[check.status];
  const detectedAt = new Date(reminder.failureStartedAt + "Z").toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "long",
  });
  const subject =
    check.status === "down"
      ? `🔁 Ongoing outage: ${serviceName} still DOWN after ${durationLabel}`
      : `🔁 Ongoing issue: ${serviceName} still DEGRADED after ${durationLabel}`;

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
          <tr>
            <td style="background: linear-gradient(135deg, ${color}, ${color}88); padding:28px 32px;">
              <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">
                🔁 Ongoing Service Incident
              </h1>
              <p style="margin:6px 0 0; color:#ffffffcc; font-size:14px;">
                ${reminderLabel} · Platform Status Dashboard
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <h2 style="margin:0 0 20px; color:#f1f5f9; font-size:20px;">
                ${emoji} ${serviceName}
              </h2>

              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:${color}22; border:1px solid ${color}55; border-radius:6px; padding:8px 16px;">
                    <span style="color:${color}; font-weight:600; font-size:14px; text-transform:uppercase;">
                      ${emoji} Still ${statusLabel}
                    </span>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 0; border-bottom:1px solid #334155;">
                    <span style="color:#94a3b8; font-size:13px;">Product</span><br>
                    <span style="color:#e2e8f0; font-size:15px; font-weight:500;">${groupName}</span>
                  </td>
                  <td style="padding:12px 0; border-bottom:1px solid #334155; text-align:right;">
                    <span style="color:#94a3b8; font-size:13px;">Latest Response Time</span><br>
                    <span style="color:#e2e8f0; font-size:15px; font-weight:500;">${check.responseTimeMs}ms</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0; border-bottom:1px solid #334155;">
                    <span style="color:#94a3b8; font-size:13px;">Failure Ongoing Since</span><br>
                    <span style="color:#e2e8f0; font-size:15px;">${detectedAt}</span>
                  </td>
                  <td style="padding:12px 0; border-bottom:1px solid #334155; text-align:right;">
                    <span style="color:#94a3b8; font-size:13px;">Duration</span><br>
                    <span style="color:#e2e8f0; font-size:15px; font-weight:600;">${durationLabel}</span>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:12px 0; border-bottom:1px solid #334155;">
                    <span style="color:#94a3b8; font-size:13px;">Endpoint</span><br>
                    <a href="${url}" style="color:#60a5fa; font-size:14px; text-decoration:none; word-break:break-all;">${url}</a>
                  </td>
                </tr>
              </table>

              ${
                check.errorMessage
                  ? `
              <div style="background-color:#1a0a0a; border:1px solid #7f1d1d; border-radius:8px; padding:16px; margin-bottom:24px;">
                <p style="margin:0 0 8px; color:#fca5a5; font-size:13px; font-weight:600;">LATEST ERROR DETAILS</p>
                <p style="margin:0; color:#fecaca; font-size:13px; font-family:monospace; white-space:pre-wrap; word-break:break-all;">${check.errorMessage}</p>
              </div>
              `
                  : ""
              }

              <div style="background-color:#1a1a0a; border:1px solid #854d0e; border-radius:8px; padding:16px; margin-bottom:24px;">
                <p style="margin:0 0 8px; color:#fde68a; font-size:13px; font-weight:600;">ACTION STILL REQUIRED</p>
                <p style="margin:0; color:#fef3c7; font-size:13px;">
                  This service has not recovered within the expected response window. Please continue incident response, update stakeholders, and verify dependencies.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#0f172a; padding:20px 32px; border-top:1px solid #334155;">
              <p style="margin:0; color:#64748b; font-size:12px; text-align:center;">
                Platform Status Dashboard · Repeat reminder every ${ALERT_REMINDER_REPEAT_MINUTES} minutes while unresolved
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${reminderLabel}: ${serviceName} is still ${statusLabel}`,
    "",
    `Duration: ${durationLabel}`,
    `Product: ${groupName}`,
    `Latest response time: ${check.responseTimeMs}ms`,
    `Endpoint: ${url}`,
    `Failure ongoing since: ${detectedAt}`,
    check.errorMessage ? `Error: ${check.errorMessage}` : "",
    "",
    "This service has not recovered within the expected response window. Please continue incident response and verify dependencies.",
    "",
    "---",
    `Platform Status Dashboard | Repeat reminder every ${ALERT_REMINDER_REPEAT_MINUTES} minutes`,
  ].join("\n");

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
    console.error(`  ❌ Failed to send reminder email: ${err}`);
    return false;
  }
}

async function sendFailureEscalationEmail(
  check: HealthCheckResult,
  escalation: AlertEscalationRow,
  recipients: string[]
): Promise<boolean> {
  const transport = getEmailTransporter();
  if (!transport || recipients.length === 0 || !ALERT_ESCALATION_ENABLED) return false;

  const service = getServiceById(check.serviceId);
  const owner = getServiceOwner(check.serviceId);
  const serviceName = service?.name || check.serviceId;
  const url = service?.url || "";
  const groupName = service?.group
    ? service.group.charAt(0).toUpperCase() + service.group.slice(1).replace(/-/g, " ")
    : "Unknown";
  const durationMinutes = getOutageDurationMinutes(escalation.failureStartedAt);
  const durationLabel = formatDuration(durationMinutes);
  const escalationLabel = `Escalation #${escalation.escalationCount}`;
  const statusLabel = check.status === "down" ? "DOWN" : "DEGRADED";
  const color = check.status === "down" ? statusColor.down : statusColor.degraded;
  const emoji = check.status === "down" ? "🚨" : "📈";
  const detectedAt = new Date(escalation.failureStartedAt + "Z").toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "long",
  });
  const ownerLabel = owner?.memberName
    ? `${owner.memberName}${owner.memberEmail ? ` (${owner.memberEmail})` : ""}`
    : "Unassigned";
  const subject =
    check.status === "down"
      ? `🚨 ESCALATION: ${serviceName} still DOWN after ${durationLabel}`
      : `📈 ESCALATION: ${serviceName} still DEGRADED after ${durationLabel}`;

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
        <table width="640" cellpadding="0" cellspacing="0" style="background-color:#1e293b; border-radius:12px; overflow:hidden; border:1px solid #334155;">
          <tr>
            <td style="background: linear-gradient(135deg, ${color}, #0f172a); padding:30px 32px;">
              <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">
                ${emoji} Prolonged Service Incident Escalation
              </h1>
              <p style="margin:6px 0 0; color:#ffffffcc; font-size:14px;">
                ${escalationLabel} · Platform Status Dashboard
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <h2 style="margin:0 0 20px; color:#f8fafc; font-size:22px;">
                ${serviceName}
              </h2>

              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:${color}22; border:1px solid ${color}55; border-radius:999px; padding:8px 16px;">
                    <span style="color:${color}; font-weight:700; font-size:14px; text-transform:uppercase;">
                      ${statusLabel} · unresolved for ${durationLabel}
                    </span>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 0; border-bottom:1px solid #334155;">
                    <span style="color:#94a3b8; font-size:13px;">Product</span><br>
                    <span style="color:#e2e8f0; font-size:15px; font-weight:500;">${groupName}</span>
                  </td>
                  <td style="padding:12px 0; border-bottom:1px solid #334155; text-align:right;">
                    <span style="color:#94a3b8; font-size:13px;">Primary Owner</span><br>
                    <span style="color:#e2e8f0; font-size:15px; font-weight:500;">${ownerLabel}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0; border-bottom:1px solid #334155;">
                    <span style="color:#94a3b8; font-size:13px;">Failure Ongoing Since</span><br>
                    <span style="color:#e2e8f0; font-size:15px;">${detectedAt}</span>
                  </td>
                  <td style="padding:12px 0; border-bottom:1px solid #334155; text-align:right;">
                    <span style="color:#94a3b8; font-size:13px;">Latest Response Time</span><br>
                    <span style="color:#e2e8f0; font-size:15px; font-weight:500;">${check.responseTimeMs}ms</span>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:12px 0; border-bottom:1px solid #334155;">
                    <span style="color:#94a3b8; font-size:13px;">Endpoint</span><br>
                    <a href="${url}" style="color:#60a5fa; font-size:14px; text-decoration:none; word-break:break-all;">${url}</a>
                  </td>
                </tr>
              </table>

              ${
                check.errorMessage
                  ? `
              <div style="background-color:#1a0a0a; border:1px solid #7f1d1d; border-radius:8px; padding:16px; margin-bottom:24px;">
                <p style="margin:0 0 8px; color:#fca5a5; font-size:13px; font-weight:600;">CURRENT FAILURE SIGNAL</p>
                <p style="margin:0; color:#fecaca; font-size:13px; font-family:monospace; white-space:pre-wrap; word-break:break-all;">${check.errorMessage}</p>
              </div>
              `
                  : ""
              }

              <div style="background-color:#2a110c; border:1px solid #c2410c; border-radius:8px; padding:16px; margin-bottom:24px;">
                <p style="margin:0 0 8px; color:#fdba74; font-size:13px; font-weight:700;">ESCALATION ACTION</p>
                <p style="margin:0; color:#ffedd5; font-size:13px; line-height:1.6;">
                  The service remains unresolved beyond the normal response window. Escalate ownership, confirm mitigation progress, review dependencies, and communicate the current ETA or next checkpoint.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#0f172a; padding:20px 32px; border-top:1px solid #334155;">
              <p style="margin:0; color:#64748b; font-size:12px; text-align:center;">
                Platform Status Dashboard · Repeat escalation every ${ALERT_ESCALATION_REPEAT_MINUTES} minutes while unresolved
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${escalationLabel}: ${serviceName} is still ${statusLabel}`,
    "",
    `Duration: ${durationLabel}`,
    `Product: ${groupName}`,
    `Primary owner: ${ownerLabel}`,
    `Latest response time: ${check.responseTimeMs}ms`,
    `Endpoint: ${url}`,
    `Failure ongoing since: ${detectedAt}`,
    check.errorMessage ? `Current signal: ${check.errorMessage}` : "",
    "",
    "Escalation action: confirm mitigation progress, review dependencies, and communicate the next ETA or checkpoint.",
    "",
    "---",
    `Platform Status Dashboard | Repeat escalation every ${ALERT_ESCALATION_REPEAT_MINUTES} minutes`,
  ].join("\n");

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
    console.error(`  ❌ Failed to send escalation email: ${err}`);
    return false;
  }
}

// ─── Verify Email Config ────────────────────────────────────

export async function verifyEmailConfig(): Promise<{ success: boolean; error?: string }> {
  const transport = getEmailTransporter();
  if (!transport) {
    return {
      success: false,
      error: "Email not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env.local",
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
    clearAlertReminder(check.serviceId);
    clearAlertEscalation(check.serviceId);
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

async function sendFailureReminderIfDue(check: HealthCheckResult): Promise<void> {
  if (!ALERT_REMINDER_ENABLED || !isEmailConfigured()) return;
  if (check.status !== "down" && check.status !== "degraded") return;

  const reminder = claimAlertReminderIfDue(
    check.serviceId,
    check.status,
    getReminderInitialDelayMinutes(check.status),
    ALERT_REMINDER_REPEAT_MINUTES
  );

  if (!reminder) return;

  const service = getServiceById(check.serviceId);
  const serviceName = service?.name || check.serviceId;
  const durationLabel = formatDuration(getOutageDurationMinutes(reminder.failureStartedAt));
  const reminderType = check.status === "down" ? "failure_reminder" : "degraded_reminder";
  const alertMessage = `REMINDER #${reminder.reminderCount}: ${serviceName} still ${check.status.toUpperCase()} after ${durationLabel}`;

  console.log(`  🔁 Sending reminder email for ${serviceName} (${durationLabel} unresolved)`);

  const sent = await sendFailureReminderEmail(check, reminder);
  if (sent) {
    logAlert(check.serviceId, reminderType, "email", "sent", alertMessage, ALERT_EMAIL_TO);
  } else {
    logAlert(check.serviceId, reminderType, "email", "failed", alertMessage, ALERT_EMAIL_TO);
  }
}

async function sendFailureEscalationIfDue(check: HealthCheckResult): Promise<void> {
  if (!ALERT_ESCALATION_ENABLED) return;
  if (check.status !== "down" && check.status !== "degraded") return;
  if (!getEmailTransporter()) return;

  const recipients = getEscalationRecipients(check.serviceId);
  if (recipients.length === 0) return;

  const escalation = claimAlertEscalationIfDue(
    check.serviceId,
    check.status,
    getEscalationInitialDelayMinutes(check.status),
    ALERT_ESCALATION_REPEAT_MINUTES
  );

  if (!escalation) return;

  const service = getServiceById(check.serviceId);
  const serviceName = service?.name || check.serviceId;
  const durationLabel = formatDuration(getOutageDurationMinutes(escalation.failureStartedAt));
  const escalationType = check.status === "down" ? "failure_escalation" : "degraded_escalation";
  const alertMessage = `ESCALATION #${escalation.escalationCount}: ${serviceName} still ${check.status.toUpperCase()} after ${durationLabel}`;

  console.log(`  🚨 Sending escalation email for ${serviceName} (${durationLabel} unresolved)`);

  const sent = await sendFailureEscalationEmail(check, escalation, recipients);
  if (sent) {
    logAlert(check.serviceId, escalationType, "email", "sent", alertMessage, recipients.join(", "));
  } else {
    logAlert(check.serviceId, escalationType, "email", "failed", alertMessage, recipients.join(", "));
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
    const isFailing = result.status === "down" || result.status === "degraded";
    const wasFailing = prevStatus === "down" || prevStatus === "degraded";
    const hasActiveMaintenance = !!getActiveMaintenanceWindow(result.serviceId);

    if (hasActiveMaintenance || result.status === "maintenance") {
      lastAlertTimes.delete(result.serviceId);
      clearCooldown(result.serviceId);
      clearAlertReminder(result.serviceId);
      clearAlertEscalation(result.serviceId);
      continue;
    }

    // New failure: was operational/unknown or this is the first observed bad check.
    if (
      isFailing &&
      (prevStatus === "operational" || prevStatus === "unknown" || prevStatus === "maintenance" || prevStatus === undefined)
    ) {
      failures.push(result.serviceId);
      startAlertReminder(result.serviceId, result.status);
      startAlertEscalation(result.serviceId, result.status);
      await sendAlert(result, "failure");
      continue;
    }

    if (isFailing) {
      touchAlertReminder(result.serviceId, result.status);
      touchAlertEscalation(result.serviceId, result.status);
      await sendFailureReminderIfDue(result);
      await sendFailureEscalationIfDue(result);
      continue;
    }

    if (result.status === "operational") {
      clearAlertReminder(result.serviceId);
      clearAlertEscalation(result.serviceId);

      if (wasFailing) {
        recoveries.push(result.serviceId);
        await sendAlert(result, "recovery");
      }
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
  type: "assigned" | "deadline_reminder" | "status_update";
  newStatus?: string;
}): Promise<boolean> {
  const transport = getEmailTransporter();
  if (!transport) return false;

  const isReminder = payload.type === "deadline_reminder";
  const isStatusUpdate = payload.type === "status_update";
  const deadlineStr = payload.deadline
    ? new Date(payload.deadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "No deadline set";

  const statusLabel = payload.newStatus?.replace("_", " ") || "";

  const subject = isReminder
    ? `\u23f0 Deadline approaching: Incident #${payload.incidentId} assigned to you`
    : isStatusUpdate
      ? `\ud83d\udd04 Status updated: Incident #${payload.incidentId} is now ${statusLabel}`
      : `\ud83d\udccc Assigned to you: Incident #${payload.incidentId}`;

  const headerColor = isReminder ? "#f59e0b" : isStatusUpdate ? "#3dd68c" : "#6366f1";
  const headerTitle = isReminder ? "\u23f0 Deadline Reminder" : isStatusUpdate ? "\ud83d\udd04 Status Update" : "\ud83d\udccc Incident Assigned";

  const bodyText = isReminder
    ? `The deadline for incident <strong>#${payload.incidentId}</strong> is approaching.`
    : isStatusUpdate
      ? `The status of incident <strong>#${payload.incidentId}</strong> has been updated to <strong>${statusLabel}</strong>.`
      : `You have been assigned to incident <strong>#${payload.incidentId}</strong>.`;

  const ctaText = isReminder
    ? "Please update the incident status or resolve it before the deadline."
    : isStatusUpdate
      ? payload.newStatus === "resolved"
        ? "This incident has been resolved. No further action is required."
        : "Please continue working on this incident and update the status as you make progress."
      : "Please investigate this incident and update its status as you make progress.";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a; padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#1e293b; border-radius:12px; overflow:hidden; border:1px solid #334155;">
        <tr>
          <td style="background: linear-gradient(135deg, ${headerColor}, ${headerColor}88); padding:28px 32px;">
            <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">
              ${headerTitle}
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
              ${bodyText}
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              ${isStatusUpdate ? `
              <tr>
                <td style="padding:12px 0; border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8; font-size:13px;">New Status</span><br>
                  <span style="color:#e2e8f0; font-size:15px; font-weight:600; text-transform:capitalize;">${statusLabel}</span>
                </td>
              </tr>` : ""}
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
                ${ctaText}
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
    isReminder
      ? `DEADLINE REMINDER: Incident #${payload.incidentId}`
      : isStatusUpdate
        ? `STATUS UPDATE: Incident #${payload.incidentId} → ${statusLabel}`
        : `ASSIGNED: Incident #${payload.incidentId}`,
    "",
    `Hi ${payload.toName},`,
    "",
    isReminder
      ? `The deadline for incident #${payload.incidentId} is approaching.`
      : isStatusUpdate
        ? `Incident #${payload.incidentId} status changed to: ${statusLabel}`
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

// ─── Welcome Email for New Team Members ─────────────────────

export async function sendWelcomeEmail(payload: {
  toEmail: string;
  toName: string;
  role: string;
}): Promise<boolean> {
  const transport = getEmailTransporter();
  if (!transport) return false;

  const subject = `\ud83d\udc4b Welcome to the team, ${payload.toName}!`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a; padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#1e293b; border-radius:12px; overflow:hidden; border:1px solid #334155;">
        <tr>
          <td style="background: linear-gradient(135deg, #5b5bd6, #5b5bd688); padding:28px 32px;">
            <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">
              \ud83d\udc4b Welcome to the Team
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
              You have been added to the Platform Status Dashboard team as <strong>${payload.role}</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="padding:12px 0; border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8; font-size:13px;">Your Role</span><br>
                  <span style="color:#e2e8f0; font-size:15px; font-weight:500; text-transform:capitalize;">${payload.role}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0; border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8; font-size:13px;">Email</span><br>
                  <span style="color:#e2e8f0; font-size:15px;">${payload.toEmail}</span>
                </td>
              </tr>
            </table>
            <div style="background-color:#1a1a2e; border:1px solid #334155; border-radius:8px; padding:16px; margin-bottom:24px;">
              <p style="margin:0 0 8px; color:#a5b4fc; font-size:14px; font-weight:600;">What to expect:</p>
              <ul style="margin:0; padding:0 0 0 20px; color:#a5b4fc; font-size:13px; line-height:1.8;">
                <li>You'll receive email notifications when incidents are assigned to you</li>
                <li>You'll get deadline reminders for upcoming assignments</li>
                <li>You'll be notified when assignment statuses change</li>
              </ul>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color:#0f172a; padding:20px 32px; border-top:1px solid #334155;">
            <p style="margin:0; color:#64748b; font-size:12px; text-align:center;">
              Platform Status Dashboard &middot; Welcome Notification
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Welcome to the team, ${payload.toName}!`,
    "",
    `You have been added to the Platform Status Dashboard team as ${payload.role}.`,
    "",
    "What to expect:",
    "- You'll receive email notifications when incidents are assigned to you",
    "- You'll get deadline reminders for upcoming assignments",
    "- You'll be notified when assignment statuses change",
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
    logAlert("team", "welcome", "email", "sent", `Welcome email → ${payload.toEmail}`, payload.toEmail);
    return true;
  } catch (err) {
    console.error(`  \u274c Failed to send welcome email: ${err}`);
    logAlert("team", "welcome", "email", "failed", `Welcome email → ${payload.toEmail}`, payload.toEmail);
    return false;
  }
}

export function getAlertConfig() {
  return {
    slackConfigured: !!SLACK_WEBHOOK_URL,
    emailConfigured: isEmailConfigured(),
    emailTo: ALERT_EMAIL_TO || null,
    escalationEmailTo: ALERT_ESCALATION_EMAIL_TO || null,
    smtpHost: SMTP_HOST || null,
    cooldownMinutes: ALERT_COOLDOWN_MINUTES,
    remindersEnabled: ALERT_REMINDER_ENABLED,
    firstReminderDownMinutes: ALERT_REMINDER_DOWN_MINUTES,
    firstReminderDegradedMinutes: ALERT_REMINDER_DEGRADED_MINUTES,
    repeatReminderMinutes: ALERT_REMINDER_REPEAT_MINUTES,
    escalationsEnabled: ALERT_ESCALATION_ENABLED,
    firstEscalationDownMinutes: ALERT_ESCALATION_DOWN_MINUTES,
    firstEscalationDegradedMinutes: ALERT_ESCALATION_DEGRADED_MINUTES,
    repeatEscalationMinutes: ALERT_ESCALATION_REPEAT_MINUTES,
  };
}
