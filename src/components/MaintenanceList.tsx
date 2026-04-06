"use client";

import Link from "next/link";
import { MaintenanceWindow } from "@/types";
import { Wrench, Clock, ExternalLink } from "lucide-react";

interface MaintenanceListProps {
  windows: MaintenanceWindow[];
}

export default function MaintenanceList({ windows }: MaintenanceListProps) {
  if (windows.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[13px] font-semibold flex items-center gap-2" style={{ color: "var(--foreground)" }}>
          <Wrench className="w-4 h-4" style={{ color: "var(--color-maintenance)" }} />
          Active Maintenance
        </h2>
        <span
          className="text-[11px] px-2 py-1 rounded-full"
          style={{
            color: "var(--color-maintenance)",
            background: "color-mix(in srgb, var(--color-maintenance) 10%, transparent)",
          }}
        >
          {windows.length}
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
        {windows.map((window, index) => (
          <div
            key={window.id}
            className="flex items-start gap-3 px-4 py-3"
            style={{
              background: "var(--card)",
              borderBottom: index < windows.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            <div
              className="mt-0.5 rounded-md p-1.5"
              style={{ background: "color-mix(in srgb, var(--color-maintenance) 12%, transparent)" }}
            >
              <Wrench className="w-3.5 h-3.5" style={{ color: "var(--color-maintenance)" }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[13px] font-medium" style={{ color: "var(--foreground)" }}>
                  {window.title}
                </h3>
                <span
                  className="text-[10px] uppercase px-1.5 py-0.5 rounded"
                  style={{
                    color: "var(--color-maintenance)",
                    background: "color-mix(in srgb, var(--color-maintenance) 10%, transparent)",
                  }}
                >
                  {window.serviceName}
                </span>
              </div>

              {window.notes && (
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {window.notes}
                </p>
              )}

              <div className="flex items-center gap-2 mt-1.5 text-[11px] flex-wrap" style={{ color: "var(--muted-2)" }}>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Until {new Date(window.endsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </span>
                <span>&middot;</span>
                <Link href="/team" className="inline-flex items-center gap-1 hover:underline">
                  Manage
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
