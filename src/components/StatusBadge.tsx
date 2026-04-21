"use client";

import { ServiceStatus } from "@/types";
import { cn } from "@/lib/ui";

const statusConfig: Record<
  ServiceStatus,
  { label: string; badgeClass: string; dotClass: string; pulse: boolean }
> = {
  operational: {
    label: "Operational",
    badgeClass: "bg-[color-mix(in_srgb,var(--color-operational)_8%,transparent)] text-[var(--color-operational)]",
    dotClass: "bg-[var(--color-operational)]",
    pulse: false,
  },
  degraded: {
    label: "Degraded",
    badgeClass: "bg-[color-mix(in_srgb,var(--color-degraded)_8%,transparent)] text-[var(--color-degraded)]",
    dotClass: "bg-[var(--color-degraded)]",
    pulse: true,
  },
  down: {
    label: "Down",
    badgeClass: "bg-[color-mix(in_srgb,var(--color-down)_8%,transparent)] text-[var(--color-down)]",
    dotClass: "bg-[var(--color-down)]",
    pulse: true,
  },
  maintenance: {
    label: "Maintenance",
    badgeClass: "bg-[color-mix(in_srgb,var(--color-maintenance)_8%,transparent)] text-[var(--color-maintenance)]",
    dotClass: "bg-[var(--color-maintenance)]",
    pulse: false,
  },
  unknown: {
    label: "Unknown",
    badgeClass: "bg-[color-mix(in_srgb,var(--color-unknown)_8%,transparent)] text-[var(--color-unknown)]",
    dotClass: "bg-[var(--color-unknown)]",
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
    sm: { text: "text-[10px]", padding: "px-2 py-0.5", dot: "h-1 w-1", gap: "gap-1" },
    md: { text: "text-xs", padding: "px-2.5 py-1", dot: "h-1.5 w-1.5", gap: "gap-1.5" },
    lg: { text: "text-sm", padding: "px-3 py-1.5", dot: "h-[7px] w-[7px]", gap: "gap-1.5" },
  };

  const s = sizeClasses[size];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium",
        s.text,
        s.padding,
        s.gap,
        config.badgeClass,
      )}
    >
      <span
        className={cn("rounded-full", s.dot, config.dotClass, config.pulse && "animate-pulse-dot")}
      />
      {config.label}
    </span>
  );
}

export function StatusDot({ status, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.unknown;
  const dotSizes = { sm: "h-1.5 w-1.5", md: "h-2 w-2", lg: "h-2.5 w-2.5" };

  return (
    <span
      className={cn("inline-block rounded-full", dotSizes[size], config.dotClass, config.pulse && "animate-pulse-dot")}
      title={config.label}
    />
  );
}
