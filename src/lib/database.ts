// ============================================================
// SQLite Database Layer
// Stores health check history and incidents
// ============================================================

import Database from "better-sqlite3";
import path from "path";
import { HealthCheckResult, Incident, IncidentUpdate, UptimeBar } from "@/types";

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
