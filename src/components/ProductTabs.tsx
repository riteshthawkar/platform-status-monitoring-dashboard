"use client";

import { ServiceGroup } from "@/types";
import {
  LayoutGrid,
  GraduationCap,
  Landmark,
  Globe,
  BrainCircuit,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  GraduationCap,
  Landmark,
  Globe,
  BrainCircuit,
  LayoutGrid,
};

interface ProductTabsProps {
  groups: ServiceGroup[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  groupCounts: Record<string, { total: number; operational: number; down: number; degraded: number }>;
}

export default function ProductTabs({ groups, activeTab, onTabChange, groupCounts }: ProductTabsProps) {
  const allCounts = groupCounts["all"] || { total: 0, operational: 0, down: 0, degraded: 0 };

  return (
    <div
      className="mb-6 rounded-[22px] p-2 overflow-hidden"
      style={{
        background: "color-mix(in srgb, var(--panel) 92%, transparent)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      <nav className="flex gap-2 overflow-x-auto">
        <TabButton
          id="all"
          label="All Services"
          icon={LayoutGrid}
          isActive={activeTab === "all"}
          count={allCounts.total}
          operational={allCounts.operational}
          hasIssues={allCounts.down > 0 || allCounts.degraded > 0}
          onClick={() => onTabChange("all")}
        />

        {groups.map((group) => {
          const Icon = iconMap[group.icon] || Globe;
          const counts = groupCounts[group.id] || { total: 0, operational: 0, down: 0, degraded: 0 };
          return (
            <TabButton
              key={group.id}
              id={group.id}
              label={group.shortName}
              icon={Icon}
              isActive={activeTab === group.id}
              count={counts.total}
              operational={counts.operational}
              hasIssues={counts.down > 0 || counts.degraded > 0}
              onClick={() => onTabChange(group.id)}
            />
          );
        })}
      </nav>
    </div>
  );
}

interface TabButtonProps {
  id: string;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  count: number;
  operational: number;
  hasIssues: boolean;
  onClick: () => void;
}

function TabButton({ label, icon: Icon, isActive, count, operational, hasIssues, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium transition-all whitespace-nowrap flex-shrink-0 rounded-2xl"
      style={{
        color: isActive ? "var(--foreground)" : "var(--muted)",
        background: isActive ? "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))" : "transparent",
        border: isActive ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = "var(--foreground)";
          e.currentTarget.style.background = "rgba(255,255,255,0.03)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = "var(--muted)";
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
      <span
        className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded"
        style={{
          background: isActive ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
          color: isActive ? "var(--foreground)" : "var(--muted-2)",
        }}
      >
        {hasIssues ? (
          <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: "var(--color-down)" }} />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-operational)" }} />
        )}
        {operational}/{count}
      </span>
    </button>
  );
}
