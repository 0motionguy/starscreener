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
  /**
   * Per-user bearer that, when present, is sent as `x-user-token: <value>`
   * on every request. Resolves to a userId server-side (verifyUserAuth)
   * so usage metering can attribute each MCP call. Default:
   * `process.env.STARSCREENER_USER_TOKEN`. Back-compat: omitting this
   * simply skips the header, which is what pre-metering installs want.
   */
  userToken?: string;
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
  private readonly userToken: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: StarScreenerClientOptions = {}) {
    const raw =
      opts.baseUrl ??
      process.env.STARSCREENER_API_URL ??
      "http://localhost:3023";
    // Strip trailing slash so we can always concat `${baseUrl}/api/...`.
    this.baseUrl = raw.replace(/\/+$/, "");
    this.token = opts.token ?? process.env.STARSCREENER_API_TOKEN;
    // Per-user bearer for MCP usage metering — back-compat: unset = no header.
    // NEVER log this value.
    this.userToken =
      opts.userToken ?? process.env.STARSCREENER_USER_TOKEN ?? undefined;
    // Node 20+ has a global fetch. Accept an override for tests.
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "global fetch is not available — this MCP server requires Node 20+",
      );
    }
  }

  /** Exposed for the metering middleware in server.ts; never logs the value. */
  getUserToken(): string | undefined {
    return this.userToken;
  }

  /** Exposed for the metering middleware in server.ts. */
  getBaseUrl(): string {
    return this.baseUrl;
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
    if (this.userToken && !headers.has("x-user-token")) {
      headers.set("x-user-token", this.userToken);
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
   * Canonical profile for a single repo — /api/repos/[owner]/[name]?v=2.
   *
   * Returns one stitched shape with:
   *   repo, score, reasons, mentions{recent,nextCursor,countsBySource},
   *   freshness, twitter, npm{packages,dailyDownloads,dependents},
   *   productHunt, revenue{verified,selfReported,trustmrrClaim}, funding,
   *   related, prediction, ideas.
   *
   * Consumers get everything in one tool call instead of stitching six or
   * seven legacy endpoints. The canonical route answers 404 { ok:false,
   * error:"Repo not found", code:"repo_not_found" } for unknown repos;
   * that is surfaced as StarScreenerApiError by request() below.
   */
  async getRepoProfileFull(params: { fullName: string }): Promise<unknown> {
    const { owner, name } = splitFullName(params.fullName);
    const ownerEnc = encodeURIComponent(owner);
    const nameEnc = encodeURIComponent(name);
    return this.request(`/api/repos/${ownerEnc}/${nameEnc}?v=2`);
  }

  /**
   * Paginated evidence feed for a repo — /api/repos/[owner]/[name]/mentions.
   *
   * `source` narrows to a single SocialPlatform. `cursor` is an opaque
   * base64url token returned by the previous page; callers must pass it back
   * unchanged. `limit` is clamped server-side to 1..200.
   */
  async getRepoMentionsPage(params: {
    fullName: string;
    source?: string;
    cursor?: string;
    limit?: number;
  }): Promise<unknown> {
    const { owner, name } = splitFullName(params.fullName);
    const ownerEnc = encodeURIComponent(owner);
    const nameEnc = encodeURIComponent(name);
    const qs = new URLSearchParams();
    if (params.source) qs.set("source", params.source);
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.limit !== undefined) {
      qs.set("limit", String(clampLimit(params.limit, 50, 200)));
    }
    const query = qs.toString();
    const suffix = query.length > 0 ? `?${query}` : "";
    return this.request(
      `/api/repos/${ownerEnc}/${nameEnc}/mentions${suffix}`,
    );
  }

  /**
   * Per-repo freshness chips — /api/repos/[owner]/[name]/freshness.
   *
   * The freshness snapshot itself is global (scanners are per-source, not
   * per-repo); the route's owner/name in the URL is used purely to validate
   * that the repo exists. A 404 from the route surfaces as
   * StarScreenerApiError on the MCP side.
   */
  async getRepoFreshness(params: { fullName: string }): Promise<unknown> {
    const { owner, name } = splitFullName(params.fullName);
    const ownerEnc = encodeURIComponent(owner);
    const nameEnc = encodeURIComponent(name);
    return this.request(`/api/repos/${ownerEnc}/${nameEnc}/freshness`);
  }

  /**
   * AISO scan status for a repo — GET /api/repos/[owner]/[name]/aiso.
   *
   * Returns { ok, status: "scanned"|"queued"|"rate_limited"|"failed"|"none",
   * score, tier, dimensions, topDimensions, lastScanAt, signals,
   * engineCitations, resultUrl }. `status:"none"` means the repo is
   * known but has never been scanned (no website or never queued).
   *
   * Read-only — POST (rescan enqueue) is intentionally NOT exposed via MCP.
   */
  async getRepoAiso(params: { fullName: string }): Promise<unknown> {
    const { owner, name } = splitFullName(params.fullName);
    const ownerEnc = encodeURIComponent(owner);
    const nameEnc = encodeURIComponent(name);
    return this.request(`/api/repos/${ownerEnc}/${nameEnc}/aiso`);
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

/**
 * Split a `"owner/name"` slug into parts, throwing a plain Error on malformed
 * input so the MCP run() wrapper surfaces the message (rather than emitting
 * a StarScreenerApiError that would imply the API was contacted).
 */
function splitFullName(fullName: string): { owner: string; name: string } {
  const slug = (fullName ?? "").trim();
  const parts = slug.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `fullName must look like "owner/name", got: ${fullName}`,
    );
  }
  return { owner: parts[0], name: parts[1] };
}

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
