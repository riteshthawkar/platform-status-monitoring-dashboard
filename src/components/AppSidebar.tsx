"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { serviceGroups } from "@/lib/services-config";
import { brandIcon, getGroupNavIcon, portfolioIcon, teamIcon } from "@/lib/navigation-icons";
import { cn, foregroundTextClass, mutedText2Class, mutedTextClass, softSurfaceClass } from "@/lib/ui";

const primaryLinks = [
  { href: "/", label: "Portfolio", icon: portfolioIcon },
  { href: "/team", label: "Team & Ops", icon: teamIcon },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const BrandIcon = brandIcon;

  return (
    <>
      {/* Mobile: horizontal pill nav */}
      <div className="lg:hidden">
        <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
            <BrandIcon className="h-4 w-4" />
          </div>
          <span className={cn("text-sm font-semibold", foregroundTextClass)}>LAWA</span>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {primaryLinks.map((link) => (
            <MobilePill
              key={link.href}
              href={link.href}
              label={link.label}
              active={pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))}
              icon={link.icon}
            />
          ))}
          {serviceGroups.map((group) => (
            <MobilePill
              key={group.id}
              href={`/projects/${group.id}`}
              label={group.shortName}
              active={pathname === `/projects/${group.id}`}
              icon={getGroupNavIcon(group.id)}
            />
          ))}
        </div>
      </div>

      {/* Desktop: icon-only narrow rail */}
      <aside className="hidden lg:block">
        <div className="sticky top-4 flex flex-col items-center gap-1 rounded-2xl border border-[color:var(--border)] bg-[var(--sidebar-bg)] px-2 py-4">
          {/* Brand */}
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-white accent-glow">
            <BrandIcon className="h-4.5 w-4.5" />
          </div>

          {/* Divider */}
          <div className="mb-2 h-px w-6 bg-[var(--border)]" />

          {/* Primary nav */}
          {primaryLinks.map((link) => (
            <SidebarIcon
              key={link.href}
              href={link.href}
              label={link.label}
              icon={link.icon}
              active={pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))}
            />
          ))}

          {/* Divider */}
          <div className="my-2 h-px w-6 bg-[var(--border)]" />

          {/* Project nav */}
          {serviceGroups.map((group) => (
            <SidebarIcon
              key={group.id}
              href={`/projects/${group.id}`}
              label={group.shortName}
              icon={getGroupNavIcon(group.id)}
              active={pathname === `/projects/${group.id}`}
            />
          ))}
        </div>
      </aside>
    </>
  );
}

function SidebarIcon({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--sidebar-icon)] hover:bg-[var(--surface-glass-hover)] hover:text-[var(--foreground)]",
      )}
      title={label}
    >
      <Icon className="h-[18px] w-[18px]" />
      {active && (
        <span className="absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--accent)]" />
      )}
      {/* Tooltip */}
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-[var(--foreground)] px-2.5 py-1.5 text-xs font-medium text-[var(--background)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </Link>
  );
}

function MobilePill({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium transition-colors",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "bg-[var(--surface-glass-soft)] text-[var(--muted)] hover:text-[var(--foreground)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
