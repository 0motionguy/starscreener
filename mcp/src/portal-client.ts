// TrendingRepo MCP — Portal /portal/call client.
//
// The three Portal-canonical tools (top_gainers, search_repos,
// maintainer_profile) route through the TrendingRepo Next.js app's
// `/portal/call` endpoint rather than the legacy REST routes so the
// MCP server and the Portal manifest are backed by identical handlers.
// The drift-free guarantee of the Phase-1 shared src/tools/ layer
// depends on this.

import { readEnv } from "./client.js";

export interface CallEnvelopeOk<T> {
  ok: true;
  result: T;
}

export interface CallEnvelopeErr {
  ok: false;
  error: string;
  code: "NOT_FOUND" | "INVALID_PARAMS" | "UNAUTHORIZED" | "RATE_LIMITED" | "INTERNAL";
}

export type CallEnvelope<T = unknown> = CallEnvelopeOk<T> | CallEnvelopeErr;

export class PortalCallError extends Error {
  readonly code: CallEnvelopeErr["code"] | "TRANSPORT";
  readonly url: string;

  constructor(
    message: string,
    code: CallEnvelopeErr["code"] | "TRANSPORT",
    url: string,
  ) {
    super(message);
    this.name = "PortalCallError";
    this.code = code;
    this.url = url;
  }
}

export class PortalClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { baseUrl?: string; fetchImpl?: typeof fetch } = {}) {
    const raw =
      opts.baseUrl ??
      readEnv("TRENDINGREPO_API_URL", "STARSCREENER_API_URL") ??
      "http://localhost:3023";
    this.baseUrl = raw.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "global fetch is not available — this MCP server requires Node 20+",
      );
    }
  }

  /**
   * Call `tool` with `params` over POST /portal/call and return the `result`
   * field on success. Throws `PortalCallError` on any handled error envelope
   * so the MCP run() wrapper can surface it as isError:true.
   */
  async call<T = unknown>(
    tool: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}/portal/call`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ tool, params }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new PortalCallError(
        `portal fetch failed: ${msg}`,
        "TRANSPORT",
        url,
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new PortalCallError(
        `portal returned non-JSON body (status ${res.status})`,
        "TRANSPORT",
        url,
      );
    }

    if (
      body &&
      typeof body === "object" &&
      "ok" in body &&
      (body as { ok: unknown }).ok === true &&
      "result" in body
    ) {
      return (body as CallEnvelopeOk<T>).result;
    }

    if (
      body &&
      typeof body === "object" &&
      "ok" in body &&
      (body as { ok: unknown }).ok === false
    ) {
      const err = body as CallEnvelopeErr;
      throw new PortalCallError(err.error, err.code, url);
    }

    throw new PortalCallError(
      `portal returned malformed envelope: ${JSON.stringify(body).slice(0, 200)}`,
      "TRANSPORT",
      url,
    );
  }
}
