/**
 * Normalisation helpers shared by parsers: trim strings, drop empty values, normalise dates and
 * list cells. Normalisation never invents values — unparseable input is dropped and reported by
 * validation, never guessed.
 */

/** Remove empty strings / null / empty arrays; trim strings (recursively for plain objects). */
export function compact(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const clean = compactValue(value);
    if (clean !== undefined) output[key] = clean;
  }
  return output;
}

function compactValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (Array.isArray(value)) {
    const items = value.map(compactValue).filter((v) => v !== undefined);
    return items.length ? items : undefined;
  }
  if (typeof value === "object") {
    const nested = compact(value as Record<string, unknown>);
    return Object.keys(nested).length ? nested : undefined;
  }
  return value;
}

/** "a | b | c" → ["a","b","c"] (list cells in CSV). */
export function splitList(cell: string | undefined): string[] | undefined {
  if (!cell) return undefined;
  const items = cell
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Normalise common date spellings to YYYY-MM-DD:
 * "2024-03-15", "2024-03", "2024", "Mar 2024", "March 2024", "Mar 15, 2024", "15/03/2024" is NOT
 * accepted (ambiguous day/month order). Partial dates resolve to the first day of the period.
 * Returns the original string when unrecognised so validation can report it.
 */
export function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text) return undefined;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) return text;
  m = /^(\d{4})-(\d{2})$/.exec(text);
  if (m) return `${m[1]}-${m[2]}-01`;
  m = /^(\d{4})$/.exec(text);
  if (m) return `${m[1]}-01-01`;
  m = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    if (month) return `${m[2]}-${pad(month)}-01`;
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    if (month) return `${m[3]}-${pad(month)}-${pad(Number(m[2]))}`;
  }
  return text;
}

/** "true"/"yes"/"1" → true, "false"/"no"/"0" → false, else undefined. */
export function parseBooleanCell(cell: string | undefined): boolean | undefined {
  if (!cell) return undefined;
  const v = cell.trim().toLowerCase();
  if (["true", "yes", "1"].includes(v)) return true;
  if (["false", "no", "0"].includes(v)) return false;
  return undefined;
}

/** Integer cell → number, or the raw text (so validation reports it). */
export function parseIntegerCell(cell: string | undefined): number | string | undefined {
  if (!cell) return undefined;
  return /^-?\d+$/.test(cell.trim()) ? Number(cell.trim()) : cell;
}
