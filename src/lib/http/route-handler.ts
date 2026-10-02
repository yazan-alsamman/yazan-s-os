import "server-only";

import { NextResponse } from "next/server";

import { mapDatabaseError } from "@/lib/db/errors";
import { AppError, isAppError, toErrorBody } from "@/lib/errors/app-error";
import { logger, type Logger } from "@/lib/observability/logger";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/observability/request-id";
import { withSpan } from "@/lib/observability/tracing";

export interface RouteContext<TParams> {
  request: Request;
  params: TParams;
  requestId: string;
  log: Logger;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defense in depth for cookie-authenticated mutations (ADR 0015): a browser request whose
 * Origin is not the application origin, or which the browser marks as cross-site, is refused.
 * SameSite=Lax session cookies are the first line of defense.
 */
export function assertSameOrigin(request: Request, appOrigin: () => string): void {
  if (!MUTATING_METHODS.has(request.method)) return;
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin !== appOrigin()) throw new AppError("FORBIDDEN");
    return;
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new AppError("FORBIDDEN");
}

function appOriginFromEnv(): string {
  return new URL(process.env.APP_URL ?? "http://invalid.invalid").origin;
}

/**
 * Standard wrapper for every PEOS Route Handler:
 * request ID → origin check → structured request log → handler → standard error mapping.
 * Handlers return plain data (serialised as JSON) or a Response.
 */
export function defineRoute<TParams = Record<string, never>>(
  name: string,
  handler: (ctx: RouteContext<TParams>) => Promise<unknown>,
) {
  return async (request: Request, segment: { params: Promise<TParams> }): Promise<Response> => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    const log = logger.child({ requestId, route: name });
    const startedAt = performance.now();
    const method = request.method;

    const respond = (response: Response) => {
      response.headers.set(REQUEST_ID_HEADER, requestId);
      response.headers.set("cache-control", "no-store");
      log.info(
        { method, status: response.status, durationMs: Math.round(performance.now() - startedAt) },
        "http.request",
      );
      return response;
    };

    try {
      assertSameOrigin(request, appOriginFromEnv);
      const params = await segment.params;
      const result = await withSpan(`route ${name}`, () =>
        handler({ request, params, requestId, log }),
      );
      return respond(result instanceof Response ? result : NextResponse.json(result));
    } catch (rawError) {
      const error = mapDatabaseError(rawError);
      const { status, body } = toErrorBody(error, requestId);
      if (!isAppError(error) || status >= 500) {
        log.error({ err: rawError, method }, "http.request_failed");
      } else if (error.cause) {
        log.info({ code: error.code, cause: String(error.cause) }, "http.request_rejected");
      }
      return respond(NextResponse.json(body, { status }));
    }
  };
}

/** 201 Created with the standard `{ data }` envelope. */
export function created<T>(data: T): Response {
  return NextResponse.json({ data }, { status: 201 });
}

/** 204 No Content. */
export function noContent(): Response {
  return new Response(null, { status: 204 });
}
