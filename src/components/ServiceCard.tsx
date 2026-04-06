"use client";

import { ServiceWithStatus } from "@/types";
import StatusBadge from "./StatusBadge";
import UptimeBarChart from "./UptimeBarChart";
import {
  Bot,
  BrainCircuit,
  Database,
  Globe,
  Server,
  Box,
  Clock,
  Zap,
  RefreshCw,
  UserRound,
  Wrench,
} from "lucide-react";
import { useState } from "react";

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

export default function ServiceCard({ service, onRefresh, isLast }: ServiceCardProps) {
  const Icon = categoryIcons[service.category] || Box;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    if (onRefresh) await onRefresh(service.id);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <div
      className="group cursor-pointer transition-colors"
      style={{
        background: "var(--card)",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
      }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--card-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--card)"; }}
    >
      {/* Main row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: "var(--muted-2)" }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-medium truncate" style={{ color: "var(--foreground)" }}>
                {service.name}
              </h3>
              {service.tags?.includes("critical") && (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{
                    color: "var(--color-degraded)",
                    background: "color-mix(in srgb, var(--color-degraded) 10%, transparent)",
                  }}
                >
                  PRIORITY
                </span>
              )}
            </div>
            <p className="text-[11px] truncate" style={{ color: "var(--muted-2)" }}>
              {service.description}
            </p>
            {(service.owner || service.activeMaintenance) && (
              <div className="flex items-center gap-2 mt-1 text-[10px] flex-wrap" style={{ color: "var(--muted-2)" }}>
                {service.owner && (
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="w-3 h-3" />
                    {service.owner.memberName}
                  </span>
                )}
                {service.activeMaintenance && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                    style={{
                      color: "var(--color-maintenance)",
                      background: "color-mix(in srgb, var(--color-maintenance) 10%, transparent)",
                    }}
                  >
                    <Wrench className="w-3 h-3" />
                    Until {new Date(service.activeMaintenance.endsAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 ml-4">
          {/* Response time */}
          {service.lastResponseTime !== null && (
            <div className="hidden sm:flex items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
              <Zap className="w-3 h-3" />
              {Math.round(service.lastResponseTime)}ms
            </div>
          )}

          {/* Uptime */}
          <div className="hidden md:flex items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
            <Clock className="w-3 h-3" />
            {service.uptimePercent30d}%
          </div>

          {/* Status badge */}
          <StatusBadge status={service.currentStatus} size="sm" />

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all"
            style={{ color: "var(--muted)" }}
            title="Check now"
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3.5" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <UptimeStat label="24h Uptime" value={service.uptimePercent24h} />
            <UptimeStat label="7d Uptime" value={service.uptimePercent7d} />
            <UptimeStat label="30d Uptime" value={service.uptimePercent30d} />
          </div>

          <div className="mt-3">
            <p className="text-[11px] mb-1" style={{ color: "var(--muted-2)" }}>
              Recent checks ({service.recentChecks.length})
            </p>
            <UptimeBarChart checks={service.recentChecks} />
          </div>

          {service.recentChecks[0]?.errorMessage && (
            <div
              className="mt-3 px-3 py-2 rounded-md text-xs"
              style={{
                color: "var(--color-down)",
                background: "color-mix(in srgb, var(--color-down) 6%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-down) 12%, transparent)",
              }}
            >
              {service.recentChecks[0].errorMessage}
            </div>
          )}

          {service.activeMaintenance && (
            <div
              className="mt-3 px-3 py-2 rounded-md text-xs"
              style={{
                color: "var(--color-maintenance)",
                background: "color-mix(in srgb, var(--color-maintenance) 8%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-maintenance) 18%, transparent)",
              }}
            >
              <div className="font-medium mb-1">{service.activeMaintenance.title}</div>
              <div>
                Maintenance window until{" "}
                {new Date(service.activeMaintenance.endsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </div>
              {service.activeMaintenance.notes && (
                <div className="mt-1" style={{ color: "var(--muted)" }}>
                  {service.activeMaintenance.notes}
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <MetaTag>{service.checkType.toUpperCase()}</MetaTag>
            <MetaTag>Every {service.checkIntervalSeconds}s</MetaTag>
            <MetaTag>{service.url}</MetaTag>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded truncate max-w-[220px]"
      style={{
        background: "var(--background-secondary)",
        color: "var(--muted-2)",
      }}
    >
      {children}
    </span>
  );
}

function UptimeStat({ label, value }: { label: string; value: number }) {
  const color =
    value >= 99.9
      ? "var(--color-operational)"
      : value >= 99
        ? "var(--color-degraded)"
        : "var(--color-down)";

  return (
    <div className="rounded-md p-2 text-center" style={{ background: "var(--background-secondary)" }}>
      <p className="text-base font-semibold" style={{ color }}>{value}%</p>
      <p className="text-[10px]" style={{ color: "var(--muted-2)" }}>{label}</p>
    </div>
  );
}
