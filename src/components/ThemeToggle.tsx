"use client";

import { Moon, SunMedium } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/ui";

interface ThemeToggleProps {
  compact?: boolean;
}

export default function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl bg-[var(--surface-glass-soft)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-glass-hover)] hover:text-[var(--foreground)]",
        compact ? "h-9 w-9 justify-center" : "px-3 py-2 text-xs font-medium",
      )}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact && <span>{isDark ? "Light" : "Dark"}</span>}
    </button>
  );
}
