import type { ImportEntityType, ImportSource } from "@/generated/prisma/enums";

import type { RawCandidate } from "./candidates";
import { csvToRecords, CsvError, parseCsv } from "./csv";
import { EXCHANGE_COLLECTIONS, exchangeDocumentSchema } from "./exchange-format";
import { compact, normalizeDate, parseBooleanCell, parseIntegerCell, splitList } from "./normalize";

/** Thrown when the file itself (not an individual record) cannot be read. → HTTP 400. */
export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFormatError";
  }
}

export const MAX_IMPORT_RECORDS = 2_000;

export interface ParseResult {
  parserVersion: string;
  entityHint: ImportEntityType | null;
  candidates: RawCandidate[];
}

const DATE_FIELDS = new Set([
  "startDate",
  "endDate",
  "issueDate",
  "expiryDate",
  "targetDate",
  "completedAt",
  "date",
]);

function normalizeDates(payload: Record<string, unknown>) {
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (DATE_FIELDS.has(key) && typeof value === "string") payload[key] = normalizeDate(value);
  }
  return payload;
}

function limit(candidates: RawCandidate[]): RawCandidate[] {
  if (candidates.length > MAX_IMPORT_RECORDS) {
    throw new ImportFormatError(`The file contains more than ${MAX_IMPORT_RECORDS} records.`);
  }
  if (candidates.length === 0) throw new ImportFormatError("The file contains no records.");
  return candidates;
}

// ── PEOS JSON ────────────────────────────────────────────────────────────────

export function parsePeosJson(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportFormatError("The file is not valid JSON.");
  }
  const document = exchangeDocumentSchema.safeParse(json);
  if (!document.success) {
    const first = document.error.issues[0];
    throw new ImportFormatError(
      `Not a PEOS exchange document (${first?.path.join(".") || "root"}: ${first?.message}).`,
    );
  }
  const candidates: RawCandidate[] = [];
  if (document.data.profile) {
    candidates.push({
      entityType: "profile",
      sourceRef: "profile",
      payload: normalizeDates(compact(document.data.profile)),
    });
  }
  for (const [collection, entityType] of Object.entries(EXCHANGE_COLLECTIONS)) {
    const items = document.data[collection as keyof typeof EXCHANGE_COLLECTIONS] ?? [];
    items.forEach((item, index) => {
      candidates.push({
        entityType,
        sourceRef: `${collection}[${index}]`,
        payload: normalizeDates(compact(item)),
      });
    });
  }
  return { parserVersion: "peos-json@1", entityHint: null, candidates: limit(candidates) };
}

// ── Entity CSV (one entity type per file, columns = field names) ─────────────

const LIST_FIELDS = new Set(["achievements", "skills", "evidence"]);

/** CSV row → candidate payload. Lists use "|" separators; technologies as "Name:usageType". */
export function csvRowToPayload(entityType: ImportEntityType, row: Record<string, string>) {
  const payload: Record<string, unknown> = {};
  for (const [column, cell] of Object.entries(row)) {
    if (!cell) continue;
    if (LIST_FIELDS.has(column)) {
      const items = splitList(cell);
      payload[column] =
        entityType === "skill" && column === "evidence"
          ? items?.map((title) => ({ title }))
          : items;
    } else if (column === "technologies") {
      payload.technologies = splitList(cell)?.map((item) => {
        const [name, usageType] = item.split(":").map((s) => s.trim());
        return compact({ name, usageType });
      });
    } else if (column === "active" || column === "verified") {
      payload[column] = parseBooleanCell(cell) ?? cell;
    } else if (column === "targetLevel") {
      payload[column] = parseIntegerCell(cell);
    } else {
      payload[column] = cell;
    }
  }
  return normalizeDates(compact(payload));
}

export function parseEntityCsv(text: string, entityType: ImportEntityType): ParseResult {
  if (entityType === "profile") {
    throw new ImportFormatError("Profiles cannot be imported from CSV; use PEOS JSON or LinkedIn.");
  }
  const { records } = readCsv(text);
  const candidates = records.map((row, index) => ({
    entityType,
    sourceRef: `row ${index + 2}`,
    payload: csvRowToPayload(entityType, row),
  }));
  return { parserVersion: "peos-csv@1", entityHint: entityType, candidates: limit(candidates) };
}

function readCsv(text: string) {
  try {
    return csvToRecords(parseCsv(text, { maxRows: MAX_IMPORT_RECORDS + 1 }));
  } catch (error) {
    if (error instanceof CsvError) throw new ImportFormatError(`Invalid CSV: ${error.message}`);
    throw error;
  }
}

// ── LinkedIn data export CSVs ───────────────────────────────────────────────

