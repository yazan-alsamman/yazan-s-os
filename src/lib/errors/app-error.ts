/**
 * Application error model. Every error that crosses the HTTP boundary is mapped to
 * `{ code, message, requestId }` (spec 03 §4). Messages are safe to show to users;
 * internal causes are logged, never returned.
 */
export const errorCatalog = {
  VALIDATION_FAILED: { status: 400, message: "The request is invalid." },
  UNAUTHENTICATED: { status: 401, message: "Authentication is required." },
  FORBIDDEN: { status: 403, message: "You do not have access to this resource." },
  NOT_FOUND: { status: 404, message: "The requested resource does not exist." },
  CONFLICT: { status: 409, message: "The request conflicts with the current state." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "The request body is too large." },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: "The request content type is not supported." },
  RATE_LIMITED: { status: 429, message: "Too many requests. Try again later." },
  SERVICE_UNAVAILABLE: { status: 503, message: "A required service is unavailable." },
  INTERNAL_ERROR: { status: 500, message: "An unexpected error occurred." },
  // Integration platform (Phase 9.5, ADR 0052).
  INTEGRATION_NOT_CONFIGURED: {
    status: 503,
    message: "This integration is not configured on the server.",
  },
  INTEGRATION_NOT_CONNECTED: { status: 409, message: "This integration is not connected." },
  INTEGRATION_AUTH_FAILED: { status: 502, message: "Authentication with the provider failed." },
  INTEGRATION_RATE_LIMITED: { status: 429, message: "The provider is rate-limiting requests." },
  INTEGRATION_PROVIDER_UNAVAILABLE: { status: 503, message: "The provider is unavailable." },
  EXTERNAL_RESOURCE_NOT_FOUND: { status: 404, message: "The external resource was not found." },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof errorCatalog;

export interface FieldIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: FieldIssue[] | undefined;

  constructor(
    code: ErrorCode,
    options: { message?: string; details?: FieldIssue[]; cause?: unknown } = {},
  ) {
    super(options.message ?? errorCatalog[code].message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = errorCatalog[code].status;
    this.details = options.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: FieldIssue[];
}

/** Convert any thrown value into a public error body. Unknown errors never leak details. */
export function toErrorBody(
  error: unknown,
  requestId: string,
): { status: number; body: ErrorBody } {
  if (isAppError(error)) {
    return {
      status: error.status,
      body: {
        code: error.code,
        message: error.message,
        requestId,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }
  return {
    status: errorCatalog.INTERNAL_ERROR.status,
    body: { code: "INTERNAL_ERROR", message: errorCatalog.INTERNAL_ERROR.message, requestId },
  };
}
