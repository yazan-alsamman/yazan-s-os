import type { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { parseInput } from "@/lib/validation/parse";

import { searchParamsToObject } from "./pagination";
import { readJsonBody } from "./request-body";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path id → UUID. A malformed id is simply "not found" (never a database error). */
export function parseId(raw: string): string {
  if (!UUID.test(raw)) throw new AppError("NOT_FOUND");
  return raw.toLowerCase();
}

export function parseQuery<TSchema extends z.ZodType>(request: Request, schema: TSchema) {
  return parseInput(schema, searchParamsToObject(new URL(request.url).searchParams));
}

export async function parseBody<TSchema extends z.ZodType>(request: Request, schema: TSchema) {
  return parseInput(schema, await readJsonBody(request));
}
