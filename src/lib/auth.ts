// ============================================================
// API Authentication for mutating routes.
//
// If neither API_KEY nor dashboard credentials are set, all requests are allowed.
// API routes accept either:
//   - Authorization: Bearer <key> / x-api-key matching API_KEY, or
//   - Authorization: Basic <base64(username:password)> matching dashboard creds.
//
// Browser dashboard access is expected to use HTTP Basic Auth via middleware.
// ============================================================

import { NextRequest, NextResponse } from "next/server";

/**
 * Returns true when the request presents a valid API key.
 */
export function hasValidApiKey(request: Request): boolean {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return false;

  // Check Authorization: Bearer <key>
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1] === apiKey) {
      return true;
    }
  }

  // Fallback: check x-api-key header
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey === apiKey) {
    return true;
  }

  return false;
}

/**
 * Returns true when dashboard basic auth has been configured.
 */
export function isDashboardAuthConfigured(): boolean {
  return !!(process.env.DASHBOARD_USERNAME && process.env.DASHBOARD_PASSWORD);
}

export function isApiKeyConfigured(): boolean {
  return !!process.env.API_KEY;
}

function decodeBase64(value: string): string | null {
  try {
    if (typeof atob === "function") {
      return atob(value);
    }
  } catch {
    // Fall through to Buffer decoding in Node.js.
  }

  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(value, "base64").toString("utf-8");
    }
  } catch {
    return null;
  }

  return null;
}

function getBasicAuthCredentials(request: Request): { username: string; password: string } | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, encoded] = authHeader.split(" ");
  if (!scheme || !encoded || scheme.toLowerCase() !== "basic") return null;

  const decoded = decodeBase64(encoded);
  if (!decoded) return null;

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return null;

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

/**
 * Returns true when the request presents valid dashboard basic auth credentials.
 */
export function hasValidDashboardCredentials(request: Request): boolean {
  const username = process.env.DASHBOARD_USERNAME;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!username || !password) return false;

  const credentials = getBasicAuthCredentials(request);
  if (!credentials) return false;

  return credentials.username === username && credentials.password === password;
}

export function validateDashboardAccess(request: Request): boolean {
  if (!isDashboardAuthConfigured()) return true;
  return hasValidDashboardCredentials(request);
}

/**
 * Validate authorization for mutating dashboard requests.
 * Returns true if:
 *   - neither API_KEY nor dashboard auth is configured
 *   - Authorization: Bearer <key> matches
 *   - x-api-key header matches
 *   - Authorization: Basic <username:password> matches dashboard credentials
 */
export function validateApiKey(request: Request): boolean {
  if (!isApiKeyConfigured() && !isDashboardAuthConfigured()) {
    return true;
  }

  return hasValidApiKey(request) || hasValidDashboardCredentials(request);
}

/**
 * Higher-order function that wraps a Next.js App Router handler with auth.
 * Returns 401 if the API key is invalid; otherwise delegates to the handler.
 */
export function withAuth(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest, context?: any): Promise<NextResponse> => {
    if (!validateApiKey(request)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Provide a valid API key via Authorization: Bearer <key> or x-api-key, or authenticate with the dashboard basic-auth credentials.",
        },
        {
          status: 401,
          headers: isDashboardAuthConfigured()
            ? { "WWW-Authenticate": 'Basic realm="Platform Dashboard"' }
            : undefined,
        }
      );
    }
    return handler(request, context);
  };
}
