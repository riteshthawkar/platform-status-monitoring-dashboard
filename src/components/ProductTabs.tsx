"use client";

import type { ElementType } from "react";
import { ServiceGroup } from "@/types";
import { allProductsIcon, getGroupNavIcon } from "@/lib/navigation-icons";
import { cn, foregroundTextClass, mutedTextClass } from "@/lib/ui";

interface ProductTabsProps {
  groups: ServiceGroup[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  groupCounts: Record<string, { total: number; operational: number; down: number; degraded: number }>;
}

export default function ProductTabs({ groups, activeTab, onTabChange, groupCounts }: ProductTabsProps) {
  const allCounts = groupCounts.all || { total: 0, operational: 0, down: 0, degraded: 0 };

  return (
    <nav className="flex gap-1.5 overflow-x-auto pb-1">
      <ScopeButton
        label="All"
        icon={allProductsIcon}
        isActive={activeTab === "all"}
        meta={`${allCounts.total}`}
        onClick={() => onTabChange("all")}
      />

      {groups.map((group) => {
        const Icon = getGroupNavIcon(group.id);
        const counts = groupCounts[group.id] || { total: 0, operational: 0, down: 0, degraded: 0 };

        return (
          <ScopeButton
            key={group.id}
            label={group.shortName}
            icon={Icon}
            isActive={activeTab === group.id}
            meta={`${counts.total}`}
            onClick={() => onTabChange(group.id)}
          />
        );
      })}
    </nav>
  );
}

function ScopeButton({
  label,
  icon: Icon,
  isActive,
  meta,
  onClick,
}: {
  label: string;
  icon: ElementType;
  isActive: boolean;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-w-fit items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-colors",
        isActive
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : cn("bg-[var(--surface-glass-soft)]", mutedTextClass, "hover:text-[var(--foreground)]"),
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", isActive ? "text-[var(--accent)]" : "")} />
      <span>{label}</span>
      <span
        className={cn(
          "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
          isActive
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--surface-glass-soft)] text-[var(--muted-2)]",
        )}
      >
        {meta}
      </span>
    </button>
  );
}
