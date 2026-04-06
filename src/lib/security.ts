// ============================================================
// Security helpers for production deployment behavior.
// Keeps proxy logic small and gives us pure functions we can test.
// ============================================================

export function isLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

export function getHostnameFromHostHeader(hostHeader: string | null): string {
  if (!hostHeader) return "";
  return hostHeader.replace(/:\d+$/, "");
}

export function isDashboardAuthRequiredInProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" && env.ALLOW_INSECURE_DASHBOARD !== "true";
}

export function shouldRedirectToHttps(options: {
  url: string;
  hostHeader: string | null;
  forwardedProto: string | null;
  env?: NodeJS.ProcessEnv;
  pathname?: string;
}): boolean {
  const env = options.env ?? process.env;
  if (env.NODE_ENV !== "production") return false;
  if (env.ENFORCE_HTTPS === "false") return false;
  if (options.pathname === "/api/health-status") return false;

  const hostname = getHostnameFromHostHeader(options.hostHeader) || new URL(options.url).hostname;
  if (isLocalHost(hostname)) return false;

  const proto = (options.forwardedProto || new URL(options.url).protocol.replace(":", "")).toLowerCase();
  return proto !== "https";
}
