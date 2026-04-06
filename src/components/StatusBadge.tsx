"use client";

import { ServiceStatus } from "@/types";

const statusConfig: Record<
  ServiceStatus,
  { label: string; color: string; dotColor: string; pulse: boolean }
> = {
  operational: {
    label: "Operational",
    color: "var(--color-operational)",
    dotColor: "var(--color-operational)",
    pulse: false,
  },
  degraded: {
    label: "Degraded",
    color: "var(--color-degraded)",
    dotColor: "var(--color-degraded)",
    pulse: true,
  },
  down: {
    label: "Down",
    color: "var(--color-down)",
    dotColor: "var(--color-down)",
    pulse: true,
  },
  maintenance: {
    label: "Maintenance",
    color: "var(--color-maintenance)",
    dotColor: "var(--color-maintenance)",
    pulse: false,
  },
  unknown: {
    label: "Unknown",
    color: "var(--color-unknown)",
    dotColor: "var(--color-unknown)",
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
    sm: { text: "text-[11px]", px: "6px 8px", dot: 5, gap: 5 },
    md: { text: "text-xs", px: "6px 10px", dot: 6, gap: 6 },
    lg: { text: "text-sm", px: "8px 12px", dot: 7, gap: 6 },
  };

  const s = sizeClasses[size];

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${s.text}`}
      style={{
        padding: s.px,
        color: config.color,
        background: `color-mix(in srgb, ${config.color} 10%, transparent)`,
        gap: s.gap,
      }}
    >
      <span
        className={`rounded-full ${config.pulse ? "animate-pulse-dot" : ""}`}
        style={{
          width: s.dot,
          height: s.dot,
          background: config.dotColor,
        }}
      />
      {config.label}
    </span>
  );
}

export function StatusDot({ status, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.unknown;
  const dotSizes = { sm: 6, md: 8, lg: 10 };

  return (
    <span
      className={`inline-block rounded-full ${config.pulse ? "animate-pulse-dot" : ""}`}
      style={{
        width: dotSizes[size],
        height: dotSizes[size],
        background: config.dotColor,
      }}
      title={config.label}
    />
  );
}
