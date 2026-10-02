import type { ErrorBody } from "@/lib/errors/app-error";

/** Error thrown by `fetchJson` carrying the standard API error body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody | null,
  ) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
  }
}

/** Same-origin JSON fetch for client components (used as TanStack Query `queryFn`). */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { accept: "application/json", ...init?.headers },
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** JSON mutation helper (POST/PUT/PATCH/DELETE). */
export function sendJson<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
) {
  return fetchJson<T>(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Build a URL with query parameters, omitting empty values. */
export function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined | null>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Human-readable message for an unknown error thrown by the API helpers. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many requests. Wait a moment and try again.";
    return error.body?.message ?? "The request failed.";
  }
  return "The request failed. Check your connection and try again.";
}
