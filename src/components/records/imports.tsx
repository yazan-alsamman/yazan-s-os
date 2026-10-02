"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Upload, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";

import { humanize, Panel } from "@/components/data/detail";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { useUrlState } from "@/components/data/use-url-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ALL_RESOURCES, useApiGet, useApiList } from "@/lib/api/hooks";
import { ApiError, errorMessage, fetchJson, sendJson, withQuery } from "@/lib/http/fetch-json";

/**
 * Import UI (11_DATA_IMPORT_PROFILE.md): upload → review queue → accept/reject.
 * Nothing becomes part of the profile until a record is explicitly accepted.
 */
const SOURCES = [
  { value: "peos_json", label: "PEOS JSON (exchange / export file)" },
  { value: "linkedin_csv", label: "LinkedIn export CSV (Positions, Education, Skills, …)" },
  { value: "csv", label: "CSV — one record type per file" },
];
const ENTITY_TYPES = [
  "experience",
  "education",
  "skill",
  "technology",
  "certification",
  "project",
  "evidence",
];

interface ImportJob {
  id: string;
  source: string;
  fileName: string;
  fileSize: number;
  status: string;
  recordCount: number;
  invalidCount: number;
  createdAt: string;
  pending: number;
  accepted: number;
  rejected: number;
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all(ALL_RESOURCES.map((r) => queryClient.invalidateQueries({ queryKey: [r] })));
}

