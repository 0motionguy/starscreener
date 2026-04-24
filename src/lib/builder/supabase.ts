// TrendingRepo — Supabase PostgREST client (no SDK dep).
//
// We call https://<ref>.supabase.co/rest/v1/<table> directly over `fetch`.
// This keeps the bundle small (no @supabase/supabase-js) and mirrors the
// existing codebase's "one fetch wrapper per service" style.
//
// The service key bypasses RLS; use only on the server. The publishable key
// is RLS-constrained and safe for the browser, but we never read directly
// from the browser in the P0 design — every read goes through a server
// route that caches and sanitizes.

export interface SupabaseEnv {
  url: string;
  /** Service secret (sb_secret_… or legacy SUPABASE_SERVICE_ROLE_KEY). */
  secretKey: string;
}

export function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) return null;
  return { url, secretKey };
}

export interface PostgrestError {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
}

export class PostgrestHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: PostgrestError | string,
  ) {
    super(typeof body === "string" ? body : body.message);
    this.name = "PostgrestHttpError";
  }
}

/**
 * Build a PostgREST URL with query parameters.
 *
 * Example: buildUrl(env, "builder_ideas", { select: "*", "slug": "eq.foo" })
 */
function buildUrl(
  env: SupabaseEnv,
  table: string,
  query?: Record<string, string>,
): string {
  const base = `${env.url.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(table)}`;
  if (!query || Object.keys(query).length === 0) return base;
  const qs = new URLSearchParams(query).toString();
  return `${base}?${qs}`;
}

function baseHeaders(env: SupabaseEnv): Record<string, string> {
  return {
    apikey: env.secretKey,
    Authorization: `Bearer ${env.secretKey}`,
    "Content-Type": "application/json",
  };
}

/** SELECT rows. Pass PostgREST-style filters as query params. */
export async function selectRows<T>(
  env: SupabaseEnv,
  table: string,
  query: Record<string, string> = {},
): Promise<T[]> {
  const res = await fetch(buildUrl(env, table, query), {
    method: "GET",
    headers: baseHeaders(env),
    cache: "no-store",
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T[];
}

/** INSERT a single row (or many). `returning` defaults to representation. */
export async function insertRows<T, R = T>(
  env: SupabaseEnv,
  table: string,
  rows: T | T[],
  opts: { onConflict?: string; returning?: "representation" | "minimal" } = {},
): Promise<R[]> {
  const query: Record<string, string> = {};
  if (opts.onConflict) query.on_conflict = opts.onConflict;
  const res = await fetch(buildUrl(env, table, query), {
    method: "POST",
    headers: {
      ...baseHeaders(env),
      Prefer:
        (opts.onConflict ? "resolution=merge-duplicates" : "") +
        (opts.returning === "minimal" ? ",return=minimal" : ",return=representation"),
    },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  if (!res.ok) throw await toError(res);
  if (opts.returning === "minimal") return [];
  return (await res.json()) as R[];
}

/** UPDATE rows matching a PostgREST filter. */
export async function updateRows<T, R = T>(
  env: SupabaseEnv,
  table: string,
  filter: Record<string, string>,
  patch: Partial<T>,
): Promise<R[]> {
  const res = await fetch(buildUrl(env, table, filter), {
    method: "PATCH",
    headers: {
      ...baseHeaders(env),
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as R[];
}

/** DELETE rows matching a filter; returns count deleted. */
export async function deleteRows(
  env: SupabaseEnv,
  table: string,
  filter: Record<string, string>,
): Promise<number> {
  const res = await fetch(buildUrl(env, table, filter), {
    method: "DELETE",
    headers: {
      ...baseHeaders(env),
      Prefer: "return=representation",
    },
  });
  if (!res.ok) throw await toError(res);
  const body = (await res.json()) as unknown[];
  return body.length;
}

async function toError(res: Response): Promise<PostgrestHttpError> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      const body = (await res.json()) as PostgrestError;
      return new PostgrestHttpError(res.status, body);
    } catch {
      // fall through
    }
  }
  const text = await res.text();
  return new PostgrestHttpError(res.status, text);
}
