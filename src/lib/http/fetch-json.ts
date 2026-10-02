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
  return (await response.json()) as T;
}
