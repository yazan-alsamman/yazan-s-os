import { AppError } from "@/lib/errors/app-error";

/**
 * Relationship targets must all belong to the caller. Missing and foreign ids are reported the
 * same way so the response never reveals that another user's record exists (ADR 0003).
 * (The composite foreign keys would also reject foreign ids at the database level — ADR 0011.)
 */
export function assertAllOwned(ownedCount: number, requestedIds: readonly string[], field: string) {
  if (ownedCount !== requestedIds.length) {
    throw new AppError("VALIDATION_FAILED", {
      message: "One or more related records do not exist.",
      details: [{ path: field, message: "One or more related records do not exist." }],
    });
  }
}

/** Raise NOT_FOUND unless the record was found under the caller's ownership filter. */
export function requireFound<T>(record: T | null | undefined): T {
  if (record == null) throw new AppError("NOT_FOUND");
  return record;
}

/** Reject an update that would put an end date before a start date. */
export function assertDateOrder(
  start: Date | null | undefined,
  end: Date | null | undefined,
  field: string,
  message = "Must not be before the start date",
) {
  if (start && end && end.getTime() < start.getTime()) {
    throw new AppError("VALIDATION_FAILED", { details: [{ path: field, message }] });
  }
}
