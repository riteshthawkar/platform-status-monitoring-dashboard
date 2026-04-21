"use client";

import Link from "next/link";
import { MaintenanceWindow } from "@/types";
import { Clock3, ExternalLink, Wrench } from "lucide-react";
import { cn, foregroundTextClass, mutedTextClass, toneChipClasses, toneSurfaceClasses, toneTextClasses } from "@/lib/ui";

interface MaintenanceListProps {
  windows: MaintenanceWindow[];
}

export default function MaintenanceList({ windows }: MaintenanceListProps) {
  if (windows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className={cn("text-sm font-semibold", foregroundTextClass)}>Maintenance</h3>
        <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold", toneChipClasses.maintenance)}>
          {windows.length}
        </span>
      </div>

      <div className="space-y-2">
        {windows.map((window) => (
          <div
            key={window.id}
            className="rounded-xl bg-[var(--surface-glass-soft)] px-3.5 py-3"
          >
            <div className="flex items-start gap-3">
              <div className={cn("mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg", toneSurfaceClasses.maintenance, toneTextClasses.maintenance)}>
                <Wrench className="h-3.5 w-3.5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("text-sm font-medium", foregroundTextClass)}>
                    {window.title}
                  </p>
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", toneChipClasses.maintenance)}>
                    {window.serviceName}
                  </span>
                </div>

                {window.notes && (
                  <p className={cn("mt-1 text-[11px] leading-5", mutedTextClass)}>{window.notes}</p>
                )}

                <div className={cn("mt-2 flex flex-wrap items-center gap-2 text-[11px]", mutedTextClass)}>
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-glass-soft)] px-2 py-0.5">
                    <Clock3 className="h-3 w-3" />
                    Until {new Date(window.endsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  <Link href="/team" className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-glass-soft)] px-2 py-0.5 hover:text-[var(--foreground)]">
                    Manage
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
