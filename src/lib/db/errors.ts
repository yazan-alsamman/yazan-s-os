import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";

/**
 * Translate database errors into public AppErrors. Constraint names and SQL never reach the
 * client; the original error stays attached as `cause` for server-side logging.
 */
export function mapDatabaseError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return new AppError("CONFLICT", {
          message: "A record with the same unique value already exists.",
          cause: error,
        });
      case "P2003":
        return new AppError("VALIDATION_FAILED", {
          message: "A referenced record does not exist.",
          cause: error,
        });
      case "P2025":
        return new AppError("NOT_FOUND", { cause: error });
      default:
        return error;
    }
  }
  if (isCheckViolation(error)) {
    return new AppError("VALIDATION_FAILED", {
      message:
        "The data violates an integrity rule (for example, an end date before a start date).",
      cause: error,
    });
  }
  return error;
}

function isCheckViolation(error: unknown): boolean {
  const text = error instanceof Error ? error.message : "";
  return /violates check constraint|23514/.test(text);
}

/** Escape LIKE/ILIKE wildcards: Prisma `contains` does not (verified by integration test). */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
