// ============================================================
// API Authentication — Simple API Key Validation
//
// If API_KEY env var is not set, all requests are allowed (dev mode).
// Checks Authorization: Bearer <key> header first,
// then falls back to x-api-key header.
// ============================================================

import { NextRequest, NextResponse } from "next/server";

/**
 * Validate the API key from the request headers.
 * Returns true if:
 *   - API_KEY env var is not set (dev mode — allow all)
 *   - Authorization: Bearer <key> matches
 *   - x-api-key header matches
 */
export function validateApiKey(request: Request): boolean {
  const apiKey = process.env.API_KEY;

  // Dev mode: no key configured → allow everything
  if (!apiKey) return true;

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
          error: "Unauthorized. Provide a valid API key via Authorization: Bearer <key> or x-api-key header.",
        },
        { status: 401 }
      );
    }
    return handler(request, context);
  };
}
