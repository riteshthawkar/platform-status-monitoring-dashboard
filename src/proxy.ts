import { NextRequest, NextResponse } from "next/server";
import {
  hasValidApiKey,
  hasValidDashboardCredentials,
  isApiKeyConfigured,
  isDashboardAuthConfigured,
} from "@/lib/auth";
import { isDashboardAuthRequiredInProduction, shouldRedirectToHttps } from "@/lib/security";

function buildBasicAuthChallenge(body: BodyInit | null, isJson: boolean): NextResponse {
  return new NextResponse(body, {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Platform Dashboard"',
      ...(isJson ? { "Content-Type": "application/json" } : {}),
    },
  });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const dashboardAuthConfigured = isDashboardAuthConfigured();
  const apiKeyConfigured = isApiKeyConfigured();

  if (shouldRedirectToHttps({
    url: request.url,
    hostHeader: request.headers.get("host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    pathname,
  })) {
    const redirectUrl = new URL(request.url);
    redirectUrl.protocol = "https:";
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (
    isDashboardAuthRequiredInProduction() &&
    !dashboardAuthConfigured &&
    pathname !== "/api/health-status"
  ) {
    const canAccessApi = pathname.startsWith("/api/") && apiKeyConfigured && hasValidApiKey(request);
    if (!canAccessApi) {
      const body = pathname.startsWith("/api/")
        ? JSON.stringify({
            success: false,
            error: "Dashboard access is disabled until DASHBOARD_USERNAME and DASHBOARD_PASSWORD are configured.",
          })
        : "Dashboard access is disabled until dashboard credentials are configured.";

      return new NextResponse(body, {
        status: 503,
        headers: pathname.startsWith("/api/") ? { "Content-Type": "application/json" } : undefined,
      });
    }
  }

  if (!dashboardAuthConfigured && !apiKeyConfigured) {
    return NextResponse.next();
  }

  if (pathname === "/api/health-status") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    if (hasValidApiKey(request) || (dashboardAuthConfigured && hasValidDashboardCredentials(request))) {
      return NextResponse.next();
    }

    return buildBasicAuthChallenge(
      JSON.stringify({
        success: false,
        error: "Unauthorized. Provide a valid API key or authenticate with the dashboard credentials.",
      }),
      true
    );
  }

  if (!dashboardAuthConfigured || hasValidDashboardCredentials(request)) {
    return NextResponse.next();
  }

  return buildBasicAuthChallenge("Authentication required", false);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