/**
 * LinkedIn "Get a copy of your data" files are recognised by their header row. Mapping is
 * best-effort (confidence "medium"): LinkedIn does not publish a stable schema.
 */
interface LinkedInFile {
  entityType: ImportEntityType;
  required: string[];
  map: (row: Record<string, string>) => Record<string, unknown>;
}

function firstHttpUrl(text: string | undefined): string | undefined {
  return text?.match(/https?:\/\/[^\s,\]]+/)?.[0];
}

const LINKEDIN_FILES: LinkedInFile[] = [
  {
    entityType: "profile",
    required: ["First Name", "Last Name", "Headline"],
    map: (r) => ({
      name: [r["First Name"], r["Last Name"]].filter(Boolean).join(" "),
      headline: r["Headline"],
      summary: r["Summary"],
      location: r["Geo Location"],
      website: firstHttpUrl(r["Websites"]),
    }),
  },
  {
    entityType: "experience",
    required: ["Company Name", "Title", "Started On"],
    map: (r) => ({
      organization: r["Company Name"],
      title: r["Title"],
      description: r["Description"],
      startDate: normalizeDate(r["Started On"]),
      endDate: normalizeDate(r["Finished On"]),
    }),
  },
  {
    entityType: "education",
    required: ["School Name"],
    map: (r) => ({
      institution: r["School Name"],
      degree: r["Degree Name"],
      fieldOfStudy: r["Field Of Study"],
      startDate: normalizeDate(r["Start Date"]),
      endDate: normalizeDate(r["End Date"]),
      description: [r["Notes"], r["Activities"]].filter(Boolean).join("\n\n"),
    }),
  },
  {
    entityType: "certification",
    required: ["Name", "Authority"],
    map: (r) => ({
      name: r["Name"],
      issuer: r["Authority"],
      verificationUrl: r["Url"],
      issueDate: normalizeDate(r["Started On"]),
      expiryDate: normalizeDate(r["Finished On"]),
      credentialId: r["License Number"],
    }),
  },
  {
    entityType: "project",
    required: ["Title", "Description", "Url"],
    map: (r) => {
      const url = r["Url"];
      const isRepo = url ? /github\.com|gitlab\.com|bitbucket\.org/i.test(url) : false;
      return {
        name: r["Title"],
        description: r["Description"],
        repositoryUrl: isRepo ? url : undefined,
        demoUrl: isRepo ? undefined : url,
        startDate: normalizeDate(r["Started On"]),
        completedAt: normalizeDate(r["Finished On"]),
      };
    },
  },
  { entityType: "skill", required: ["Name"], map: (r) => ({ name: r["Name"] }) },
];

/** Some LinkedIn files start with "Notes:" lines before the header; skip to the header row. */
function locateHeader(rows: string[][]): { file: LinkedInFile; start: number } {
  for (let start = 0; start < Math.min(rows.length, 10); start++) {
    const header = (rows[start] ?? []).map((h) => h.trim());
    // Most specific definitions first (Skills.csv has only "Name").
    const file = LINKEDIN_FILES.find((f) => f.required.every((col) => header.includes(col)));
    if (file) return { file, start };
  }
  throw new ImportFormatError(
    "Unrecognised LinkedIn file. Supported: Profile.csv, Positions.csv, Education.csv, Certifications.csv, Projects.csv, Skills.csv.",
  );
}

export function parseLinkedInCsv(text: string): ParseResult {
  let rows: string[][];
  try {
    rows = parseCsv(text, { maxRows: MAX_IMPORT_RECORDS + 20 });
  } catch (error) {
    if (error instanceof CsvError) throw new ImportFormatError(`Invalid CSV: ${error.message}`);
    throw error;
  }
  const { file, start } = locateHeader(rows);
  const { records } = csvToRecords(rows.slice(start));
  const candidates = records.map((row, index) => ({
    entityType: file.entityType,
    sourceRef: `row ${start + index + 2}`,
    payload: compact(file.map(row)),
  }));
  return {
    parserVersion: "linkedin-csv@1",
    entityHint: file.entityType,
    candidates: limit(candidates),
  };
}

export function parseImportFile(
  source: ImportSource,
  text: string,
  entityType: ImportEntityType | null,
): ParseResult {
  switch (source) {
    case "peos_json":
      return parsePeosJson(text);
    case "csv":
      if (!entityType) throw new ImportFormatError("Choose the record type contained in the CSV.");
      return parseEntityCsv(text, entityType);
    case "linkedin_csv":
      return parseLinkedInCsv(text);
  }
}

/** Confidence by source (ADR 0014): native formats map 1:1; LinkedIn is a best-effort mapping. */
export function confidenceFor(source: ImportSource) {
  return source === "linkedin_csv" ? ("medium" as const) : ("high" as const);
}
