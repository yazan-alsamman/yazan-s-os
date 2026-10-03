import { AppError } from "@/lib/errors/app-error";

/**
 * External resource identity (Phase 9.5, ADR 0052). GitHub resources are identified by their
 * provider-native numeric id (never by name). A malformed id is simply "not found".
 */
export function parseExternalId(raw: string): string {
  if (!/^\d{1,20}$/.test(raw)) throw new AppError("EXTERNAL_RESOURCE_NOT_FOUND");
  return raw;
}
