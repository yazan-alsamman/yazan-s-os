import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed OAuth state (Phase 9.5, ADR 0053) — the CSRF defence for the authorization-code flow. The
 * state binds the flow to the initiating owner and provider and carries a random nonce and an
 * expiry. It is an HMAC over those fields; the callback verifies the signature, the expiry and that
 * the session user matches the embedded userId, so a forged or replayed state cannot connect an
 * account to the wrong owner. Core functions take the secret so they are unit-tested directly.
 */
export const STATE_TTL_MS = 10 * 60 * 1000;

interface StatePayload {
  userId: string;
  provider: string;
  nonce: string;
  exp: number;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createState(
  secret: string,
  input: { userId: string; provider: string },
  now = Date.now(),
): string {
  const payload: StatePayload = {
    userId: input.userId,
    provider: input.provider,
    nonce: b64url(randomBytes(16)),
    exp: now + STATE_TTL_MS,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(secret, body)}`;
}

export function verifyState(
  secret: string,
  state: string,
  expected: { userId: string; provider: string },
  now = Date.now(),
): boolean {
  const parts = state.split(".");
  if (parts.length !== 2) return false;
  const [body, mac] = parts as [string, string];
  const expectedMac = sign(secret, body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return false;
  }
  return (
    payload.userId === expected.userId &&
    payload.provider === expected.provider &&
    typeof payload.exp === "number" &&
    payload.exp > now
  );
}
