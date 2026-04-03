// ============================================================
// SQLite Database Layer
// Stores health check history and incidents
// ============================================================

import Database from "better-sqlite3";
import path from "path";
import { HealthCheckResult, Incident, IncidentUpdate, UptimeBar, TeamMember, IncidentAssignment, AssignmentStatus } from "@/types";

// Use DATABASE_PATH env var for persistent disk (Render/Railway/Fly.io)
// Falls back to local ./data/ for development
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "status.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    initializeDatabase(db);
  }
  return db;
}

function initializeDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL CHECK(status IN ('operational', 'degraded', 'down', 'maintenance', 'unknown')),
      response_time_ms REAL,
      status_code INTEGER,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_health_checks_service_time
      ON health_checks(service_id, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp
      ON health_checks(timestamp DESC);

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'investigating'
        CHECK(status IN ('investigating', 'identified', 'monitoring', 'resolved')),
      severity TEXT NOT NULL DEFAULT 'minor'
        CHECK(severity IN ('minor', 'major', 'critical')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_service
      ON incidents(service_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS incident_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL REFERENCES incidents(id),
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_incident_updates_incident
      ON incident_updates(incident_id, created_at DESC);

    -- Alert history: tracks every alert sent
    CREATE TABLE IF NOT EXISTS alert_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      recipients TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_alert_history_service
      ON alert_history(service_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_alert_history_time
      ON alert_history(created_at DESC);

    -- Persistent cooldowns: replaces in-memory cooldown map as source of truth
    CREATE TABLE IF NOT EXISTS alert_cooldowns (
      service_id TEXT PRIMARY KEY,
      last_alert_at TEXT NOT NULL,
      alert_type TEXT NOT NULL
    );

    -- Team members
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'engineer',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Incident assignments
    CREATE TABLE IF NOT EXISTS incident_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL REFERENCES incidents(id),
      assignee_id INTEGER NOT NULL REFERENCES team_members(id),
      notes TEXT,
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK(status IN ('open', 'in_progress', 'resolved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_assignments_incident
      ON incident_assignments(incident_id);

    CREATE INDEX IF NOT EXISTS idx_assignments_assignee
      ON incident_assignments(assignee_id, status);

    CREATE INDEX IF NOT EXISTS idx_assignments_deadline
      ON incident_assignments(deadline);
  `);
}

// ─── Health Check Queries ────────────────────────────────────

export function insertHealthCheck(check: Omit<HealthCheckResult, "id">): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO health_checks (service_id, timestamp, status, response_time_ms, status_code, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    check.serviceId,
    check.timestamp,
    check.status,
    check.responseTimeMs,
    check.statusCode,
    check.errorMessage
  );
}

export function getLatestCheck(serviceId: string): HealthCheckResult | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, service_id as serviceId, timestamp, status, response_time_ms as responseTimeMs,
              status_code as statusCode, error_message as errorMessage
       FROM health_checks WHERE service_id = ? ORDER BY timestamp DESC LIMIT 1`
    )
    .get(serviceId) as HealthCheckResult | undefined;
  return row ?? null;
}

export function getRecentChecks(serviceId: string, limit: number = 50): HealthCheckResult[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, service_id as serviceId, timestamp, status, response_time_ms as responseTimeMs,
              status_code as statusCode, error_message as errorMessage
       FROM health_checks WHERE service_id = ? ORDER BY timestamp DESC LIMIT ?`
    )
    .all(serviceId, limit) as HealthCheckResult[];
}

export function getUptimePercent(serviceId: string, hoursAgo: number): number {
  const db = getDb();
  const result = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'operational' THEN 1 ELSE 0 END) as up
       FROM health_checks
       WHERE service_id = ?
         AND timestamp >= datetime('now', ? || ' hours')`
    )
    .get(serviceId, -hoursAgo) as { total: number; up: number } | undefined;

  if (!result || result.total === 0) return 100;
  return Math.round((result.up / result.total) * 10000) / 100;
}

export function getDailyUptimeBars(serviceId: string, days: number = 90): UptimeBar[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         date(timestamp) as date,
         COUNT(*) as totalChecks,
         SUM(CASE WHEN status != 'operational' THEN 1 ELSE 0 END) as failedChecks,
         CASE
           WHEN SUM(CASE WHEN status = 'down' THEN 1 ELSE 0 END) > 0 THEN 'down'
           WHEN SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) > 0 THEN 'degraded'
           WHEN SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) > 0 THEN 'maintenance'
           ELSE 'operational'
         END as status
       FROM health_checks
       WHERE service_id = ?
         AND timestamp >= date('now', ? || ' days')
       GROUP BY date(timestamp)
       ORDER BY date(timestamp) ASC`
    )
    .all(serviceId, -days) as Array<{
    date: string;
    totalChecks: number;
    failedChecks: number;
    status: string;
  }>;

  return rows.map((r) => ({
    date: r.date,
    status: r.status as UptimeBar["status"],
    uptimePercent:
      r.totalChecks > 0 ? Math.round(((r.totalChecks - r.failedChecks) / r.totalChecks) * 10000) / 100 : 100,
    totalChecks: r.totalChecks,
    failedChecks: r.failedChecks,
  }));
}

export function cleanOldChecks(daysToKeep: number = 90): void {
  const db = getDb();
  db.prepare(`DELETE FROM health_checks WHERE timestamp < datetime('now', ? || ' days')`).run(-daysToKeep);
}

// ─── Incident Queries ────────────────────────────────────────

export function createIncident(incident: Omit<Incident, "id" | "createdAt" | "updatedAt" | "resolvedAt">): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO incidents (service_id, title, description, status, severity)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(incident.serviceId, incident.title, incident.description, incident.status, incident.severity);
  return result.lastInsertRowid as number;
}

export function updateIncident(id: number, updates: Partial<Incident>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.title) {
    fields.push("title = ?");
    values.push(updates.title);
  }
  if (updates.description) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.severity) {
    fields.push("severity = ?");
    values.push(updates.severity);
  }
  if (updates.status === "resolved") {
    fields.push("resolved_at = datetime('now')");
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE incidents SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function getActiveIncidents(): Incident[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, service_id as serviceId, title, description, status, severity,
              created_at as createdAt, updated_at as updatedAt, resolved_at as resolvedAt
       FROM incidents WHERE status != 'resolved' ORDER BY created_at DESC`
    )
    .all() as Incident[];
}

