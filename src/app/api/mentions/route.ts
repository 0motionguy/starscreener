import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, serverError } from "@/lib/api/error-response";
import { DataStoreFatalError } from "@/lib/errors";
import { pipeline } from "@/lib/pipeline/pipeline";
import { mentionStore } from "@/lib/pipeline/storage/singleton";
import type { RepoMention } from "@/lib/pipeline/types";
import type { SocialPlatform } from "@/lib/types";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;

const SOURCE_ALIASES: Readonly<Record<string, SocialPlatform>> = {
  hn: "hackernews",
  hackernews: "hackernews",
  reddit: "reddit",
  bluesky: "bluesky",
  twitter: "twitter",
  devto: "devto",
  github: "github",
  producthunt: "producthunt",
  lobsters: "lobsters",
  npm: "npm",
  huggingface: "huggingface",
  arxiv: "arxiv",
};

function parseSinceWindow(since: string): number | null {
  const trimmed = since.trim().toLowerCase();
  const match = /^(\d+)([hd])$/.exec(trimmed);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value) || value < 1) return null;
  const unitMs = match[2] === "h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return value * unitMs;
}

function getAllMentionsFromStore(): RepoMention[] {
  const internal = mentionStore as unknown as { byRepo: Map<string, RepoMention[]> };
  const out: RepoMention[] = [];
  for (const rows of internal.byRepo.values()) {
    out.push(...rows);
  }
  return out;
}

function sortMentionsNewestFirst(a: RepoMention, b: RepoMention): number {
  if (a.postedAt !== b.postedAt) return a.postedAt < b.postedAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const sourceRaw = url.searchParams.get("source");
  const sinceRaw = url.searchParams.get("since");

  let source: SocialPlatform | undefined;
  if (sourceRaw) {
    const mapped = SOURCE_ALIASES[sourceRaw.trim().toLowerCase()];
    if (!mapped) {
      return NextResponse.json(errorEnvelope("Invalid source", "invalid_source"), {
        status: 400,
      });
    }
    source = mapped;
  }

  let thresholdMs = 0;
  if (sinceRaw) {
    const sinceDurationMs = parseSinceWindow(sinceRaw);
    if (sinceDurationMs === null) {
      return NextResponse.json(
        errorEnvelope("Invalid since; expected formats like 24h or 7d", "invalid_since"),
        { status: 400 },
      );
    }
    thresholdMs = Date.now() - sinceDurationMs;
  }

  try {
    await pipeline.ensureReady();
    let rows = getAllMentionsFromStore();

    if (source) {
      rows = rows.filter((mention) => mention.platform === source);
    }

    if (thresholdMs > 0) {
      rows = rows.filter((mention) => {
        const postedAtMs = Date.parse(mention.postedAt);
        return Number.isFinite(postedAtMs) && postedAtMs >= thresholdMs;
      });
    }

    rows.sort(sortMentionsNewestFirst);

    return NextResponse.json(
      {
        ok: true as const,
        fetchedAt: new Date().toISOString(),
        count: rows.length,
        filters: {
          source: source ?? null,
          since: sinceRaw ?? null,
        },
        items: rows,
      },
      { headers: CACHE_HEADERS },
    );
  } catch (err) {
    const wrapped = new DataStoreFatalError("mentions route failed", {
      route: "api/mentions",
      message: err instanceof Error ? err.message : String(err),
      source: source ?? null,
      since: sinceRaw ?? null,
    });
    return serverError(wrapped, {
      scope: "[api/mentions:GET]",
      publicMessage: "Internal error",
      code: "internal_error",
    });
  }
}
