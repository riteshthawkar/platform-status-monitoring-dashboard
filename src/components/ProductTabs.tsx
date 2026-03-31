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
  activeTab: string; // "all" or a group id
  onTabChange: (tabId: string) => void;
  groupCounts: Record<string, { total: number; operational: number; down: number; degraded: number }>;
}

export default function ProductTabs({ groups, activeTab, onTabChange, groupCounts }: ProductTabsProps) {
  const allCounts = groupCounts["all"] || { total: 0, operational: 0, down: 0, degraded: 0 };

  return (
    <div className="mb-6">
      <nav className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {/* All Services tab */}
        <TabButton
          id="all"
          label="All Services"
          icon={LayoutGrid}
          color="gray"
          isActive={activeTab === "all"}
          count={allCounts.total}
          operational={allCounts.operational}
          hasIssues={allCounts.down > 0 || allCounts.degraded > 0}
          onClick={() => onTabChange("all")}
        />

        {/* Product group tabs */}
        {groups.map((group) => {
          const Icon = iconMap[group.icon] || Globe;
          const counts = groupCounts[group.id] || { total: 0, operational: 0, down: 0, degraded: 0 };
          return (
            <TabButton
              key={group.id}
              id={group.id}
              label={group.shortName}
              icon={Icon}
              color={group.color}
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
  color: string;
  isActive: boolean;
  count: number;
  operational: number;
  hasIssues: boolean;
  onClick: () => void;
}

const colorMap: Record<string, { active: string; hover: string; border: string; text: string; dot: string }> = {
  gray: {
    active: "bg-gray-800 border-gray-600",
    hover: "hover:bg-gray-800/50 hover:border-gray-700",
    border: "border-gray-800",
    text: "text-gray-300",
    dot: "bg-gray-400",
  },
  violet: {
    active: "bg-violet-500/15 border-violet-500/50",
    hover: "hover:bg-violet-500/5 hover:border-violet-500/30",
    border: "border-gray-800",
    text: "text-violet-300",
    dot: "bg-violet-400",
  },
  sky: {
    active: "bg-sky-500/15 border-sky-500/50",
    hover: "hover:bg-sky-500/5 hover:border-sky-500/30",
    border: "border-gray-800",
    text: "text-sky-300",
    dot: "bg-sky-400",
  },
  rose: {
    active: "bg-rose-500/15 border-rose-500/50",
    hover: "hover:bg-rose-500/5 hover:border-rose-500/30",
    border: "border-gray-800",
    text: "text-rose-300",
    dot: "bg-rose-400",
  },
  amber: {
    active: "bg-amber-500/15 border-amber-500/50",
    hover: "hover:bg-amber-500/5 hover:border-amber-500/30",
    border: "border-gray-800",
    text: "text-amber-300",
    dot: "bg-amber-400",
  },
};

function TabButton({ label, icon: Icon, color, isActive, count, operational, hasIssues, onClick }: TabButtonProps) {
  const colors = colorMap[color] || colorMap.gray;

  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium
        transition-all duration-200 whitespace-nowrap flex-shrink-0
        ${isActive ? `${colors.active} ${colors.text}` : `${colors.border} text-gray-500 ${colors.hover}`}
      `}
    >
      <Icon className={`w-4 h-4 ${isActive ? colors.text : "text-gray-500"}`} />
      <span>{label}</span>

      {/* Count badge */}
      <span
        className={`
          inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md
          ${isActive ? "bg-white/10" : "bg-gray-800/80"}
        `}
      >
        {hasIssues ? (
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse-dot" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        )}
        {operational}/{count}
      </span>
    </button>
  );
}
