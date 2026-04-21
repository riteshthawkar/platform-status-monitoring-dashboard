"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "lawa-dashboard-theme";
let hasWarnedMissingThemeProvider = false;

function resolveThemeFromDom(): Theme {
  if (typeof window === "undefined") return "light";

  const attrTheme = document.documentElement.dataset.theme;
  if (attrTheme === "light" || attrTheme === "dark") return attrTheme;

  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      setThemeState(storedTheme);
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeState(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: setThemeState,
    toggleTheme: () => setThemeState((current) => (current === "light" ? "dark" : "light")),
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  const [fallbackTheme, setFallbackTheme] = useState<Theme>(() => resolveThemeFromDom());

  useEffect(() => {
    if (context || typeof window === "undefined") return;

    const syncTheme = () => setFallbackTheme(resolveThemeFromDom());
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === "data-theme")) {
        syncTheme();
      }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("storage", syncTheme);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", syncTheme);
    };
  }, [context]);

  if (context) {
    return context;
  }

  if (!hasWarnedMissingThemeProvider && process.env.NODE_ENV !== "production") {
    hasWarnedMissingThemeProvider = true;
    console.warn("useTheme fallback activated: ThemeProvider context not found.");
  }

  const setTheme = (theme: Theme) => {
    applyTheme(theme);
    setFallbackTheme(theme);
  };

  return {
    theme: fallbackTheme,
    setTheme,
    toggleTheme: () => setTheme(fallbackTheme === "light" ? "dark" : "light"),
  };
}
