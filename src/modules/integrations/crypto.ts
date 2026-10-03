import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { getServerEnv } from "@/lib/config/env";
import { AppError } from "@/lib/errors/app-error";

/**
 * Provider token encryption at rest (Phase 9.5, ADR 0052). AES-256-GCM with a random 12-byte IV
 * per secret; the blob is base64(iv ‖ authTag ‖ ciphertext). The key comes from
 * INTEGRATION_ENCRYPTION_KEY (base64, 32 bytes). Core functions take the key so they are unit-tested
 * without environment; the wrappers read the server key and fail safely when it is not configured.
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptWithKey(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptWithKey(key: Buffer, blob: string): string {
  const raw = Buffer.from(blob, "base64");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new Error("Ciphertext is too short");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const enc = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** The configured 32-byte key, or a safe failure when the server is not set up for integrations. */
function serverKey(): Buffer {
  const configured = getServerEnv().INTEGRATION_ENCRYPTION_KEY;
  if (!configured) {
    throw new AppError("INTEGRATION_NOT_CONFIGURED", {
      message: "INTEGRATION_ENCRYPTION_KEY is not configured; integrations are disabled.",
    });
  }
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new AppError("INTEGRATION_NOT_CONFIGURED", {
      message: "INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    });
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  return encryptWithKey(serverKey(), plaintext);
}

export function decryptSecret(blob: string): string {
  return decryptWithKey(serverKey(), blob);
}

export function isEncryptionConfigured(): boolean {
  try {
    serverKey();
    return true;
  } catch {
    return false;
  }
}