export function getRecentIncidents(limit: number = 20): Incident[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, service_id as serviceId, title, description, status, severity,
              created_at as createdAt, updated_at as updatedAt, resolved_at as resolvedAt
       FROM incidents ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as Incident[];
}

export function addIncidentUpdate(update: Omit<IncidentUpdate, "id" | "createdAt">): void {
  const db = getDb();
  db.prepare(`INSERT INTO incident_updates (incident_id, message, status) VALUES (?, ?, ?)`).run(
    update.incidentId,
    update.message,
    update.status
  );
  // Also update the incident status
  updateIncident(update.incidentId, { status: update.status as Incident["status"] });
}

export function getIncidentUpdates(incidentId: number): IncidentUpdate[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, incident_id as incidentId, message, status, created_at as createdAt
       FROM incident_updates WHERE incident_id = ? ORDER BY created_at DESC`
    )
    .all(incidentId) as IncidentUpdate[];
}

// ─── Alert History Queries ──────────────────────────────────

export interface AlertHistoryRow {
  id: number;
  serviceId: string;
  alertType: string;
  channel: string;
  status: string;
  message: string | null;
  recipients: string | null;
  createdAt: string;
}

export function logAlert(
  serviceId: string,
  alertType: string,
  channel: string,
  status: string,
  message?: string | null,
  recipients?: string | null
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO alert_history (service_id, alert_type, channel, status, message, recipients)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(serviceId, alertType, channel, status, message ?? null, recipients ?? null);
}

export function getAlertHistory(limit: number = 50, serviceId?: string): AlertHistoryRow[] {
  const db = getDb();
  if (serviceId) {
    return db
      .prepare(
        `SELECT id, service_id AS serviceId, alert_type AS alertType, channel, status,
                message, recipients, created_at AS createdAt
         FROM alert_history WHERE service_id = ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(serviceId, limit) as AlertHistoryRow[];
  }
  return db
    .prepare(
      `SELECT id, service_id AS serviceId, alert_type AS alertType, channel, status,
              message, recipients, created_at AS createdAt
       FROM alert_history ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as AlertHistoryRow[];
}

export interface AlertStats {
  total24h: number;
  totalFailures24h: number;
  totalRecoveries24h: number;
  totalDegraded24h: number;
  totalFailed24h: number; // send status = 'failed'
  total7d: number;
  byChannel: Record<string, number>;
}

export function getAlertStats(): AlertStats {
  const db = getDb();

  // Counts for last 24 hours
  const counts24h = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN alert_type = 'failure' THEN 1 ELSE 0 END) AS failures,
         SUM(CASE WHEN alert_type = 'recovery' THEN 1 ELSE 0 END) AS recoveries,
         SUM(CASE WHEN alert_type = 'degraded' THEN 1 ELSE 0 END) AS degraded,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS sendFailed
       FROM alert_history
       WHERE created_at >= datetime('now', '-1 day')`
    )
    .get() as { total: number; failures: number; recoveries: number; degraded: number; sendFailed: number };

  // Total for last 7 days
  const total7d = db
    .prepare(
      `SELECT COUNT(*) AS total FROM alert_history
       WHERE created_at >= datetime('now', '-7 days')`
    )
    .get() as { total: number };

  // By channel in last 24 hours
  const channelRows = db
    .prepare(
      `SELECT channel, COUNT(*) AS cnt
       FROM alert_history
       WHERE created_at >= datetime('now', '-1 day')
       GROUP BY channel`
    )
    .all() as Array<{ channel: string; cnt: number }>;

  const byChannel: Record<string, number> = {};
  for (const row of channelRows) {
    byChannel[row.channel] = row.cnt;
  }

  return {
    total24h: counts24h.total,
    totalFailures24h: counts24h.failures,
    totalRecoveries24h: counts24h.recoveries,
    totalDegraded24h: counts24h.degraded,
    totalFailed24h: counts24h.sendFailed,
    total7d: total7d.total,
    byChannel,
  };
}

