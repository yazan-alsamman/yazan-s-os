import "server-only";

import type { z } from "zod";

import type { ServiceContext } from "@/modules/shared/service-context";

import { parseBody, parseId, parseQuery } from "./params";
import { created, noContent } from "./route-handler";
import { defineUserRoute } from "./user-route";

/**
 * Standard collection/item route handlers for an owned resource. Every handler goes through
 * defineUserRoute (session → 401, origin check, rate limit, error mapping) and the module's
 * service (validation → ownership → transaction → audit). See ADR 0015.
 */
interface CollectionService<TQuery, TCreate> {
  list(ctx: ServiceContext, query: TQuery): Promise<unknown>;
  create(ctx: ServiceContext, input: TCreate): Promise<unknown>;
}

interface ItemService<TUpdate> {
  get(ctx: ServiceContext, id: string): Promise<unknown>;
  update(ctx: ServiceContext, id: string, input: TUpdate): Promise<unknown>;
  delete(ctx: ServiceContext, id: string): Promise<void>;
}

export function collectionRoutes<TListSchema extends z.ZodType, TCreateSchema extends z.ZodType>(
  name: string,
  service: () => CollectionService<z.output<TListSchema>, z.output<TCreateSchema>>,
  schemas: { list: TListSchema; create: TCreateSchema },
) {
  return {
    GET: defineUserRoute(`v1.${name}.list`, async ({ request, ctx }) =>
      service().list(ctx, parseQuery(request, schemas.list)),
    ),
    POST: defineUserRoute(`v1.${name}.create`, async ({ request, ctx }) => {
      const input = await parseBody(request, schemas.create);
      return created(await service().create(ctx, input));
    }),
  };
}

export function itemRoutes<TUpdateSchema extends z.ZodType>(
  name: string,
  service: () => ItemService<z.output<TUpdateSchema>>,
  schemas: { update: TUpdateSchema },
) {
  type Params = { id: string };
  return {
    GET: defineUserRoute<Params>(`v1.${name}.get`, async ({ params, ctx }) => ({
      data: await service().get(ctx, parseId(params.id)),
    })),
    PATCH: defineUserRoute<Params>(`v1.${name}.update`, async ({ request, params, ctx }) => {
      const id = parseId(params.id);
      const input = await parseBody(request, schemas.update);
      return { data: await service().update(ctx, id, input) };
    }),
    DELETE: defineUserRoute<Params>(`v1.${name}.delete`, async ({ params, ctx }) => {
      await service().delete(ctx, parseId(params.id));
      return noContent();
    }),
  };
}

/** PUT replace-set endpoint for one relationship of an owned resource. */
export function relationRoute<TBodySchema extends z.ZodType>(
  name: string,
  schema: TBodySchema,
  replace: (ctx: ServiceContext, id: string, body: z.output<TBodySchema>) => Promise<unknown>,
) {
  return {
    PUT: defineUserRoute<{ id: string }>(`v1.${name}.replace`, async ({ request, params, ctx }) => {
      const id = parseId(params.id);
      const body = await parseBody(request, schema);
      return { data: await replace(ctx, id, body) };
    }),
  };
}
