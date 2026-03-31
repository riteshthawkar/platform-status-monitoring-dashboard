"use client";

import { Incident } from "@/types";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

interface IncidentsListProps {
  incidents: Incident[];
}

const severityConfig = {
  critical: {
    icon: AlertCircle,
    color: "text-red-400",
    bg: "bg-red-400/5",
    border: "border-red-500/20",
  },
  major: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bg: "bg-amber-400/5",
    border: "border-amber-500/20",
  },
  minor: {
    icon: Info,
    color: "text-blue-400",
    bg: "bg-blue-400/5",
    border: "border-blue-500/20",
  },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  investigating: { label: "Investigating", color: "text-red-400" },
  identified: { label: "Identified", color: "text-amber-400" },
  monitoring: { label: "Monitoring", color: "text-blue-400" },
  resolved: { label: "Resolved", color: "text-emerald-400" },
};

export default function IncidentsList({ incidents }: IncidentsListProps) {
  if (incidents.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        Active Incidents
      </h2>
      <div className="space-y-3">
        {incidents.map((incident) => {
          const severity =
            severityConfig[incident.severity] || severityConfig.minor;
          const SeverityIcon = severity.icon;
          const statusInfo =
            statusLabels[incident.status] || statusLabels.investigating;

          return (
            <div
              key={incident.id}
              className={`rounded-xl border ${severity.border} ${severity.bg} p-4`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <SeverityIcon
                    className={`w-5 h-5 mt-0.5 ${severity.color}`}
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {incident.title}
                    </h3>
                    {incident.description && (
                      <p className="text-xs text-gray-400 mt-1">
                        {incident.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span
                        className={`text-xs font-medium ${statusInfo.color}`}
                      >
                        {statusInfo.label}
                      </span>
                      <span className="text-xs text-gray-600">|</span>
                      <span className="text-xs text-gray-500">
                        Started{" "}
                        {new Date(incident.createdAt).toLocaleString()}
                      </span>
                      {incident.resolvedAt && (
                        <>
                          <span className="text-xs text-gray-600">|</span>
                          <span className="text-xs text-gray-500">
                            Resolved{" "}
                            {new Date(
                              incident.resolvedAt
                            ).toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${severity.bg} ${severity.color} font-medium`}
                >
                  {incident.severity.toUpperCase()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
