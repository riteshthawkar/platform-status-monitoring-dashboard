"use client";

import { ServiceStatus } from "@/types";

const statusConfig: Record<
  ServiceStatus,
  { label: string; color: string; bgColor: string; dotColor: string; pulse: boolean }
> = {
  operational: {
    label: "Operational",
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
    dotColor: "bg-emerald-400",
    pulse: false,
  },
  degraded: {
    label: "Degraded",
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
    dotColor: "bg-amber-400",
    pulse: true,
  },
  down: {
    label: "Down",
    color: "text-red-400",
    bgColor: "bg-red-400/10",
    dotColor: "bg-red-400",
    pulse: true,
  },
  maintenance: {
    label: "Maintenance",
    color: "text-indigo-400",
    bgColor: "bg-indigo-400/10",
    dotColor: "bg-indigo-400",
    pulse: false,
  },
  unknown: {
    label: "Unknown",
    color: "text-gray-400",
    bgColor: "bg-gray-400/10",
    dotColor: "bg-gray-400",
    pulse: false,
  },
};

interface StatusBadgeProps {
  status: ServiceStatus;
  size?: "sm" | "md" | "lg";
}

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.unknown;

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const dotSizes = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-2.5 h-2.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.color} ${config.bgColor} ${sizeClasses[size]}`}
    >
      <span
        className={`rounded-full ${config.dotColor} ${dotSizes[size]} ${config.pulse ? "animate-pulse-dot" : ""}`}
      />
      {config.label}
    </span>
  );
}

export function StatusDot({ status, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.unknown;
  const dotSizes = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  return (
    <span
      className={`inline-block rounded-full ${config.dotColor} ${dotSizes[size]} ${config.pulse ? "animate-pulse-dot" : ""}`}
      title={config.label}
    />
  );
}
