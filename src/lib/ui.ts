export type ToneKey =
  | "foreground"
  | "muted"
  | "muted-2"
  | "operational"
  | "degraded"
  | "down"
  | "maintenance"
  | "unknown";

export const pageClass = "min-h-full text-[var(--foreground)]";

export const surfaceClass =
  "border border-[color:var(--border)] bg-[var(--card)] rounded-2xl";

export const surfaceStrongClass =
  "border border-[color:var(--border)] bg-[var(--panel-strong)] rounded-2xl";

export const softSurfaceClass =
  "bg-[var(--surface-glass-soft)] rounded-xl";

export const softSurfaceInteractiveClass =
  "bg-[var(--surface-glass-soft)] rounded-xl transition-colors hover:bg-[var(--surface-glass-hover)]";

export const chipClass =
  "rounded-full border border-[color:var(--border)] bg-[var(--surface-glass-soft)]";

export const subtleChipClass =
  "rounded-full bg-[var(--surface-glass-soft)]";

export const accentButtonClass =
  "rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]";

export const mutedTextClass = "text-[var(--muted)]";
export const mutedText2Class = "text-[var(--muted-2)]";
export const foregroundTextClass = "text-[var(--foreground)]";

export const toneTextClasses: Record<ToneKey, string> = {
  foreground: "text-[var(--foreground)]",
  muted: "text-[var(--muted)]",
  "muted-2": "text-[var(--muted-2)]",
  operational: "text-[var(--color-operational)]",
  degraded: "text-[var(--color-degraded)]",
  down: "text-[var(--color-down)]",
  maintenance: "text-[var(--color-maintenance)]",
  unknown: "text-[var(--color-unknown)]",
};

export const toneSurfaceClasses: Record<Exclude<ToneKey, "foreground" | "muted" | "muted-2">, string> = {
  operational: "bg-[color-mix(in_srgb,var(--color-operational)_10%,transparent)]",
  degraded: "bg-[color-mix(in_srgb,var(--color-degraded)_10%,transparent)]",
  down: "bg-[color-mix(in_srgb,var(--color-down)_10%,transparent)]",
  maintenance: "bg-[color-mix(in_srgb,var(--color-maintenance)_10%,transparent)]",
  unknown: "bg-[color-mix(in_srgb,var(--color-unknown)_10%,transparent)]",
};

export const toneChipClasses: Record<Exclude<ToneKey, "foreground" | "muted" | "muted-2">, string> = {
  operational:
    "border border-[color:color-mix(in_srgb,var(--color-operational)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-operational)_8%,transparent)] text-[var(--color-operational)]",
  degraded:
    "border border-[color:color-mix(in_srgb,var(--color-degraded)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-degraded)_8%,transparent)] text-[var(--color-degraded)]",
  down:
    "border border-[color:color-mix(in_srgb,var(--color-down)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-down)_8%,transparent)] text-[var(--color-down)]",
  maintenance:
    "border border-[color:color-mix(in_srgb,var(--color-maintenance)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-maintenance)_8%,transparent)] text-[var(--color-maintenance)]",
  unknown:
    "border border-[color:color-mix(in_srgb,var(--color-unknown)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-unknown)_8%,transparent)] text-[var(--color-unknown)]",
};

export const toneBorderClasses: Record<Exclude<ToneKey, "foreground" | "muted" | "muted-2">, string> = {
  operational: "border-[color:color-mix(in_srgb,var(--color-operational)_16%,transparent)]",
  degraded: "border-[color:color-mix(in_srgb,var(--color-degraded)_16%,transparent)]",
  down: "border-[color:color-mix(in_srgb,var(--color-down)_16%,transparent)]",
  maintenance: "border-[color:color-mix(in_srgb,var(--color-maintenance)_16%,transparent)]",
  unknown: "border-[color:color-mix(in_srgb,var(--color-unknown)_16%,transparent)]",
};

export const pingToneClasses: Record<Exclude<ToneKey, "foreground" | "muted" | "muted-2">, string> = {
  operational: "bg-[var(--color-operational)]",
  degraded: "bg-[var(--color-degraded)]",
  down: "bg-[var(--color-down)]",
  maintenance: "bg-[var(--color-maintenance)]",
  unknown: "bg-[var(--color-unknown)]",
};

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
