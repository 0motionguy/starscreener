// StarScreener — pure CSV serializer.
//
// Used by the Pro-tier CSV export endpoint (POST /api/export/csv). Kept
// free of fs / network / framework imports so it's trivially unit-testable
// and safe to pull into either the server bundle or a CLI.
//
// Design notes:
//   - RFC 4180-ish. CRLF line separators so Excel on Windows opens the file
//     without quote-mangling the first row.
//   - Cells wrapped in double-quotes only when they contain `"`, `,`, or
//     any of `\r` / `\n`. Double-quote inside a quoted cell is escaped by
//     doubling (`"` → `""`).
//   - `null` / `undefined` render as an empty cell (NOT the string "null").
//     Excel treats empty as blank; "null" would poison downstream filters.
//   - Numbers are coerced with `String(value)`, no thousands separator, no
//     locale-aware formatting. Callers that want "1,234,567" have to
//     pre-format before handing us a string.
//
// Typing: `CsvColumn<T>` is generic so the column table for a Repo row and
// the column table for, say, a mention row, can both live in the same
// caller file with no `any` / `unknown` casts.

/**
 * One column in the rendered CSV. `select` converts a row to the cell
 * value; returning `null` or `undefined` yields an empty cell. Numbers
 * are emitted verbatim via String().
 */
export interface CsvColumn<T> {
  /** Header label. Rendered verbatim, escaped identically to cell values. */
  header: string;
  /** Extract the cell value for this column from a single row. */
  select: (row: T) => string | number | null | undefined;
}

// RFC 4180 recommends CRLF. Excel on Windows needs it to avoid treating
// the whole file as one record when opened via file-association.
const CRLF = "\r\n";

/** True when `cell` must be wrapped in double quotes. */
function needsQuoting(cell: string): boolean {
  // Empty string does not need quoting; it becomes a literal empty field.
  return (
    cell.includes(",") ||
    cell.includes('"') ||
    cell.includes("\n") ||
    cell.includes("\r")
  );
}

/** Escape a single cell per RFC 4180. */
function escapeCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const asString = typeof raw === "number" ? String(raw) : raw;
  if (!needsQuoting(asString)) return asString;
  // Double-up any `"` inside the value, then wrap.
  const escaped = asString.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Render an array of rows as CSV. Emits a single header line followed by
 * one line per row. CRLF separators, RFC 4180 quoting.
 *
 * Generic over row type — the column table carries all the row→cell
 * extraction logic so this function stays row-shape agnostic.
 *
 * Empty `rows` still produces the header line (so downstream tools that
 * auto-detect columns don't fall over on a zero-repo export).
 */
export function renderCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  if (columns.length === 0) {
    // Zero columns would produce a zero-byte body, which most spreadsheet
    // tools treat as "corrupt" rather than "empty". Throwing is the
    // loud failure we want: the caller mis-configured the column list.
    throw new Error("renderCsv: columns must be non-empty");
  }

  const lines: string[] = [];
  lines.push(columns.map((col) => escapeCell(col.header)).join(","));
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCell(col.select(row))).join(","));
  }
  return lines.join(CRLF) + CRLF;
}

/**
 * UTF-8 byte-order mark. Prepending this to a CSV makes Excel on Windows
 * auto-detect UTF-8 rather than falling back to the system code page and
 * mojibake-ing non-ASCII characters. Safe to drop for non-Excel
 * consumers: most CSV parsers strip a leading BOM transparently.
 */
export const UTF8_BOM = "﻿";