export function ImportCenter() {
  const queryClient = useQueryClient();
  const ids = { source: useId(), entity: useId(), file: useId() };
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("peos_json");
  const [entityType, setEntityType] = useState("project");
  const [status, setStatus] = useState<{
    tone: "error" | "ok";
    text: string;
    jobId?: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const jobs = useApiList<ImportJob>("imports", "/api/v1/imports", { pageSize: 50 });

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus({ tone: "error", text: "Choose a file to upload." });
      fileRef.current?.focus();
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("source", source);
    if (source === "csv") form.set("entityType", entityType);
    setUploading(true);
    setStatus(null);
    try {
      const { data } = await fetchJson<{ data: ImportJob }>("/api/v1/imports", {
        method: "POST",
        body: form,
      });
      setStatus({
        tone: "ok",
        text: `Parsed ${data.recordCount} record(s), ${data.invalidCount} invalid. Review them before anything is saved.`,
        jobId: data.id,
      });
      if (fileRef.current) fileRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["imports"] });
    } catch (error) {
      setStatus({ tone: "error", text: errorMessage(error) });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Upload a file">
        <form onSubmit={upload} className="grid gap-4 md:grid-cols-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.source}>Source</Label>
            <NativeSelect
              id={ids.source}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          {source === "csv" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.entity}>Record type in the file</Label>
              <NativeSelect
                id={ids.entity}
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.file}>File (max 2 MB, UTF-8)</Label>
            <input
              id={ids.file}
              ref={fileRef}
              type="file"
              accept={source === "peos_json" ? ".json,application/json" : ".csv,text/csv"}
              className="text-body file:mr-3 file:rounded-md file:border file:bg-surface-sunken file:px-3 file:py-1.5"
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-3">
            <div>
              <Button type="submit" disabled={uploading}>
                <Upload aria-hidden />
                {uploading ? "Parsing…" : "Upload and parse"}
              </Button>
            </div>
            <p
              role="status"
              aria-live="polite"
              className={status?.tone === "error" ? "text-danger" : "text-foreground"}
            >
              {status?.text}{" "}
              {status?.jobId && (
                <Link
                  href={`/settings/import/${status.jobId}` as never}
                  className="font-medium underline underline-offset-4"
                >
                  Open review queue
                </Link>
              )}
            </p>
            <p className="text-caption text-muted-foreground">
              Formats are documented in{" "}
              <span className="font-mono">docs/architecture/import-export.md</span>. Files are
              parsed, never executed; the original file is not stored — only its name, size and
              SHA-256.
            </p>
          </div>
        </form>
      </Panel>

      <Panel title="Import history">
        {jobs.isPending ? (
          <ListSkeleton rows={3} />
        ) : jobs.isError ? (
          <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
        ) : jobs.data.data.length === 0 ? (
          <p className="text-muted-foreground">No imports yet.</p>
        ) : (
          <ul className="divide-y">
            {jobs.data.data.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <Link
                    href={`/settings/import/${job.id}` as never}
                    className="font-medium hover:underline"
                  >
                    {job.fileName}
                  </Link>
                  <p className="text-caption text-muted-foreground">
                    {SOURCES.find((s) => s.value === job.source)?.label.split(" (")[0]} ·{" "}
                    {new Date(job.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 tabular">
                  <Badge tone={job.status === "completed" ? "success" : "warning"}>
                    {humanize(job.status)}
                  </Badge>
                  <Badge>{job.pending} pending</Badge>
                  <Badge>{job.accepted} accepted</Badge>
                  <Badge>{job.rejected} rejected</Badge>
                  {job.invalidCount > 0 && <Badge tone="danger">{job.invalidCount} invalid</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

interface ReviewRecord {
  id: string;
  entityType: string;
  sourceRef: string;
  label: string;
  payload: Record<string, unknown>;
  validationStatus: "valid" | "invalid";
  validationErrors: { path: string; message: string }[];
  confidence: string;
  match: "new" | "duplicate";
  reviewStatus: "pending" | "accepted" | "rejected";
  decision: string | null;
  resultEntityId: string | null;
  notes: string | null;
  comparison: {
    recommendation: "update" | "reject";
    differences: { field: string; existing: unknown; imported: unknown }[];
  } | null;
}

interface JobResponse {
  job: ImportJob & { parserVersion: string; fileSha256: string };
  data: ReviewRecord[];
  page: { page: number; totalPages: number; total: number };
}

function show(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value))
    return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const DETAIL_PATH: Record<string, string> = {
  project: "/projects/",
  skill: "/skills/",
  technology: "/skills/technologies/",
  certification: "/certifications/",
  evidence: "/evidence/",
  experience: "/career/experience/",
};

export function ImportReview({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  const { get, set } = useUrlState();
  const reviewStatus = get("reviewStatus") || "pending";
  const page = get("page") || "1";
  const path = withQuery(`/api/v1/imports/${jobId}`, {
    reviewStatus: reviewStatus === "all" ? undefined : reviewStatus,
    page,
    pageSize: 25,
  });
  const job = useApiGet<JobResponse>(["imports", "job", path], path);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  /** Run an action; `run` resolves to the success message announced to the user. */
  async function act(key: string, run: () => Promise<string>) {
    setBusy(key);
    setMessage(null);
    try {
      setMessage({ tone: "ok", text: await run() });
      await invalidateAll(queryClient);
    } catch (error) {
      setMessage({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  const decide = (record: ReviewRecord, body: Record<string, unknown>, success: string) =>
    act(record.id, async () => {
      await sendJson("POST", `/api/v1/imports/${jobId}/records/${record.id}/decision`, body);
      return success;
    });

  if (job.isPending) return <ListSkeleton rows={6} />;
  if (job.isError) {
    if (job.error instanceof ApiError && job.error.status === 404) {
      return <p role="alert">This import does not exist.</p>;
    }
    return <ErrorState error={job.error} onRetry={() => void job.refetch()} />;
  }
  const { job: info, data: records, page: pageInfo } = job.data;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Import">
        <dl className="grid gap-x-6 gap-y-2 text-body sm:grid-cols-3">
          <div>
            <dt className="text-caption text-muted-foreground">File</dt>
            <dd className="break-all">{info.fileName}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Uploaded</dt>
            <dd>{new Date(info.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Parser</dt>
            <dd>{info.parserVersion}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Records</dt>
            <dd className="tabular">
              {info.recordCount} ({info.invalidCount} invalid)
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Pending review</dt>
            <dd className="tabular">{info.pending}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">SHA-256</dt>
            <dd className="truncate font-mono text-caption" title={info.fileSha256}>
              {info.fileSha256}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={busy !== null || info.pending === 0}
            onClick={() =>
              act("bulk", async () => {
                const { data } = await sendJson<{ data: { accepted: number; skipped: number } }>(
                  "POST",
                  `/api/v1/imports/${jobId}/resolve`,
                  { action: "accept_new" },
                );
                return `Accepted ${data.accepted}. ${data.skipped} left for individual review (duplicates or invalid).`;
              })
            }
          >
            <Check aria-hidden />
            Accept all new valid records
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null || info.pending === 0}
            onClick={() =>
              act("reject", async () => {
                await sendJson("POST", `/api/v1/imports/${jobId}/resolve`, {
                  action: "reject_pending",
                });
                return "All pending records rejected.";
              })
            }
          >
            <X aria-hidden />
            Reject all pending
          </Button>
        </div>
        <p
          role="status"
          aria-live="polite"
          className={`mt-2 ${message?.tone === "error" ? "text-danger" : ""}`}
        >
          {message?.text}
        </p>
      </Panel>

      <section aria-labelledby="review-queue" className="rounded-lg border bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b px-4 py-2.5">
          <h2 id="review-queue" className="text-h3 font-semibold">
            Review queue
          </h2>
          <label className="flex flex-col gap-1 text-caption text-muted-foreground">
            Show
            <NativeSelect
              value={reviewStatus}
              onChange={(e) => set({ reviewStatus: e.target.value })}
              className="w-40"
            >
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </NativeSelect>
          </label>
        </div>
        {records.length === 0 ? (
          <p className="p-4 text-muted-foreground">
            No {reviewStatus === "all" ? "" : reviewStatus} records.
          </p>
        ) : (
          <ul className="divide-y">
            {records.map((record) => (
              <li key={record.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{record.label}</p>
                    <p className="text-caption text-muted-foreground">
                      {humanize(record.entityType)} · {record.sourceRef} · confidence{" "}
                      {record.confidence}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {record.validationStatus === "invalid" ? (
                      <Badge tone="danger">Invalid</Badge>
                    ) : (
                      <Badge tone="success">Valid</Badge>
                    )}
                    {record.match === "duplicate" && (
                      <Badge tone="warning">Matches existing record</Badge>
                    )}
                    <Badge>
                      {humanize(record.reviewStatus)}
                      {record.decision ? ` (${record.decision})` : ""}
                    </Badge>
                  </div>
                </div>

                {record.validationErrors.length > 0 && (
                  <ul className="list-disc pl-5 text-body text-danger">
                    {record.validationErrors.map((e, i) => (
                      <li key={i}>
                        <span className="font-mono">{e.path || "record"}</span>: {e.message}
                      </li>
                    ))}
                  </ul>
                )}

                {record.comparison ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-body">
                      <caption className="py-1 text-left text-caption text-muted-foreground">
                        Differences from the existing record — recommended:{" "}
                        {record.comparison.recommendation === "reject"
                          ? "reject (identical)"
                          : "update the existing record"}
                      </caption>
                      <thead className="text-caption text-muted-foreground">
                        <tr>
                          <th scope="col" className="pr-3">
                            Field
                          </th>
                          <th scope="col" className="pr-3">
                            Existing
                          </th>
                          <th scope="col">Imported</th>
                        </tr>
                      </thead>
                      <tbody>
                        {record.comparison.differences.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="text-muted-foreground">
                              No differences.
                            </td>
                          </tr>
                        ) : (
                          record.comparison.differences.map((d) => (
                            <tr key={d.field} className="align-top">
                              <th scope="row" className="pr-3 font-mono font-normal">
                                {d.field}
                              </th>
                              <td className="pr-3 break-words">{show(d.existing)}</td>
                              <td className="break-words">{show(d.imported)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <details>
                    <summary className="cursor-pointer text-caption text-muted-foreground">
                      Show imported fields
                    </summary>
                    <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
                      {Object.entries(record.payload).map(([key, value]) => (
                        <div key={key} className="contents">
                          <dt className="font-mono text-caption text-muted-foreground">{key}</dt>
                          <dd className="break-words">{show(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}

                {record.notes && (
                  <p className="text-caption whitespace-pre-line">
                    <Badge tone="warning">Note</Badge> {record.notes}
                  </p>
                )}

                {record.reviewStatus === "pending" ? (
                  <div className="flex flex-wrap gap-2">
                    {record.match === "duplicate" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={busy !== null || record.validationStatus === "invalid"}
                          onClick={() =>
                            decide(
                              record,
                              { action: "accept", mode: "update" },
                              `Updated the existing record from “${record.label}”.`,
                            )
                          }
                        >
                          Update existing
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy !== null || record.validationStatus === "invalid"}
                          onClick={() =>
                            decide(
                              record,
                              { action: "accept", mode: "create" },
                              `Created a new record from “${record.label}”.`,
                            )
                          }
                        >
                          Create as new
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy !== null || record.validationStatus === "invalid"}
                        onClick={() =>
                          decide(record, { action: "accept" }, `Accepted “${record.label}”.`)
                        }
                      >
                        Accept
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() =>
                        decide(record, { action: "reject" }, `Rejected “${record.label}”.`)
                      }
                    >
                      Reject
                    </Button>
                  </div>
                ) : record.resultEntityId && DETAIL_PATH[record.entityType] ? (
                  <Link
                    href={`${DETAIL_PATH[record.entityType]}${record.resultEntityId}` as never}
                    className="text-body underline underline-offset-4"
                  >
                    View saved record
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {pageInfo.totalPages > 1 && (
          <nav
            aria-label="Review queue pages"
            className="flex items-center justify-between border-t px-4 py-2"
          >
            <span className="text-caption text-muted-foreground tabular">
              Page {pageInfo.page} of {pageInfo.totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={pageInfo.page <= 1}
                onClick={() => set({ page: String(pageInfo.page - 1) })}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pageInfo.page >= pageInfo.totalPages}
                onClick={() => set({ page: String(pageInfo.page + 1) })}
              >
                Next
              </Button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}

export function ExportPanel() {
  const [entity, setEntity] = useState("projects");
  const entityId = useId();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Full export (JSON)">
        <p className="mb-3 text-muted-foreground">
          Everything you own in PEOS — profile, experience, education, skills, technologies,
          certifications, projects and evidence — with relationships and provenance. The file can be
          re-imported through the review queue.
        </p>
        <Button asChild>
          <a href="/api/v1/export?format=json" download>
            Download JSON
          </a>
        </Button>
      </Panel>
      <Panel title="Single table (CSV)">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={entityId}>Records</Label>
            <NativeSelect id={entityId} value={entity} onChange={(e) => setEntity(e.target.value)}>
              {[
                "experiences",
                "education",
                "skills",
                "technologies",
                "certifications",
                "projects",
                "evidence",
              ].map((e) => (
                <option key={e} value={e}>
                  {humanize(e)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Button asChild variant="outline">
              <a href={`/api/v1/export?format=csv&entity=${entity}`} download>
                Download CSV
              </a>
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">
            Exports are generated on request and never stored on the server. Each export is recorded
            in the audit log.
          </p>
        </div>
      </Panel>
    </div>
  );
}
