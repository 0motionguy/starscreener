// POST /api/pipeline/cleanup
//
// Admin endpoint. Re-fetches a batch of repos from GitHub and marks records
// that are now archived, disabled, or 404'd. Does NOT physically delete rows
// (preserves historical snapshots for user-visible charts); instead flags the
// repo so downstream queries can filter.
//
// Auth: tri-state CRON_SECRET protection via the shared `verifyCronAuth`
// helper in src/lib/api/auth.ts — "ok" / "unauthorized" / "not_configured".
//
// Body (optional JSON):
//   {
//     mode?: "archived" | "deleted" | "all"  // default "all"
//     dryRun?: boolean                       // default false — preview changes only
//     max?: number                           // default 50 — rate-limit guard
//   }
//
// Response:
//   { ok: true, checked, wouldArchive, wouldDelete, updated, rateLimitRemaining }

import { NextRequest, NextResponse } from "next/server";
import { pipeline, repoStore } from "@/lib/pipeline/pipeline";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODES = new Set(["archived", "deleted", "all"]);

interface CleanupBody {
  mode?: "archived" | "deleted" | "all";
  dryRun?: boolean;
  max?: number;
}

async function handler(req: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(req));
  if (deny) return deny;

  let body: CleanupBody = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const parsed = (await req.json()) as unknown;
      if (parsed && typeof parsed === "object") body = parsed as CleanupBody;
    }
  } catch {
    // Empty body is fine — defaults apply.
  }

  const mode: CleanupBody["mode"] =
    body.mode && MODES.has(body.mode) ? body.mode : "all";
  const dryRun = body.dryRun === true;
  const max =
    typeof body.max === "number" && body.max > 0 && body.max <= 500
      ? Math.floor(body.max)
      : 50;

  await pipeline.ensureReady();

  let adapter: ReturnType<typeof createGitHubAdapter>;
  try {
    adapter = createGitHubAdapter({ useMock: false });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          err instanceof Error ? err.message : "failed to build github adapter",
      },
      { status: 500 },
    );
  }

  const repos = repoStore.getAll().slice(0, max);
  const changes: Array<{
    id: string;
    fullName: string;
    change: "archived" | "deleted" | "revived" | "none";
  }> = [];
  let wouldArchive = 0;
  let wouldDelete = 0;

  for (const repo of repos) {
    const raw = await adapter.fetchRepo(repo.fullName);
    if (raw === null) {
      // 404 — repo removed or now private.
      if (mode === "deleted" || mode === "all") {
        wouldDelete += 1;
        changes.push({
          id: repo.id,
          fullName: repo.fullName,
          change: "deleted",
        });
        if (!dryRun) {
          repoStore.upsert({ ...repo, deleted: true });
        }
      }
      continue;
    }
    const isArchived = raw.archived === true || raw.disabled === true;
    if (isArchived) {
      if (mode === "archived" || mode === "all") {
        wouldArchive += 1;
        changes.push({
          id: repo.id,
          fullName: repo.fullName,
          change: "archived",
        });
        if (!dryRun) {
          repoStore.upsert({ ...repo, archived: true, deleted: false });
        }
      }
      continue;
    }
    // Healthy repo: clear prior archived/deleted flags if set.
    if (repo.archived || repo.deleted) {
      changes.push({
        id: repo.id,
        fullName: repo.fullName,
        change: "revived",
      });
      if (!dryRun) {
        repoStore.upsert({ ...repo, archived: false, deleted: false });
      }
    }
  }

  let rateLimitRemaining: number | null = null;
  try {
    const rl = await adapter.getRateLimit();
    rateLimitRemaining = rl?.remaining ?? null;
  } catch {
    // Non-fatal — report null and continue.
  }

  return NextResponse.json({
    ok: true,
    mode,
    dryRun,
    checked: repos.length,
    wouldArchive,
    wouldDelete,
    updated: dryRun ? 0 : changes.filter((c) => c.change !== "none").length,
    rateLimitRemaining,
    changes,
  });
}

export async function POST(req: NextRequest) {
  return handler(req);
}

export async function GET(req: NextRequest) {
  return handler(req);
}
