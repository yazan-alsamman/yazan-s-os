import { AppError } from "@/lib/errors/app-error";

export const MAX_JSON_BODY_BYTES = 256 * 1024;

/**
 * Read a JSON request body with a hard size limit. Malformed JSON and wrong content types are
 * client errors, never 500s.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", { message: "Send the body as application/json." });
  }
  const bytes = await readBodyBytes(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new AppError("VALIDATION_FAILED", { message: "The request body is not valid JSON." });
  }
}

/** Read the raw body, rejecting it once it exceeds `maxBytes` (declared or actual). */
export async function readBodyBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE");
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