// ─── Alert Cooldown Queries ─────────────────────────────────

export interface CooldownRow {
  serviceId: string;
  lastAlertAt: string;
  alertType: string;
}

export function setCooldown(serviceId: string, alertType: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO alert_cooldowns (service_id, last_alert_at, alert_type)
     VALUES (?, datetime('now'), ?)
     ON CONFLICT(service_id) DO UPDATE SET last_alert_at = datetime('now'), alert_type = ?`
  ).run(serviceId, alertType, alertType);
}

export function getCooldown(serviceId: string): CooldownRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT service_id AS serviceId, last_alert_at AS lastAlertAt, alert_type AS alertType
       FROM alert_cooldowns WHERE service_id = ?`
    )
    .get(serviceId) as CooldownRow | undefined;
  return row ?? null;
}

export function clearCooldown(serviceId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM alert_cooldowns WHERE service_id = ?`).run(serviceId);
}

export function cleanExpiredCooldowns(minutes: number): void {
  const db = getDb();
  db.prepare(
    `DELETE FROM alert_cooldowns WHERE last_alert_at < datetime('now', ? || ' minutes')`
  ).run(-minutes);
}

export function getAllCooldowns(): CooldownRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT service_id AS serviceId, last_alert_at AS lastAlertAt, alert_type AS alertType
       FROM alert_cooldowns`
    )
    .all() as CooldownRow[];
}

// ─── Team Member Queries ──────────────────────────────────────

export function createTeamMember(member: { name: string; email: string; role: string }): number {
  const db = getDb();
  const result = db
    .prepare(`INSERT INTO team_members (name, email, role) VALUES (?, ?, ?)`)
    .run(member.name, member.email, member.role);
  return result.lastInsertRowid as number;
}

