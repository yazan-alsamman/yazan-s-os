/**
 * Minimal RFC 4180 CSV reader/writer (no dependency). Imported content is treated as untrusted
 * text: it is never evaluated, and exported cells are guarded against spreadsheet formula
 * injection.
 */
export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

export interface CsvLimits {
  maxRows: number;
  maxColumns: number;
  maxCellLength: number;
}

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const DEFAULT_LIMITS: CsvLimits = { maxRows: 5_000, maxColumns: 60, maxCellLength: 20_000 };

/** Parse CSV text into rows of cells. Handles quotes, escaped quotes ("") and CRLF/LF. */
export function parseCsv(text: string, limits: Partial<CsvLimits> = {}): string[][] {
  const { maxRows, maxColumns, maxCellLength } = { ...DEFAULT_LIMITS, ...limits };
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const input = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;

  const pushCell = () => {
    if (cell.length > maxCellLength)
      throw new CsvError(`A cell exceeds ${maxCellLength} characters`);
    row.push(cell);
    if (row.length > maxColumns) throw new CsvError(`More than ${maxColumns} columns`);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (!(row.length === 1 && row[0] === "")) {
      rows.push(row);
      if (rows.length > maxRows) throw new CsvError(`More than ${maxRows} rows`);
    }
    row = [];
  };

  while (i < input.length) {
    const char = input[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      if (cell.length > 0) throw new CsvError(`Unexpected quote in row ${rows.length + 1}`);
      inQuotes = true;
    } else if (char === ",") {
      pushCell();
    } else if (char === "\r") {
      if (input[i + 1] === "\n") i += 1;
      pushRow();
    } else if (char === "\n") {
      pushRow();
    } else {
      cell += char;
    }
    i += 1;
  }
  if (inQuotes) throw new CsvError("Unterminated quoted field");
  if (cell.length > 0 || row.length > 0) pushRow();
  return rows;
}

/** Rows → array of header-keyed records. Header names are trimmed. */
export function csvToRecords(rows: string[][]): {
  headers: string[];
  records: Record<string, string>[];
} {
  const [header, ...body] = rows;
  if (!header) throw new CsvError("The file is empty");
  const headers = header.map((h) => h.trim());
  if (new Set(headers).size !== headers.length) throw new CsvError("Duplicate column names");
  const records = body.map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((name, index) => {
      if (name) record[name] = (cells[index] ?? "").trim();
    });
    return record;
  });
  return { headers, records };
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Quote a cell; neutralise values a spreadsheet would execute as a formula. */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = Array.isArray(value) ? value.join(" | ") : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  headers: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(headers.map((h) => escapeCsvCell(row[h])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
