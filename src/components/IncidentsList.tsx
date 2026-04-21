"use client";

import Link from "next/link";
import { Incident } from "@/types";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn, foregroundTextClass, mutedText2Class, mutedTextClass, toneChipClasses, toneSurfaceClasses, toneTextClasses } from "@/lib/ui";

interface IncidentsListProps {
  incidents: Incident[];
}

const severityConfig = {
  critical: { icon: AlertCircle, tone: "down" as const },
  major: { icon: AlertTriangle, tone: "degraded" as const },
  minor: { icon: Info, tone: "maintenance" as const },
};

const statusLabels: Record<string, { label: string; tone: "down" | "degraded" | "maintenance" | "operational" }> = {
  investigating: { label: "Investigating", tone: "down" },
  identified: { label: "Identified", tone: "degraded" },
  monitoring: { label: "Monitoring", tone: "maintenance" },
  resolved: { label: "Resolved", tone: "operational" },
};

export default function IncidentsList({ incidents }: IncidentsListProps) {
  if (incidents.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className={cn("text-sm font-semibold", foregroundTextClass)}>Active Incidents</h3>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[10px] font-semibold",
            incidents.length > 0 ? toneChipClasses.degraded : "bg-[var(--surface-glass-soft)] text-[var(--muted)]",
          )}
        >
          {incidents.length}
        </span>
      </div>

      <div className="space-y-2">
        {incidents.map((incident) => {
          const severity = severityConfig[incident.severity] || severityConfig.minor;
          const statusInfo = statusLabels[incident.status] || statusLabels.investigating;
          const SeverityIcon = severity.icon;
          const isAcknowledged = !!incident.acknowledgedAt;

          return (
            <Link
              key={incident.id}
              href={`/incidents/${incident.id}`}
              className="block rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-3 transition-colors hover:bg-[var(--surface-glass-hover)]"
            >
              <div className="flex items-start gap-3">
                <div className={cn("mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg", toneSurfaceClasses[severity.tone], toneTextClasses[severity.tone])}>
                  <SeverityIcon className="h-3.5 w-3.5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("truncate text-sm font-medium", foregroundTextClass)}>
                      {incident.title}
                    </p>
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", toneChipClasses[severity.tone])}>
                      {incident.severity}
                    </span>
                  </div>

                  {incident.description && (
                    <p className={cn("mt-1 text-[11px] leading-5", mutedTextClass)}>
                      {incident.description}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className={cn("rounded-md px-1.5 py-0.5 font-semibold uppercase tracking-wider", toneChipClasses[statusInfo.tone])}>
                      {statusInfo.label}
                    </span>
                    <span className={cn("rounded-md px-1.5 py-0.5", isAcknowledged ? toneChipClasses.operational : toneChipClasses.degraded)}>
                      {isAcknowledged ? `Ack: ${incident.acknowledgedByName || "team"}` : "Awaiting ack"}
                    </span>
                    <span className={cn("rounded-md bg-[var(--surface-glass-soft)] px-1.5 py-0.5", incident.ownerMemberName ? foregroundTextClass : mutedTextClass)}>
                      {incident.ownerMemberName ? `On-call: ${incident.ownerMemberName}` : "Unassigned"}
                    </span>
                  </div>

                  <p className={cn("mt-2 text-[10px]", mutedText2Class)}>
                    Started {new Date(incident.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
