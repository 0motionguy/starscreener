import { NextRequest, NextResponse } from "next/server";

import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { jsonWithEtag } from "@/lib/api/etag";
import { errorEnvelope, serverError } from "@/lib/api/error-response";
import { getCanonicalRepoProfileCached } from "@/lib/api/repo-profile-cache";
import { compareIdToFallbackFullName } from "@/lib/compare-selection";
import { getDerivedRepoById } from "@/lib/derived-repos";
import { refreshNpmFromStore } from "@/lib/npm";
import { refreshRecentReposFromStore } from "@/lib/recent-repos";
import { refreshRepoMetadataFromStore } from "@/lib/repo-metadata";
import { refreshTrendingFromStore } from "@/lib/trending";
import { slugToId } from "@/lib/utils";

export const runtime = "nodejs";

const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const SLUG_ID_RE = /^[A-Za-z0-9._-]+--[A-Za-z0-9._-]+$/;
const MAX_SLUGS = 25;

interface BatchRepoRow {
  slug: string;
  fullName: string;
  profile: Awaited<ReturnType<typeof getCanonicalRepoProfileCached>> | null;
  error?: "not_found" | "invalid_slug" | "internal_error";
}

function parseRequestedSlugs(searchParams: URLSearchParams): string[] {
  return (searchParams.get("slugs") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeSlugToFullName(raw: string): { fullName: string | null; error?: "invalid_slug" } {
  if (FULL_NAME_RE.test(raw)) {
    return { fullName: raw };
  }
  if (SLUG_ID_RE.test(raw)) {
    const repo = getDerivedRepoById(raw);
    return { fullName: repo?.fullName ?? compareIdToFallbackFullName(raw) };
  }

  const maybeId = slugToId(raw);
  if (SLUG_ID_RE.test(maybeId)) {
    const repo = getDerivedRepoById(maybeId);
    return { fullName: repo?.fullName ?? compareIdToFallbackFullName(maybeId) };
  }

  return { fullName: null, error: "invalid_slug" };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const slugs = parseRequestedSlugs(searchParams);

  if (slugs.length === 0) {
    return NextResponse.json(
      errorEnvelope("Missing required 'slugs' parameter", "missing_slugs"),
      { status: 400 },
    );
  }
  if (slugs.length > MAX_SLUGS) {
    return NextResponse.json(
      errorEnvelope(`Maximum ${MAX_SLUGS} slugs per request`, "too_many_slugs"),
      { status: 400 },
    );
  }

  try {
    await Promise.all([
      refreshTrendingFromStore(),
      refreshRecentReposFromStore(),
      refreshRepoMetadataFromStore(),
      refreshNpmFromStore(),
    ]);

    const rows = await Promise.all(
      slugs.map(async (slug): Promise<BatchRepoRow> => {
        const normalized = normalizeSlugToFullName(slug);
        if (!normalized.fullName) {
          return {
            slug,
            fullName: "",
            profile: null,
            error: normalized.error ?? "invalid_slug",
          };
        }

        try {
          const profile = await getCanonicalRepoProfileCached(
            normalized.fullName,
          );
          if (!profile) {
            return {
              slug,
              fullName: normalized.fullName,
              profile: null,
              error: "not_found",
            };
          }
          return {
            slug,
            fullName: normalized.fullName,
            profile,
          };
        } catch (err) {
          console.error("[api:repos/batch] profile build failed", {
            slug,
            fullName: normalized.fullName,
            err,
          });
          return {
            slug,
            fullName: normalized.fullName,
            profile: null,
            error: "internal_error",
          };
        }
      }),
    );

    return jsonWithEtag(
      request,
      {
        ok: true,
        fetchedAt: new Date().toISOString(),
        repos: rows,
      },
      { headers: READ_CACHE_HEADERS },
    );
  } catch (err) {
    return serverError(err, {
      scope: "[api:repos/batch]",
      code: "internal_error",
      publicMessage: "Internal error",
      status: 500,
    });
  }
}
