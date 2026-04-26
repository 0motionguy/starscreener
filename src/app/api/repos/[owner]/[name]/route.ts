// GET /api/repos/[owner]/[name]
//
// Canonical per-repo profile endpoint. One call, every surface.
//
// Versioning:
//   - `?v=1` → legacy shape (unchanged from the pre-canonical endpoint):
//     { repo, score, category, reasons, social, mentions, twitterSignal,
//       whyMoving, relatedRepos, twitterAvailable }. Kept for any MCP tool
//     or CLI consumer pinned to the original contract.
//   - `?v=2` (default when the param is omitted or any other value is
//     passed) → new canonical shape assembled by buildCanonicalRepoProfile.
//     Top-level keys: ok, fetchedAt, v, repo, score, reasons, mentions,
//     freshness, twitter, npm, productHunt, revenue, funding, related.
//
// Both shapes use the same auth model (public read), the same slug regex,
// and the same cache posture as sibling read endpoints
// (`Cache-Control: public, s-maxage=30, stale-while-revalidate=60`).
//
// Error envelope (v2 + 4xx/5xx on v1):
//     { ok: false, error: string, code?: string }
// 400 = invalid slug, 404 = unknown repo, 500 = internal. Stack traces are
// logged server-side and never leaked in the response body.

import { NextRequest, NextResponse } from "next/server";

import { getDefaultSocialAdapters } from "@/lib/pipeline/adapters/social-adapters";
import {
  NitterAdapter,
  isTwitterAvailable,
} from "@/lib/pipeline/adapters/nitter-adapter";
import {
  buildDerivedWhyMoving,
  getDerivedRelatedRepos,
} from "@/lib/derived-insights";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import type { SocialMention } from "@/lib/types";
import type { RepoMention } from "@/lib/pipeline/types";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { getTwitterRepoPanel } from "@/lib/twitter/service";
import { buildCanonicalRepoProfile } from "@/lib/api/repo-profile";
import { refreshRepoMetadataFromStore } from "@/lib/repo-metadata";
import { refreshNpmFromStore } from "@/lib/npm";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

interface ErrorEnvelope {
  ok: false;
  error: string;
  code?: string;
}

function errorResponse(
  error: string,
  status: number,
  code?: string,
): NextResponse<ErrorEnvelope> {
  const body: ErrorEnvelope = code
    ? { ok: false, error, code }
    : { ok: false, error };
  return NextResponse.json(body, { status });
}

/**
 * Narrow the pipeline's RepoMention shape down to the UI's SocialMention
 * contract — drops fields the UI doesn't render (authorFollowers, reach,
 * discoveredAt, isInfluencer). v1-only helper.
 */
function toSocialMention(m: RepoMention): SocialMention {
  return {
    id: m.id,
    repoId: m.repoId,
    platform: m.platform,
    author: m.author,
    content: m.content,
    url: m.url,
    sentiment: m.sentiment,
    engagement: m.engagement,
    postedAt: m.postedAt,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;

  // Reject path-traversal / malformed slugs before touching the pipeline.
  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return errorResponse("Invalid repo slug", 400, "invalid_slug");
  }

  // Default = v2 (the canonical shape). Only an exact "1" opts in to the
  // legacy shape — anything else silently routes to v2 so typos don't leak
  // legacy data to new consumers.
  const url = new URL(request.url);
  const versionParam = url.searchParams.get("v");
  const useLegacyShape = versionParam === "1";

  if (useLegacyShape) {
    return handleV1(owner, name);
  }
  return handleV2(owner, name);
}

// ---------------------------------------------------------------------------
// v2 — canonical profile
// ---------------------------------------------------------------------------

async function handleV2(owner: string, name: string) {
  try {
    // Refresh data-store-backed caches consumed by the canonical assembler
    // (repo-metadata + npm-packages slices).
    await Promise.all([
      refreshRepoMetadataFromStore(),
      refreshNpmFromStore(),
    ]);
    const profile = await buildCanonicalRepoProfile(`${owner}/${name}`);
    if (!profile) {
      return errorResponse("Repo not found", 404, "repo_not_found");
    }
    return NextResponse.json(
      { ok: true, ...profile },
      { headers: READ_CACHE_HEADERS },
    );
  } catch (err) {
    console.error(
      `[api:repo] v2 build failed for ${owner}/${name}`,
      err,
    );
    return errorResponse("Internal error", 500, "internal_error");
  }
}

// ---------------------------------------------------------------------------
// v1 — legacy shape (kept byte-compatible with the pre-canonical endpoint)
// ---------------------------------------------------------------------------

async function handleV1(owner: string, name: string) {
  const repo = getDerivedRepoByFullName(`${owner}/${name}`);
  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  // Fan out to the live social adapters. Each adapter swallows its own
  // errors and returns []; the Promise.all wrapper is additionally guarded
  // so an exception (adapter constructor throwing, network stack offline)
  // still lets the JSON response ship with an empty mentions array.
  let mentions: SocialMention[] = [];
  try {
    const adapters = getDefaultSocialAdapters();
    if (isTwitterAvailable()) {
      adapters.push(new NitterAdapter());
    }
    const results = await Promise.all(
      adapters.map((a) => a.fetchMentionsForRepo(repo.fullName)),
    );
    mentions = results.flat().map(toSocialMention);
    mentions.sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
  } catch (err) {
    console.error(
      `[api:repo] v1 social fetch for ${repo.fullName} failed`,
      err,
    );
    mentions = [];
  }

  const whyMoving = buildDerivedWhyMoving(repo);
  const relatedRepos = getDerivedRelatedRepos(repo, 6);
  const twitterSignal = await getTwitterRepoPanel(repo.fullName);

  return NextResponse.json(
    {
      repo,
      score: null,
      category: null,
      reasons: null,
      social: [],
      mentions,
      twitterSignal,
      whyMoving,
      relatedRepos,
      twitterAvailable: isTwitterAvailable(),
    },
    { headers: READ_CACHE_HEADERS },
  );
}
