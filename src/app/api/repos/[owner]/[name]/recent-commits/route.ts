// GET /api/repos/[owner]/[name]/recent-commits
//
// Hover-preview helper for RepoCard (AGN-645). Returns the 3 latest
// commits on the default branch as a slim shape:
//   { sha, message (first line only), authorLogin, authorAvatarUrl,
//     committedAt, htmlUrl }
//
// Uses the pool-aware githubFetch helper so hover spam doesn't burn
// quota outside the token-pool accounting. Cached aggressively (s-
// maxage=300, swr=3600) — three commits don't need second-level
// freshness, and the client also caches per-session.

import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope } from "@/lib/api/error-response";
import { READ_SLOW_HEADERS } from "@/lib/api/cache";
import { githubFetch } from "@/lib/github-fetch";

export const runtime = "nodejs";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;
const COMMIT_LIMIT = 3;

interface RawGithubCommit {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
    committer?: { date?: string };
  };
  author?: { login?: string; avatar_url?: string } | null;
}

export interface RecentCommit {
  sha: string;
  shortSha: string;
  message: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  committedAt: string | null;
  htmlUrl: string;
}

function firstLine(message: string): string {
  const trimmed = message.trim();
  const newlineIdx = trimmed.indexOf("\n");
  return newlineIdx === -1 ? trimmed : trimmed.slice(0, newlineIdx);
}

function normalizeCommit(raw: RawGithubCommit): RecentCommit | null {
  if (!raw.sha) return null;
  const message = raw.commit?.message ?? "";
  return {
    sha: raw.sha,
    shortSha: raw.sha.slice(0, 7),
    message: firstLine(message),
    authorLogin: raw.author?.login ?? null,
    authorAvatarUrl: raw.author?.avatar_url ?? null,
    committedAt:
      raw.commit?.committer?.date ?? raw.commit?.author?.date ?? null,
    htmlUrl: raw.html_url ?? `https://github.com/`,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;

  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return NextResponse.json(errorEnvelope("Invalid repo slug"), {
      status: 400,
    });
  }

  const result = await githubFetch(
    `/repos/${owner}/${name}/commits?per_page=${COMMIT_LIMIT}`,
    {
      operation: "repos.recent-commits",
      next: { revalidate: 300 },
      cache: "default",
    },
  );

  if (!result) {
    return NextResponse.json(errorEnvelope("GitHub upstream unavailable"), {
      status: 503,
      headers: READ_SLOW_HEADERS,
    });
  }

  if (!result.response.ok) {
    const status = result.response.status;
    if (status === 404) {
      return NextResponse.json(errorEnvelope("Repo not found on GitHub"), {
        status: 404,
        headers: READ_SLOW_HEADERS,
      });
    }
    if (status === 403 || status === 429) {
      return NextResponse.json(errorEnvelope("Rate limited", "RATE_LIMITED"), {
        status: 503,
        headers: READ_SLOW_HEADERS,
      });
    }
    return NextResponse.json(errorEnvelope("Upstream error"), {
      status: 502,
      headers: READ_SLOW_HEADERS,
    });
  }

  let raw: unknown;
  try {
    raw = await result.response.json();
  } catch {
    return NextResponse.json(errorEnvelope("Upstream parse error"), {
      status: 502,
      headers: READ_SLOW_HEADERS,
    });
  }

  if (!Array.isArray(raw)) {
    return NextResponse.json(errorEnvelope("Upstream shape mismatch"), {
      status: 502,
      headers: READ_SLOW_HEADERS,
    });
  }

  const commits: RecentCommit[] = [];
  for (const entry of raw) {
    const normalized = normalizeCommit(entry as RawGithubCommit);
    if (normalized) commits.push(normalized);
    if (commits.length >= COMMIT_LIMIT) break;
  }

  return NextResponse.json(
    {
      ok: true,
      fullName: `${owner}/${name}`,
      count: commits.length,
      commits,
    },
    { headers: READ_SLOW_HEADERS },
  );
}
