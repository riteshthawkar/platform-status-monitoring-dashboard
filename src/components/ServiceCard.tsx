"use client";

import { useState } from "react";
import { ServiceWithStatus } from "@/types";
import StatusBadge from "./StatusBadge";
import UptimeBarChart from "./UptimeBarChart";
import {
  Bot,
  Box,
  BrainCircuit,
  ChevronDown,
  Clock3,
  Database,
  Globe,
  RefreshCw,
  Server,
  UserRound,
  Wrench,
  Zap,
} from "lucide-react";
import {
  cn,
  foregroundTextClass,
  mutedText2Class,
  mutedTextClass,
  toneChipClasses,
  toneTextClasses,
} from "@/lib/ui";

const categoryIcons: Record<string, React.ElementType> = {
  chatbot_backend: Bot,
  ai_agent_platform: BrainCircuit,
  database: Database,
  external_api: Globe,
  infrastructure: Server,
  other: Box,
};

interface ServiceCardProps {
  service: ServiceWithStatus;
  onRefresh?: (serviceId: string) => void;
  isLast?: boolean;
}

type Tone = "foreground" | "operational" | "degraded" | "down" | "maintenance";

export default function ServiceCard({ service, onRefresh, isLast }: ServiceCardProps) {
  const Icon = categoryIcons[service.category] || Box;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function toggleExpanded() {
    setExpanded((v) => !v);
  }

  async function handleRefresh(event: React.MouseEvent) {
    event.stopPropagation();
    if (!onRefresh) return;
    setIsRefreshing(true);
    await onRefresh(service.id);
    setTimeout(() => setIsRefreshing(false), 900);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleExpanded();
  }

  return (
    <div className={cn("transition-colors", !isLast && "border-b border-[color:var(--border)]")}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-[var(--surface-glass-hover)] sm:px-5"
      >
        <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1.8fr)_110px_120px_110px_120px_48px] xl:items-center xl:gap-4">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--surface-glass-soft)]">
                <Icon className={cn("h-4 w-4", mutedTextClass)} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={cn("truncate text-sm font-semibold", foregroundTextClass)}>
                    {service.name}
                  </h3>
                  {service.tags?.includes("critical") && (
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", toneChipClasses.down)}>
                      Critical
                    </span>
                  )}
                </div>

                <p className={cn("mt-0.5 truncate text-[11px]", mutedTextClass)}>
                  {service.description}
                </p>

                <div className={cn("mt-2 flex flex-wrap items-center gap-2 text-[11px]", mutedText2Class)}>
                  {service.owner ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-glass-soft)] px-2 py-0.5">
                      <UserRound className="h-3 w-3" />
                      {service.owner.memberName}
                    </span>
                  ) : (
                    <span className={cn("rounded-md px-2 py-0.5", toneChipClasses.degraded)}>
                      Owner unassigned
                    </span>
                  )}

                  {service.activeMaintenance && (
                    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5", toneChipClasses.maintenance)}>
                      <Wrench className="h-3 w-3" />
                      Until {new Date(service.activeMaintenance.endsAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DesktopMetric label="Status" value={<StatusBadge status={service.currentStatus} size="sm" />} />
          <DesktopMetric
            label="Latency"
            value={service.lastResponseTime !== null ? `${Math.round(service.lastResponseTime)}ms` : "--"}
            tone={service.lastResponseTime !== null && service.lastResponseTime <= 500 ? "operational" : service.lastResponseTime !== null && service.lastResponseTime <= 1200 ? "degraded" : "foreground"}
          />
          <DesktopMetric
            label="30d uptime"
            value={`${service.uptimePercent30d}%`}
            tone={service.uptimePercent30d >= 99.9 ? "operational" : service.uptimePercent30d >= 99 ? "degraded" : "down"}
          />
          <DesktopMetric
            label="Last check"
            value={service.lastChecked ? new Date(service.lastChecked).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--"}
          />

          <div className="flex items-center justify-between gap-2 xl:justify-end">
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-glass-soft)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-glass-hover)] hover:text-[var(--foreground)]"
              title="Run service check"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>

            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-glass-soft)] text-[var(--muted)]">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[color:var(--border)] px-4 pb-4 pt-4 sm:px-5">
          <div className="grid gap-3 md:grid-cols-3">
            <DetailMetric label="24h uptime" value={`${service.uptimePercent24h}%`} tone={uptimeTone(service.uptimePercent24h)} icon={<Clock3 className="h-4 w-4" />} />
            <DetailMetric label="7d uptime" value={`${service.uptimePercent7d}%`} tone={uptimeTone(service.uptimePercent7d)} icon={<Clock3 className="h-4 w-4" />} />
            <DetailMetric label="Check cadence" value={`Every ${service.checkIntervalSeconds}s`} tone="foreground" icon={<Zap className="h-4 w-4" />} />
          </div>

          <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-[var(--surface-glass-soft)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={cn("text-[10px] font-semibold uppercase tracking-wider", mutedText2Class)}>Recent checks</p>
                <p className={cn("mt-0.5 text-[11px]", mutedTextClass)}>
                  Latest {service.recentChecks.length} observations.
                </p>
              </div>
              <span className={cn("text-[11px]", mutedTextClass)}>{service.checkType.toUpperCase()}</span>
            </div>

            <div className="mt-3">
              <UptimeBarChart checks={service.recentChecks} />
            </div>

            {service.recentChecks[0]?.errorMessage && (
              <div className={cn("mt-3 rounded-lg px-3 py-2.5 text-[11px]", toneChipClasses.down)}>
                {service.recentChecks[0].errorMessage}
              </div>
            )}

            {service.activeMaintenance && (
              <div className={cn("mt-3 rounded-lg px-3 py-2.5 text-[11px]", toneChipClasses.maintenance)}>
                <div className="font-semibold">{service.activeMaintenance.title}</div>
                <div className="mt-1">
                  Window ends {new Date(service.activeMaintenance.endsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </div>
                {service.activeMaintenance.notes && (
                  <div className={cn("mt-1", mutedTextClass)}>{service.activeMaintenance.notes}</div>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              <MetaTag>{service.url}</MetaTag>
              <MetaTag>{service.category.replaceAll("_", " ")}</MetaTag>
              <MetaTag>{service.checkType.toUpperCase()}</MetaTag>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DesktopMetric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3 xl:block">
      <span className={cn("text-[10px] font-medium uppercase tracking-wider xl:hidden", mutedText2Class)}>{label}</span>
      <span className={cn("text-sm font-semibold", tone ? toneTextClasses[tone === "foreground" ? "foreground" : tone] : foregroundTextClass)}>
        {value}
      </span>
    </div>
  );
}

function DetailMetric({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--surface-glass-soft)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className={cn("text-[10px] font-medium uppercase tracking-wider", mutedText2Class)}>{label}</span>
        <span className={tone === "foreground" ? foregroundTextClass : toneTextClasses[tone]}>{icon}</span>
      </div>
      <div className={cn("mt-2 text-lg font-bold", tone === "foreground" ? foregroundTextClass : toneTextClasses[tone])}>{value}</div>
    </div>
  );
}

function MetaTag({ children }: { children: React.ReactNode }) {
  return (
    <span className={cn("max-w-full truncate rounded-md bg-[var(--surface-glass-soft)] px-2 py-0.5 text-[10px]", mutedTextClass)}>
      {children}
    </span>
  );
}

function uptimeTone(value: number): Tone {
  if (value >= 99.9) return "operational";
  if (value >= 99) return "degraded";
  return "down";
}
