export const REQUEST_ID_HEADER = "x-request-id";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Reuse an inbound request ID only if it is well-formed (prevents log injection);
 * otherwise mint a new one.
 */
export function resolveRequestId(inbound: string | null | undefined): string {
  return inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : crypto.randomUUID();
}
