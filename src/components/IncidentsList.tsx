"use client";

import Link from "next/link";
import { Incident } from "@/types";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

interface IncidentsListProps {
  incidents: Incident[];
}

const severityConfig = {
  critical: { icon: AlertCircle, color: "var(--color-down)" },
  major: { icon: AlertTriangle, color: "var(--color-degraded)" },
  minor: { icon: Info, color: "var(--color-maintenance)" },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  investigating: { label: "Investigating", color: "var(--color-down)" },
  identified: { label: "Identified", color: "var(--color-degraded)" },
  monitoring: { label: "Monitoring", color: "var(--color-maintenance)" },
  resolved: { label: "Resolved", color: "var(--color-operational)" },
};

export default function IncidentsList({ incidents }: IncidentsListProps) {
  if (incidents.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[13px] font-semibold flex items-center gap-2" style={{ color: "var(--foreground)" }}>
          <AlertTriangle className="w-4 h-4" style={{ color: "var(--color-degraded)" }} />
          Active Incidents
        </h2>
        <span
          className="text-[11px] px-2 py-1 rounded-full"
          style={{
            color: incidents.length > 0 ? "var(--color-degraded)" : "var(--muted)",
            background: "color-mix(in srgb, var(--color-degraded) 10%, transparent)",
          }}
        >
          {incidents.length}
        </span>
      </div>
      <div
        className="rounded-[22px] overflow-hidden"
        style={{
          border: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--panel) 90%, transparent)",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        {incidents.map((incident, i) => {
          const severity = severityConfig[incident.severity] || severityConfig.minor;
          const SeverityIcon = severity.icon;
          const statusInfo = statusLabels[incident.status] || statusLabels.investigating;
          const isAcknowledged = !!incident.acknowledgedAt;

          return (
            <div
              key={incident.id}
              className="flex items-start gap-3 px-4 py-3"
              style={{
                background: "var(--card)",
                borderBottom: i < incidents.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <SeverityIcon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: severity.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/incidents/${incident.id}`}
                    className="text-[13px] font-medium hover:underline"
                    style={{ color: "var(--foreground)" }}
                  >
                    {incident.title}
                  </Link>
                  <span
                    className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded"
                    style={{
                      color: severity.color,
                      background: `color-mix(in srgb, ${severity.color} 10%, transparent)`,
                    }}
                  >
                    {incident.severity}
                  </span>
                </div>
                {incident.description && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    {incident.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{
                      color: isAcknowledged ? "var(--color-operational)" : "var(--color-degraded)",
                      background: isAcknowledged
                        ? "color-mix(in srgb, var(--color-operational) 10%, transparent)"
                        : "color-mix(in srgb, var(--color-degraded) 10%, transparent)",
                    }}
                  >
                    {isAcknowledged
                      ? `Acknowledged by ${incident.acknowledgedByName || "team member"}`
                      : "Awaiting acknowledgement"}
                  </span>
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{
                      color: incident.ownerMemberName ? "var(--foreground)" : "var(--muted)",
                      background: "var(--background-secondary)",
                    }}
                  >
                    {incident.ownerMemberName ? `On-call: ${incident.ownerMemberName}` : "On-call unassigned"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[11px]" style={{ color: "var(--muted-2)" }}>
                  <span style={{ color: statusInfo.color }} className="font-medium">{statusInfo.label}</span>
                  <span>&middot;</span>
                  <span>Started {new Date(incident.createdAt).toLocaleString()}</span>
                  {incident.acknowledgedAt && (
                    <>
                      <span>&middot;</span>
                      <span>Acknowledged {new Date(incident.acknowledgedAt).toLocaleString()}</span>
                    </>
                  )}
                  {incident.resolvedAt && (
                    <>
                      <span>&middot;</span>
                      <span>Resolved {new Date(incident.resolvedAt).toLocaleString()}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
