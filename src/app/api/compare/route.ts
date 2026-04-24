// StarScreener — `/api/compare` route (canonical profiles).
//
// Returns a rich side-by-side bundle for up to 4 repos. Each row wraps one
// `CanonicalRepoProfile` (same shape `/api/repos/[owner]/[name]?v=2`
// produces). Individual profile failures are encoded per-row so one bad
// slug never collapses the batch.
//
// Query contract:
//   - `?repos=owner/name,owner/name,...` (primary)
//   - `?ids=owner--name,owner--name,...` (legacy compat; also accepted)
//
// Response shape:
//   { ok: true,
//     fetchedAt: ISO,
//     repos: [
//       { fullName, profile: CanonicalRepoProfile | null, error?: "not_found" | string }
//     ]
//   }
//
// Errors:
//   - 400 "missing_repos"    — no repos/ids provided
//   - 400 "too_many_repos"   — more than MAX_REPOS
//   - 400 "invalid_repo"     — bad slug shape
//   - 500 "internal_error"   — unexpected throw while assembling
//
// Cache: public, s-maxage=30, stale-while-revalidate=60.

import { NextRequest, NextResponse } from "next/server";
import { compareIdToFallbackFullName } from "@/lib/compare-selection";
import { getDerivedRepoById } from "@/lib/derived-repos";
import {
  buildCanonicalRepoProfile,
  type CanonicalRepoProfile,
} from "@/lib/api/repo-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const ID_RE = /^[A-Za-z0-9._-]+--[A-Za-z0-9._-]+$/;
const MAX_REPOS = 4;

interface CompareRepoRow {
  fullName: string;
  profile: CanonicalRepoProfile | null;
  error?: string;
}

interface CompareOkBody {
  ok: true;
  fetchedAt: string;
  repos: CompareRepoRow[];
}

interface CompareErrBody {
  ok: false;
  error: string;
  code: string;
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse<CompareErrBody> {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export async function GET(request: NextRequest) {
  // Use `new URL(request.url)` rather than `request.nextUrl` so the handler
  // stays testable with a plain `Request` (mirrors sibling route tests).
  const { searchParams } = new URL(request.url);
  const reposParam = searchParams.get("repos") ?? "";
  const idsParam = searchParams.get("ids") ?? "";

  const rawParam = reposParam || idsParam;
  const requested = rawParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return errorResponse(
      "missing_repos",
      "Missing required 'repos' parameter",
      400,
    );
  }

  if (requested.length > MAX_REPOS) {
    return errorResponse(
      "too_many_repos",
      `Maximum ${MAX_REPOS} repos per request`,
      400,
    );
  }

  // Resolve each requested token to a canonical owner/name. Primary path is
  // `repos=`; we keep `ids=` flowing so any old bookmark still works.
  let requestedNames: string[];
  if (!reposParam && idsParam) {
    const invalid = requested.filter((n) => !ID_RE.test(n));
    if (invalid.length > 0) {
      return errorResponse(
        "invalid_repo",
        `Invalid repo id(s): ${invalid.join(", ")} (expected 'owner--name')`,
        400,
      );
    }
    requestedNames = requested.map((id) => {
      const repo = getDerivedRepoById(id);
      return repo?.fullName ?? compareIdToFallbackFullName(id);
    });
  } else {
    const invalid = requested.filter((n) => !FULL_NAME_RE.test(n));
    if (invalid.length > 0) {
      return errorResponse(
        "invalid_repo",
        `Invalid repo name(s): ${invalid.join(", ")} (expected 'owner/name')`,
        400,
      );
    }
    requestedNames = requested;
  }

  // De-duplicate while preserving order. Comparing the same repo twice is
  // a UX smell but not an error; we collapse it and the client can echo.
  const seen = new Set<string>();
  const names: string[] = [];
  for (const n of requestedNames) {
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      names.push(n);
    }
  }

  let rows: CompareRepoRow[];
  try {
    const settled = await Promise.allSettled(
      names.map((fullName) => buildCanonicalRepoProfile(fullName)),
    );
    rows = settled.map((s, i) => {
      const fullName = names[i];
      if (s.status === "rejected") {
        console.error(
          `[api:compare] profile build failed for ${fullName}`,
          s.reason,
        );
        return { fullName, profile: null, error: "internal_error" };
      }
      if (s.value === null) {
        return { fullName, profile: null, error: "not_found" };
      }
      return { fullName, profile: s.value };
    });
  } catch (err) {
    console.error("[api:compare] unexpected failure", err);
    return errorResponse("internal_error", "Internal error", 500);
  }

  const body: CompareOkBody = {
    ok: true,
    fetchedAt: new Date().toISOString(),
    repos: rows,
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
