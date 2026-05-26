// GET /api/search/global — fast typeahead search across repos + LLMs.
//
// Powers the Topbar live-search dropdown. Substring (case-insensitive) match
// over the small set of fields a user is likely to type: fullName, owner,
// name, description, topics for repos; name, creator, slug for LLMs.
//
// Returns at most 6 repos + 4 LLMs by default, sorted by popularity within
// each kind (stars for repos, intelligence index for LLMs). The faceted
// /api/search route still exists for power callers — this one is tuned for
// dropdown latency and renderable payload size.

import { NextRequest, NextResponse } from "next/server";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { getDerivedRepos } from "@/lib/derived-repos";
import { refreshTrendingFromStore } from "@/lib/trending";
import {
  getAaLlmsFile,
  refreshAaLlmsFromStore,
  type AaLlmsRow,
} from "@/lib/aa-llms";

export const runtime = "nodejs";

interface RepoHit {
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  stars: number;
  language: string | null;
  ownerAvatarUrl: string | null;
}

interface LlmHit {
  slug: string;
  name: string;
  creator: string;
  intelligenceIndex: number | null;
}

function clampLimit(raw: string | null, fallback: number, max: number): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function matchRepo(q: string, repo: { fullName: string; name?: string; description?: string | null; topics?: string[] | null }): boolean {
  if (repo.fullName.toLowerCase().includes(q)) return true;
  if (repo.name && repo.name.toLowerCase().includes(q)) return true;
  if (repo.description && repo.description.toLowerCase().includes(q)) return true;
  if (repo.topics && repo.topics.some((t) => t.toLowerCase().includes(q))) return true;
  return false;
}

function matchLlm(q: string, row: AaLlmsRow): boolean {
  if (row.name.toLowerCase().includes(q)) return true;
  if (row.creator.toLowerCase().includes(q)) return true;
  if (row.slug.toLowerCase().includes(q)) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const url = new URL(
    (request as NextRequest).nextUrl?.toString() ?? request.url,
  );
  const rawQ = (url.searchParams.get("q") ?? "").trim();
  const q = rawQ.toLowerCase();
  const repoLimit = clampLimit(url.searchParams.get("repoLimit"), 6, 20);
  const llmLimit = clampLimit(url.searchParams.get("llmLimit"), 4, 20);

  if (q.length < 1) {
    return NextResponse.json(
      { ok: true, query: rawQ, repos: [], llms: [] },
      { headers: READ_CACHE_HEADERS },
    );
  }

  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshAaLlmsFromStore().catch(() => undefined),
  ]);

  const repos: RepoHit[] = [];
  for (const repo of getDerivedRepos()) {
    if (!matchRepo(q, repo)) continue;
    repos.push({
      fullName: repo.fullName,
      name: repo.name,
      owner: repo.owner,
      description: repo.description ?? null,
      stars: repo.stars ?? 0,
      language: repo.language ?? null,
      ownerAvatarUrl: repo.ownerAvatarUrl ?? null,
    });
  }
  repos.sort((a, b) => b.stars - a.stars);

  const llms: LlmHit[] = [];
  for (const row of getAaLlmsFile().models) {
    if (!matchLlm(q, row)) continue;
    llms.push({
      slug: row.slug,
      name: row.name,
      creator: row.creator,
      intelligenceIndex: row.intelligenceIndex,
    });
  }
  llms.sort((a, b) => (b.intelligenceIndex ?? -1) - (a.intelligenceIndex ?? -1));

  return NextResponse.json(
    {
      ok: true,
      query: rawQ,
      repos: repos.slice(0, repoLimit),
      llms: llms.slice(0, llmLimit),
      totals: { repos: repos.length, llms: llms.length },
    },
    { headers: READ_CACHE_HEADERS },
  );
}
