import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/modules/shared/service-context";

import type { IntegrationDeps } from "../integration.service";
import { provenanceOf } from "../provenance";

import { createGoogleClient } from "./google.client";

/**
 * Google Drive service (read-only). Browses file/folder metadata; Google Drive remains the source of
 * truth — PEOS never duplicates file contents. Links open in Google.
 */
const BASE = "https://www.googleapis.com/drive/v3/files";
const FIELDS =
  "nextPageToken,files(id,name,mimeType,owners(displayName,emailAddress),createdTime,modifiedTime,size,webViewLink,parents,shared)";
const PROVIDER = "google" as const;

interface DriveRawFile {
  id: string;
  name: string;
  mimeType: string;
  owners?: { displayName?: string; emailAddress?: string }[];
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
  shared?: boolean;
}

function kindOf(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.folder") return "folder";
  if (mimeType === "application/vnd.google-apps.document") return "doc";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "sheet";
  if (mimeType === "application/vnd.google-apps.presentation") return "slides";
  return "file";
}

export function normalizeFile(raw: DriveRawFile, now: Date) {
  return {
    externalId: raw.id,
    name: raw.name,
    mimeType: raw.mimeType,
    kind: kindOf(raw.mimeType),
    owner: raw.owners?.[0]?.displayName ?? raw.owners?.[0]?.emailAddress ?? null,
    createdDate: raw.createdTime ?? null,
    modifiedDate: raw.modifiedTime ?? null,
    size: raw.size ? Number(raw.size) : null,
    url: raw.webViewLink ?? null,
    parents: raw.parents ?? [],
    shared: Boolean(raw.shared),
    provenance: provenanceOf({
      provider: PROVIDER,
      resourceType: "drive_file",
      externalId: raw.id,
      sourceUrl: raw.webViewLink ?? null,
      observedAt: now,
      lastSyncedAt: now,
    }),
  };
}

const qs = (params: Record<string, string | number | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v));
  return `?${u.toString()}`;
};

export function createDriveService(db: PrismaClient, deps: IntegrationDeps = {}) {
  const now = deps.now ?? (() => new Date());

  function buildQuery(opts: { folderId?: string; q?: string; shared?: boolean }): string {
    const clauses = ["trashed=false"];
    if (opts.shared) clauses.push("sharedWithMe");
    else if (opts.folderId) clauses.push(`'${opts.folderId.replace(/'/g, "\\'")}' in parents`);
    if (opts.q) clauses.push(`name contains '${opts.q.replace(/'/g, "\\'")}'`);
    return clauses.join(" and ");
  }

  return {
    async listFiles(
      ctx: ServiceContext,
      query: {
        folderId?: string;
        q?: string;
        shared?: boolean;
        recent?: boolean;
        pageToken?: string;
        pageSize?: number;
      },
    ) {
      const google = createGoogleClient(db, ctx, deps);
      const size = Math.min(Math.max(query.pageSize ?? 30, 1), 100);
      const res = await google.get<{ nextPageToken?: string; files?: DriveRawFile[] }>(
        `${BASE}${qs({
          q: buildQuery(query),
          pageSize: size,
          pageToken: query.pageToken,
          orderBy: query.recent ? "modifiedTime desc" : "folder,name",
          fields: FIELDS,
          spaces: "drive",
          supportsAllDrives: "false",
        })}`,
      );
      const at = now();
      await google.touchSync();
      return {
        data: (res.files ?? []).map((f) => normalizeFile(f, at)),
        nextPageToken: res.nextPageToken ?? null,
        fetchedAt: at.toISOString(),
      };
    },

    async getFile(ctx: ServiceContext, id: string) {
      const google = createGoogleClient(db, ctx, deps);
      const raw = await google.get<DriveRawFile>(
        `${BASE}/${encodeURIComponent(id)}${qs({ fields: FIELDS.replace("nextPageToken,files(", "").replace(/\)$/, ""), supportsAllDrives: "false" })}`,
      );
      return normalizeFile(raw, now());
    },
  };
}
