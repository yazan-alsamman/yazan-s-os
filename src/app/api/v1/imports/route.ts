import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { paginationQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/params";
import { readBodyBytes } from "@/lib/http/request-body";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { parseInput } from "@/lib/validation/parse";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_IMPORT_BYTES,
  uploadFieldsSchema,
} from "@/modules/imports/import.schemas";
import { createImportService } from "@/modules/imports/import.service";

export const dynamic = "force-dynamic";

/** Multipart overhead allowance on top of the file size limit. */
const MULTIPART_OVERHEAD = 64 * 1024;

/** GET /api/v1/imports — the caller's import jobs with review progress. */
export const GET = defineUserRoute("v1.imports.list", async ({ request, ctx }) =>
  createImportService(getDb()).listJobs(ctx, parseQuery(request, paginationQuerySchema)),
);

/**
 * POST /api/v1/imports — upload one file (multipart: file, source, entityType?). The file is
 * parsed into the review queue; nothing is written to the profile until records are accepted.
 */
export const POST = defineUserRoute(
  "v1.imports.upload",
  async ({ request, ctx }) => {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", {
        message: "Upload the file as multipart/form-data.",
      });
    }
    const body = await readBodyBytes(request, MAX_IMPORT_BYTES + MULTIPART_OVERHEAD);
    let form: FormData;
    try {
      form = await new Response(new Blob([body]), {
        headers: { "content-type": contentType },
      }).formData();
    } catch {
      throw new AppError("VALIDATION_FAILED", { message: "The upload could not be read." });
    }

    const fields = parseInput(uploadFieldsSchema, {
      source: form.get("source") ?? undefined,
      entityType: form.get("entityType") || undefined,
    });
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_FAILED", {
        details: [{ path: "file", message: "Choose a file" }],
      });
    }
    if (file.size > MAX_IMPORT_BYTES) throw new AppError("PAYLOAD_TOO_LARGE");
    const name = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS[fields.source].some((ext) => name.endsWith(ext))) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", {
        message: `Expected a ${ALLOWED_EXTENSIONS[fields.source].join(" or ")} file for this source.`,
      });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type.split(";")[0]!.trim().toLowerCase())) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", {
        message: "Only CSV and JSON text files are accepted.",
      });
    }

    const job = await createImportService(getDb()).upload(
      ctx,
      fields.source,
      fields.entityType ?? null,
      {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    );
    return created(job);
  },
  { rateLimit: RateLimits.import },
);
