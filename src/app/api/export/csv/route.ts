// POST /api/export/csv — Pro-tier CSV export.
//
// Takes a list of repo fullNames + a column selector, returns a CSV
// attachment suitable for Excel / Google Sheets / pandas.read_csv.
//
// Auth: cookie-session (ss_user) or x-user-token / Authorization: Bearer.
//       Missing / bad auth → 401.
// Gate: canUseFeature(userId, "csv.export"). Free / anonymous tiers get
//       a 402 Payment Required with an upsell body pointing at /pricing.
//
// Data source: derived-repos (the same in-memory view the homepage +
// terminal layouts use). Unknown fullNames are silently skipped so a
// caller that passes a mix of live + stale repos gets a partial export
// rather than an all-or-nothing 404.
//
// Column allow-list: explicit enumeration, rejects unknown keys with 400.
// Prevents a caller from trawling internal fields via surprise keys and
// keeps the export schema stable.
//
// Caps: 1000 fullNames per request. Enough for the entire homepage +
// breakouts + a big collection; small enough that we never build a
// pathological response that locks up the node process.
//
// Note on entitlements: this route imports `canUseFeature` from
// @/lib/pricing/entitlements. That module is owned by the parallel
// pricing agent. If this route is pulled into a branch where the
// entitlements module isn't present, fix by merging the pricing branch
// first — do NOT stub `canUseFeature` here.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { canUseFeature } from "@/lib/pricing/entitlements";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { renderCsv, type CsvColumn, UTF8_BOM } from "@/lib/export/csv";
import type { Repo } from "@/lib/types";
import { getFundingMatchCounts } from "@/lib/funding/repo-events";
import {
  getRevenueOverlay,
  refreshRevenueOverlaysFromStore,
} from "@/lib/revenue-overlays";
import {
  getRepoMetadata,
  refreshRepoMetadataFromStore,
} from "@/lib/repo-metadata";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on the number of repos one export request may cover. */
const MAX_EXPORT_ROWS = 1000;

/**
 * Preset column sets — caller-friendly shortcuts so the UI / CLI don't
 * have to type out the full column array for common views.
 */
type PresetName = "breakouts" | "funding" | "revenue";

const PRESET_COLUMNS: Record<PresetName, readonly ExportColumnKey[]> = {
  breakouts: ["fullName", "stars", "language", "momentum", "crossSignal", "delta24h", "delta7d", "url"],
  funding: ["fullName", "stars", "language", "hasFunding", "homepageUrl", "url"],
  revenue: ["fullName", "stars", "language", "hasRevenue", "homepageUrl", "url"],
};

/** Column allow-list. Order here is only a default — the caller's `columns`
 *  array fixes the output order. Unknown columns → 400. */
const EXPORT_COLUMN_KEYS = [
  "fullName",
  "stars",
  "language",
  "momentum",
  "crossSignal",
  "delta24h",
  "delta7d",
  "lastCommit",
  "description",
  "url",
  "topics",
  "homepageUrl",
  "hasRevenue",
  "hasFunding",
  "movement",
] as const;

type ExportColumnKey = (typeof EXPORT_COLUMN_KEYS)[number];

const EXPORT_COLUMN_SET = new Set<string>(EXPORT_COLUMN_KEYS);

interface ExportRow {
  repo: Repo;
  hasRevenue: boolean;
  hasFunding: boolean;
}

/**
 * Column table. Keyed by the public column key so the builder below can
 * pick requested columns in caller-supplied order without reordering
 * this table.
 *
 * `null` / `undefined` render as an empty CSV cell (not "null") —
 * renderCsv handles that in one place.
 */
const COLUMN_TABLE: Record<ExportColumnKey, CsvColumn<ExportRow>> = {
  fullName: { header: "fullName", select: (r) => r.repo.fullName },
  stars: { header: "stars", select: (r) => r.repo.stars },
  language: { header: "language", select: (r) => r.repo.language ?? "" },
  momentum: { header: "momentum", select: (r) => r.repo.momentumScore },
  crossSignal: { header: "crossSignal", select: (r) => r.repo.crossSignalScore ?? 0 },
  delta24h: { header: "delta24h", select: (r) => r.repo.starsDelta24h },
  delta7d: { header: "delta7d", select: (r) => r.repo.starsDelta7d },
  lastCommit: { header: "lastCommit", select: (r) => r.repo.lastCommitAt },
  description: { header: "description", select: (r) => r.repo.description },
  url: { header: "url", select: (r) => r.repo.url },
  // `topics` is a string array. We join with "; " rather than "," so the
  // cell stays one CSV field without needing quoting for the separator,
  // and so splitting back on "; " in a caller yields the original list.
  topics: { header: "topics", select: (r) => (r.repo.topics ?? []).join("; ") },
  // homepageUrl is not a first-class Repo field — it lives on
  // repo-metadata.json. When absent we render empty rather than guessing.
  homepageUrl: {
    header: "homepageUrl",
    select: (r) => getRepoMetadata(r.repo.fullName)?.homepageUrl ?? "",
  },
  hasRevenue: { header: "hasRevenue", select: (r) => (r.hasRevenue ? "true" : "false") },
  hasFunding: { header: "hasFunding", select: (r) => (r.hasFunding ? "true" : "false") },
  movement: { header: "movement", select: (r) => r.repo.movementStatus },
};

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

