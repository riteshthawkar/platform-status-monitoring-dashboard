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
}

export default function ServiceCard({ service, onRefresh }: ServiceCardProps) {
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
      className="group rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-gray-900/80
                 hover:border-gray-700 transition-all duration-200 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Main row */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-gray-800/50">
            <Icon className="w-5 h-5 text-gray-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white truncate">
                {service.name}
              </h3>
              {service.tags?.includes("critical") && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">
                  CRITICAL
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">
              {service.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 ml-4">
          {/* Response time */}
          {service.lastResponseTime !== null && (
            <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400">
              <Zap className="w-3 h-3" />
              <span>{Math.round(service.lastResponseTime)}ms</span>
            </div>
          )}

          {/* Uptime */}
          <div className="hidden md:flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            <span>{service.uptimePercent30d}%</span>
          </div>

          {/* Status badge */}
          <StatusBadge status={service.currentStatus} size="sm" />

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-700 transition-all"
            title="Check now"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-gray-400 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800/50">
          <div className="mt-3 grid grid-cols-3 gap-3">
            <UptimeStat label="24h Uptime" value={service.uptimePercent24h} />
            <UptimeStat label="7d Uptime" value={service.uptimePercent7d} />
            <UptimeStat label="30d Uptime" value={service.uptimePercent30d} />
          </div>

          {/* Mini uptime bars from recent checks */}
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-1">
              Recent checks (last {service.recentChecks.length})
            </p>
            <UptimeBarChart checks={service.recentChecks} />
          </div>

          {/* Latest error */}
          {service.recentChecks[0]?.errorMessage && (
            <div className="mt-3 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
              <p className="text-xs text-red-400">
                {service.recentChecks[0].errorMessage}
              </p>
            </div>
          )}

          {/* Service info */}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
              {service.checkType.toUpperCase()}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
              Every {service.checkIntervalSeconds}s
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 truncate max-w-[200px]">
              {service.url}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function UptimeStat({ label, value }: { label: string; value: number }) {
  const color =
    value >= 99.9
      ? "text-emerald-400"
      : value >= 99
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="rounded-lg bg-gray-800/30 p-2 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}%</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}
