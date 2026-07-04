import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseBody } from "@/lib/api/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const Schema = z.object({
  action: z.literal("web_search"),
  query: z.string().trim().min(2).max(240),
  limit: z.coerce.number().int().min(1).max(5).optional(),
});

function cleanText(raw: unknown, max = 240): string {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function collectSignals(body: unknown): unknown[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const candidates = [
    root.signals,
    root.results,
    (root.output as Record<string, unknown> | undefined)?.signals,
    (root.output as Record<string, unknown> | undefined)?.results,
    (root.result as Record<string, unknown> | undefined)?.signals,
    (root.result as Record<string, unknown> | undefined)?.results,
  ];
  return candidates.find(Array.isArray) ?? [];
}

function summarize(signal: unknown): { title: string; url: string; snippet: string } | null {
  if (!signal || typeof signal !== "object") return null;
  const obj = signal as Record<string, unknown>;
  const value = (obj.value && typeof obj.value === "object" ? obj.value : obj) as Record<string, unknown>;
  const title = cleanText(value.title ?? value.name ?? obj.title, 120);
  const url = cleanText(value.url ?? value.href ?? obj.url, 260);
  const snippet = cleanText(value.snippet ?? value.description ?? value.markdown ?? value.content, 280);
  if (!title && !url && !snippet) return null;
  return { title: title || url || "Toolbox result", url, snippet };
}

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, Schema, {
    publicMessage: "invalid request",
    includeDetails: false,
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", error: "invalid request" },
      { status: 400, headers: NO_STORE },
    );
  }
  const { query } = parsed.data;

  const key =
    process.env.TOOLBOX_API_KEY?.trim() ||
    process.env.TOOLBOX_ADMIN_TOKEN?.trim() ||
    process.env.AISO_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { ok: false, code: "NOT_CONFIGURED", error: "Toolbox API key is not configured" },
      { status: 200, headers: NO_STORE },
    );
  }

  const base = (process.env.TOOLBOX_API_URL || "https://api.aiso.tools").replace(/\/+$/, "");
  const limit = parsed.data.limit ?? 3;

  try {
    const res = await fetch(`${base}/v1/skills/web.search.v1/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        input: {
          query,
          limit,
          scrape_content: true,
          search_strategy: "single",
        },
      }),
      signal: AbortSignal.timeout(18_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, code: "UPSTREAM", error: "Toolbox search failed" },
        { status: 200, headers: NO_STORE },
      );
    }

    const body = (await res.json()) as unknown;
    return NextResponse.json(
      {
        ok: true,
        action: "web_search",
        query,
        results: collectSignals(body).map(summarize).filter(Boolean).slice(0, limit),
      },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { ok: false, code: "TIMEOUT", error: "Toolbox search timed out" },
      { status: 200, headers: NO_STORE },
    );
  }
}