// Shape gate via Zod — fullNames is the only field with a clean cardinality
// rule. The preset/columns union has too much custom error shape (UNKNOWN_PRESET,
// UNKNOWN_COLUMN with a details payload) to fit cleanly in Zod, so we
// resolve it post-parse via resolveColumns.
// MAX_EXPORT_ROWS is checked post-parse so it can keep the discrete
// `code: TOO_MANY_REPOS` discriminator clients depend on. Inside Zod
// it would collapse into a generic BAD_REQUEST.
const ExportBodySchema = z.object({
  fullNames: z
    .array(
      z.string().min(1, "fullNames entries must be non-empty strings"),
      { message: "fullNames must be an array of strings" },
    )
    .min(1, "fullNames must be non-empty"),
  preset: z.string().optional(),
  columns: z.unknown().optional(),
});

interface ParsedBody {
  fullNames: string[];
  columns: ExportColumnKey[];
}

interface ParseError {
  status: number;
  body: { ok: false; error: string; code: string; details?: unknown };
}

function resolveColumns(
  body: z.infer<typeof ExportBodySchema>,
): ParsedBody | ParseError {
  let columns: ExportColumnKey[];
  if (typeof body.preset === "string") {
    const preset = body.preset;
    if (!(preset in PRESET_COLUMNS)) {
      return {
        status: 400,
        body: {
          ok: false,
          error: `unknown preset "${preset}" (allowed: ${Object.keys(PRESET_COLUMNS).join(", ")})`,
          code: "UNKNOWN_PRESET",
        },
      };
    }
    columns = [...PRESET_COLUMNS[preset as PresetName]];
  } else {
    if (!Array.isArray(body.columns)) {
      return {
        status: 400,
        body: {
          ok: false,
          error: "columns must be an array of strings (or use `preset`)",
          code: "BAD_REQUEST",
        },
      };
    }
    if (body.columns.length === 0) {
      return {
        status: 400,
        body: { ok: false, error: "columns must be non-empty", code: "BAD_REQUEST" },
      };
    }
    const unknownCols: string[] = [];
    const known: ExportColumnKey[] = [];
    for (const col of body.columns as unknown[]) {
      if (typeof col !== "string") {
        return {
          status: 400,
          body: { ok: false, error: "columns entries must be strings", code: "BAD_REQUEST" },
        };
      }
      if (!EXPORT_COLUMN_SET.has(col)) {
        unknownCols.push(col);
        continue;
      }
      known.push(col as ExportColumnKey);
    }
    if (unknownCols.length > 0) {
      return {
        status: 400,
        body: {
          ok: false,
          error: `unknown columns: ${unknownCols.join(", ")}`,
          code: "UNKNOWN_COLUMN",
          details: { allowed: EXPORT_COLUMN_KEYS },
        },
      };
    }
    columns = known;
  }

  return { fullNames: body.fullNames, columns };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/** YYYY-MM-DD in UTC — used in the attachment filename. */
function todayIso(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Refresh data-store-backed caches before serializing rows. Both have
  // internal 30s rate-limits so back-to-back exports don't burn quota:
  //   - repo-metadata (Group A) — homepageUrl + description columns
  //   - revenue-overlays (Group C) — revenue badge column
  await Promise.all([
    refreshRepoMetadataFromStore(),
    refreshRevenueOverlaysFromStore(),
  ]);

  // 1. Auth
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const { userId } = auth;

  // 2. Entitlement
  const allowed = await canUseFeature(userId, "csv.export");
  if (!allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "csv-export is a Pro-tier feature",
        code: "PAYMENT_REQUIRED",
        upgradeUrl: "/pricing#pro",
      },
      { status: 402 },
    );
  }

  // 3. Parse
  const parsedShape = await parseBody(request, ExportBodySchema, {
    includeDetails: false,
  });
  if (!parsedShape.ok) {
    // Re-shape onto the route's error envelope which carries `code`.
    const errBody = await parsedShape.response.json();
    return NextResponse.json(
      {
        ok: false,
        error: errBody.error ?? "validation failed",
        code: "BAD_REQUEST",
      },
      { status: parsedShape.response.status },
    );
  }
  if (parsedShape.data.fullNames.length > MAX_EXPORT_ROWS) {
    return NextResponse.json(
      {
        ok: false,
        error: `too many repos (max ${MAX_EXPORT_ROWS})`,
        code: "TOO_MANY_REPOS",
      },
      { status: 400 },
    );
  }
  const parsed = resolveColumns(parsedShape.data);
  if ("status" in parsed) {
    return NextResponse.json(parsed.body, { status: parsed.status });
  }

  // 4. Resolve repos (dedupe + cap)
  const seen = new Set<string>();
  const rows: ExportRow[] = [];
  // Fetch the funding-match count once so the hasFunding cell is O(1) per row.
  let fundingCounts: Map<string, number>;
  try {
    fundingCounts = getFundingMatchCounts();
  } catch {
    fundingCounts = new Map();
  }

  for (const raw of parsed.fullNames) {
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const repo = getDerivedRepoByFullName(raw);
    if (!repo) continue;
    const hasRevenue = getRevenueOverlay(repo.fullName) !== null;
    const hasFunding = (fundingCounts.get(repo.fullName.toLowerCase()) ?? 0) > 0;
    rows.push({ repo, hasRevenue, hasFunding });
    if (rows.length >= MAX_EXPORT_ROWS) break;
  }

  // 5. Render
  const columnConfigs = parsed.columns.map((key) => COLUMN_TABLE[key]);
  const body = UTF8_BOM + renderCsv(rows, columnConfigs);

  // 6. Respond as a CSV attachment.
  const filename = `starscreener-export-${todayIso()}.csv`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // User-specific data. Short-cache per-user at most — never a
      // public cache.
      "Cache-Control": "private, max-age=60",
      // Advertise which columns actually made it into the payload — useful
      // for UI that wants to render a success toast without re-parsing.
      "X-Starscreener-Columns": parsed.columns.join(","),
      "X-Starscreener-Row-Count": String(rows.length),
    },
  });
}
