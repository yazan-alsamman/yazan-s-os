import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/observability/request-id";
import { buildContentSecurityPolicy } from "@/lib/security/csp";

/** Pages reachable without a session. API routes enforce auth themselves (401 JSON). */
const PUBLIC_PAGE_PREFIXES = ["/sign-in", "/sign-up"];

function isPublicPage(pathname: string) {
  return PUBLIC_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Edge of every request:
 *  - assigns/propagates the request ID
 *  - sets a per-request nonce-based Content-Security-Policy
 *  - optimistic redirect to sign-in when no session cookie is present.
 *    This is UX only — the authoritative session check happens server-side in the
 *    (app) layout and in every Route Handler.
 */
export function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (!isApi && !isPublicPage(pathname) && !getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    const redirect = NextResponse.redirect(url);
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    isHttps: request.nextUrl.protocol === "https:",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
