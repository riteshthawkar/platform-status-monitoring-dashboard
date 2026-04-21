"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { getGroupById } from "@/lib/services-config";
import ThemeToggle from "./ThemeToggle";
import { cn, foregroundTextClass, mutedTextClass } from "@/lib/ui";

export default function AppHeader() {
  const pathname = usePathname();

  const meta = useMemo(() => {
    if (pathname === "/") {
      return {
        greeting: "Operations Dashboard",
        subtitle: "Monitor project health, incidents, and service coverage at a glance.",
      };
    }

    if (pathname === "/team") {
      return {
        greeting: "Team Operations",
        subtitle: "Ownership, assignments, and coordination.",
      };
    }

    if (pathname.startsWith("/projects/")) {
      const groupId = pathname.split("/")[2];
      const group = getGroupById(groupId);
      return {
        greeting: group?.name || "Project Dashboard",
        subtitle: group?.description || "Focused service monitoring.",
      };
    }

    if (pathname.startsWith("/incidents/")) {
      return {
        greeting: "Incident Response",
        subtitle: "Track ownership, updates, and recovery.",
      };
    }

    return {
      greeting: "Operations",
      subtitle: "Platform monitoring and coordination.",
    };
  }, [pathname]);

  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <header className="mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={cn("text-xs font-medium", mutedTextClass)}>{todayLabel}</p>
          <h1 className={cn("mt-2 text-2xl font-bold tracking-tight sm:text-3xl", foregroundTextClass)}>
            {meta.greeting}
          </h1>
          <p className={cn("mt-1 text-sm", mutedTextClass)}>
            {meta.subtitle}
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 self-start">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-glass-soft)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-glass-hover)] hover:text-[var(--foreground)]"
            title="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <ThemeToggle compact />
        </div>
      </div>
    </header>
  );
}