export function getTeamMembers(): TeamMember[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, email, role, created_at AS createdAt
       FROM team_members ORDER BY name ASC`
    )
    .all() as TeamMember[];
}

export function getTeamMemberById(id: number): TeamMember | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, name, email, role, created_at AS createdAt
       FROM team_members WHERE id = ?`
    )
    .get(id) as TeamMember | undefined;
  return row ?? null;
}

export function updateTeamMember(id: number, updates: { name?: string; email?: string; role?: string }): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name) { fields.push("name = ?"); values.push(updates.name); }
  if (updates.email) { fields.push("email = ?"); values.push(updates.email); }
  if (updates.role) { fields.push("role = ?"); values.push(updates.role); }

  if (fields.length === 0) return;
  values.push(id);

  db.prepare(`UPDATE team_members SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteTeamMember(id: number): void {
  const db = getDb();
  db.prepare(`DELETE FROM incident_assignments WHERE assignee_id = ?`).run(id);
  db.prepare(`DELETE FROM team_members WHERE id = ?`).run(id);
}

// ─── Incident Assignment Queries ──────────────────────────────

export function createAssignment(assignment: {
  incidentId: number;
  assigneeId: number;
  notes?: string;
  deadline?: string;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO incident_assignments (incident_id, assignee_id, notes, deadline)
       VALUES (?, ?, ?, ?)`
    )
    .run(assignment.incidentId, assignment.assigneeId, assignment.notes ?? null, assignment.deadline ?? null);
  return result.lastInsertRowid as number;
}

export function getAssignments(filters?: {
  assigneeId?: number;
  incidentId?: number;
  status?: AssignmentStatus;
}): IncidentAssignment[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters?.assigneeId) { conditions.push("a.assignee_id = ?"); values.push(filters.assigneeId); }
  if (filters?.incidentId) { conditions.push("a.incident_id = ?"); values.push(filters.incidentId); }
  if (filters?.status) { conditions.push("a.status = ?"); values.push(filters.status); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return db
    .prepare(
      `SELECT a.id, a.incident_id AS incidentId, a.assignee_id AS assigneeId,
              t.name AS assigneeName, t.email AS assigneeEmail,
              i.title AS incidentTitle, i.severity AS incidentSeverity, i.service_id AS serviceId,
              a.notes, a.deadline, a.status,
              a.created_at AS createdAt, a.updated_at AS updatedAt
       FROM incident_assignments a
       JOIN team_members t ON a.assignee_id = t.id
       JOIN incidents i ON a.incident_id = i.id
       ${where}
       ORDER BY a.deadline ASC NULLS LAST, a.created_at DESC`
    )
    .all(...values) as IncidentAssignment[];
}

export function updateAssignment(id: number, updates: { status?: AssignmentStatus; notes?: string; deadline?: string }): void {
  const db = getDb();
  const fields: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];

  if (updates.status) { fields.push("status = ?"); values.push(updates.status); }
  if (updates.notes !== undefined) { fields.push("notes = ?"); values.push(updates.notes); }
  if (updates.deadline !== undefined) { fields.push("deadline = ?"); values.push(updates.deadline); }

  values.push(id);
  db.prepare(`UPDATE incident_assignments SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteAssignment(id: number): void {
  const db = getDb();
  db.prepare(`DELETE FROM incident_assignments WHERE id = ?`).run(id);
}

export function getUpcomingDeadlines(withinHours: number = 24): IncidentAssignment[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT a.id, a.incident_id AS incidentId, a.assignee_id AS assigneeId,
              t.name AS assigneeName, t.email AS assigneeEmail,
              i.title AS incidentTitle, i.severity AS incidentSeverity, i.service_id AS serviceId,
              a.notes, a.deadline, a.status,
              a.created_at AS createdAt, a.updated_at AS updatedAt
       FROM incident_assignments a
       JOIN team_members t ON a.assignee_id = t.id
       JOIN incidents i ON a.incident_id = i.id
       WHERE a.status != 'resolved'
         AND a.deadline IS NOT NULL
         AND a.deadline <= datetime('now', ? || ' hours')
         AND a.deadline >= datetime('now')
       ORDER BY a.deadline ASC`
    )
    .all(withinHours) as IncidentAssignment[];
}
