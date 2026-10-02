import "server-only";

import { NextResponse } from "next/server";

import { isAppError, toErrorBody } from "@/lib/errors/app-error";
import { logger, type Logger } from "@/lib/observability/logger";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/observability/request-id";
import { withSpan } from "@/lib/observability/tracing";

export interface RouteContext<TParams> {
  request: Request;
  params: TParams;
  requestId: string;
  log: Logger;
}

/**
 * Standard wrapper for every PEOS Route Handler:
 * request ID → structured request log → handler → standard error mapping.
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
      const params = await segment.params;
      const result = await withSpan(`route ${name}`, () =>
        handler({ request, params, requestId, log }),
      );
      return respond(result instanceof Response ? result : NextResponse.json(result));
    } catch (error) {
      const { status, body } = toErrorBody(error, requestId);
      if (!isAppError(error) || status >= 500) {
        log.error({ err: error, method }, "http.request_failed");
      }
      return respond(NextResponse.json(body, { status }));
    }
  };
}
