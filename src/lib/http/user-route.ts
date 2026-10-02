import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/ownership";
import { requireApiUser } from "@/lib/auth/session";
import { enforceRateLimit, RateLimits, type RateLimitPolicy } from "@/lib/rate-limit/rate-limiter";
import type { ServiceContext } from "@/modules/shared/service-context";

import { defineRoute, type RouteContext } from "./route-handler";

export interface UserRouteContext<TParams> extends RouteContext<TParams> {
  user: AuthenticatedUser;
  /** Identity + request correlation passed to every service call. */
  ctx: ServiceContext;
}

/**
 * Route Handler for authenticated `/api/v1` endpoints: resolves the user from the server-side
 * session (401 otherwise) and rate-limits mutations per user.
 */
export function defineUserRoute<TParams = Record<string, never>>(
  name: string,
  handler: (ctx: UserRouteContext<TParams>) => Promise<unknown>,
  options: { rateLimit?: RateLimitPolicy } = {},
) {
  return defineRoute<TParams>(name, async (routeCtx) => {
    const user = await requireApiUser(routeCtx.request);
    const isMutation = routeCtx.request.method !== "GET" && routeCtx.request.method !== "HEAD";
    const policy = options.rateLimit ?? (isMutation ? RateLimits.mutation : undefined);
    if (policy) await enforceRateLimit(user.id, policy);
    return handler({
      ...routeCtx,
      user,
      ctx: { userId: user.id, requestId: routeCtx.requestId },
    });
  });
}
