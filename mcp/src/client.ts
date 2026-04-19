/**
 * HTTP client for the StarScreener REST API.
 *
 * Wraps the public read endpoints served by the Next.js app at
 * STARSCREENER_API_URL (default http://localhost:3023) and exposes small,
 * typed helpers that the MCP tool handlers delegate to. No response caching —
 * the pipeline is already the single source of truth for momentum/deltas and
 * recomputes on ensureReady(), so every tool call hits fresh data.
 *
 * All helpers throw StarScreenerApiError on non-2xx so the MCP layer can
 * surface a clean `isError: true` result with the status + body.
 */

// NOTE: types are intentionally loose `unknown`/`Record<string, unknown>` at
// the client boundary. The REST responses are the authoritative shape; we pass
// them through to the model as JSON rather than re-validating. Adding a Zod
// decoder here would double-validate every field when the upstream Next.js
// routes already enforce their own contracts.

export interface StarScreenerClientOptions {
  baseUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export class StarScreenerApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly url: string;

  constructor(status: number, body: string, url: string) {
    super(
      `StarScreener API ${status} for ${url}: ${body.slice(0, 500)}`,
    );
    this.name = "StarScreenerApiError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

export class StarScreenerClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: StarScreenerClientOptions = {}) {
    const raw =
      opts.baseUrl ??
      process.env.STARSCREENER_API_URL ??
      "http://localhost:3023";
    // Strip trailing slash so we can always concat `${baseUrl}/api/...`.
    this.baseUrl = raw.replace(/\/+$/, "");
    this.token = opts.token ?? process.env.STARSCREENER_API_TOKEN;
    // Node 20+ has a global fetch. Accept an override for tests.
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "global fetch is not available — this MCP server requires Node 20+",
      );
    }
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (this.token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${this.token}`);
    }
    const res = await this.fetchImpl(url, { ...init, headers });
    const text = await res.text();
    if (!res.ok) {
      throw new StarScreenerApiError(res.status, text, url);
    }
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new StarScreenerApiError(
        res.status,
        `invalid JSON body: ${(err as Error).message}`,
        url,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Endpoint wrappers
  // ---------------------------------------------------------------------

  /**
   * Top-momentum repos. `window` is the MCP-level vocabulary
   * ("24h"|"7d"|"30d"); the REST API uses "today"|"week"|"month".
   */
  async getTrending(params: {
    window?: "24h" | "7d" | "30d";
    limit?: number;
    filter?: string;
    category?: string;
    sort?: "momentum" | "stars-today" | "stars-total" | "newest";
  }): Promise<unknown> {
    const period = windowToPeriod(params.window ?? "7d");
    const qs = new URLSearchParams();
    qs.set("period", period);
    qs.set("limit", String(clampLimit(params.limit, 20, 100)));
    if (params.filter) qs.set("filter", params.filter);
    if (params.category) qs.set("category", params.category);
    if (params.sort) qs.set("sort", params.sort);
    return this.request(`/api/repos?${qs.toString()}`);
  }

  /**
   * Breakout repos. Delegates to /api/repos?filter=breakouts which applies
   * the pipeline's movementStatus === "breakout" filter and sorts by
   * momentum by default.
   */
  async getBreakouts(params: {
    limit?: number;
    window?: "24h" | "7d" | "30d";
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    qs.set("filter", "breakouts");
    qs.set("period", windowToPeriod(params.window ?? "7d"));
    qs.set("sort", "momentum");
    qs.set("limit", String(clampLimit(params.limit, 20, 100)));
    return this.request(`/api/repos?${qs.toString()}`);
  }

  /**
   * Recently-created repos (< 30 days old on the platform).
   */
  async getNewRepos(params: {
    limit?: number;
    window?: "24h" | "7d" | "30d";
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    qs.set("filter", "new-under-30d");
    qs.set("period", windowToPeriod(params.window ?? "30d"));
    qs.set("sort", "newest");
    qs.set("limit", String(clampLimit(params.limit, 20, 100)));
    return this.request(`/api/repos?${qs.toString()}`);
  }

  async searchRepos(params: {
    query: string;
    limit?: number;
    category?: string;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    qs.set("q", params.query);
    qs.set("limit", String(clampLimit(params.limit, 20, 100)));
    if (params.category) qs.set("category", params.category);
    return this.request(`/api/search?${qs.toString()}`);
  }

  /**
   * Full repo detail — hits the slug route /api/repos/[owner]/[name] which
   * returns repo + score + category + reasons + social + related.
   */
  async getRepo(params: { fullName: string }): Promise<unknown> {
    const slug = params.fullName.trim();
    const [owner, name] = slug.split("/");
    if (!owner || !name) {
      throw new Error(
        `fullName must look like "owner/name", got: ${params.fullName}`,
      );
    }
    const ownerEnc = encodeURIComponent(owner);
    const nameEnc = encodeURIComponent(name);
    return this.request(`/api/repos/${ownerEnc}/${nameEnc}`);
  }

  /**
   * Side-by-side compare of 2–4 repos. The REST route accepts either
   * "owner/name" or "owner--name"; we pass through unchanged.
   */
  async compareRepos(params: { fullNames: string[] }): Promise<unknown> {
    const qs = new URLSearchParams();
    qs.set("repos", params.fullNames.join(","));
    return this.request(`/api/compare?${qs.toString()}`);
  }

  async getCategories(): Promise<unknown> {
    return this.request(`/api/categories`);
  }

  /**
   * Repos inside a single category. Reuses /api/repos with ?category=.
   */
  async getCategoryRepos(params: {
    categoryId: string;
    limit?: number;
    window?: "24h" | "7d" | "30d";
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    qs.set("category", params.categoryId);
    qs.set("period", windowToPeriod(params.window ?? "7d"));
    qs.set("sort", "momentum");
    qs.set("limit", String(clampLimit(params.limit, 20, 100)));
    return this.request(`/api/repos?${qs.toString()}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function windowToPeriod(w: "24h" | "7d" | "30d"): "today" | "week" | "month" {
  switch (w) {
    case "24h":
      return "today";
    case "7d":
      return "week";
    case "30d":
      return "month";
  }
}

function clampLimit(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined || value === null) return fallback;
  if (!Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  if (n < 1) return 1;
  if (n > max) return max;
  return n;
}
