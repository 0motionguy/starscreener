import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pipeline, repoStore } from "@/lib/pipeline/pipeline";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { redactSensitiveText } from "@/lib/log-redaction";
import { decideCleanupChange } from "@/lib/pipeline/repo-deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CleanupBodySchema = z.object({
  mode: z.enum(["archived", "deleted", "all"]).optional(),
  dryRun: z.boolean().optional(),
  max: z.number().int().positive().max(500).optional(),
});

async function handler(req: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(req));
  if (deny) return deny;

  const parsed = await parseBody(req, CleanupBodySchema, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const mode = body.mode ?? "all";
  const dryRun = body.dryRun === true;
  const max = body.max ?? 50;

  await pipeline.ensureReady();

  let adapter: ReturnType<typeof createGitHubAdapter>;
  try {
    adapter = createGitHubAdapter({ useMock: false });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "failed to build github adapter";
    const message = redactSensitiveText(rawMessage);
    console.error("[pipeline:cleanup] failed to build github adapter", { message });
    return NextResponse.json(
      {
        ok: false,
        reason: "failed to build github adapter",
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
    const outcome = await adapter.fetchRepoOutcome(repo.fullName);
    const decision = decideCleanupChange(repo, outcome, mode);
    if (decision.change === "none") continue;
    if (decision.change === "deleted") wouldDelete += 1;
    if (decision.change === "archived") wouldArchive += 1;
    changes.push({ id: repo.id, fullName: repo.fullName, change: decision.change });
    if (!dryRun && decision.nextRepo) repoStore.upsert(decision.nextRepo);
  }

  let rateLimitRemaining: number | null = null;
  try {
    const rl = await adapter.getRateLimit();
    rateLimitRemaining = rl?.remaining ?? null;
  } catch {}

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
