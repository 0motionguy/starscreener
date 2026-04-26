// GET /api/admin/overview
//
// Single-shot aggregator for the /admin dashboard. Bundles everything the
// admin page needs so the UI makes one authed call per refresh instead of
// stitching together six separate endpoints.
//
// Auth: ADMIN_TOKEN bearer or ss_admin cookie (verifyAdminAuth handles both).

import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { readQueue } from "@/lib/aiso-queue";
import { listIdeas, type IdeaRecord } from "@/lib/ideas";
import {
  listRepoSubmissions,
  summarizeRepoSubmissionQueue,
  type RepoSubmissionRecord,
} from "@/lib/repo-submissions";
import {
  getRepoMetadataFailures,
  getRepoMetadataCount,
  getRepoMetadataSourceCount,
} from "@/lib/repo-metadata";
import {
  getScannerSourceHealth,
  type ScannerSourceHealth,
} from "@/lib/source-health";
import { pipeline, repoStore, snapshotStore } from "@/lib/pipeline/pipeline";
import { lastFetchedAt, deltasComputedAt } from "@/lib/trending";

export const dynamic = "force-dynamic";

export interface AdminOverviewResponse {
  ok: true;
  generatedAt: string;
  sources: ScannerSourceHealth[];
  /**
   * "Drop repo" submissions from the public site. Backed by
   * .data/repo-submissions.jsonl. Submissions for already-tracked repos
   * bypass this queue entirely (intake short-circuits with "already_tracked"
   * and never writes a row).
   */
  repoQueue: {
    total: number;
    pending: number;
    listed: number;
    failed: number;
    latestSubmittedAt: string | null;
    preview: Array<{
      id: string;
      repoFullName: string;
      status: string;
      submittedAt: string;
      ageSeconds: number;
      lastScanError: string | null;
      repoPath: string | null;
    }>;
  };
  /**
   * AISO website-scan rescan queue. Populated by /api/repos/[owner]/[name]/aiso
   * and drained by cron. Shown separately because it's a different operation
   * than "drop a repo" — it re-runs the website scanner for an already-tracked
   * repo.
   */
  aisoRescanQueue: {
    total: number;
  };
  ideasQueue: {
    pending: number;
    published: number;
    rejected: number;
    preview: Array<{
      id: string;
      title: string;
      authorHandle: string;
      createdAt: string;
    }>;
  };
  issues: Array<{
    kind: "source-stale" | "source-degraded" | "metadata-failure" | "queue-stuck";
    label: string;
    detail: string;
  }>;
  stats: {
    repoCount: number;
    snapshotCount: number;
    lastFetchedAt: string | null;
    deltasComputedAt: string | null;
    repoMetadataCount: number;
    repoMetadataSourceCount: number;
  };
}

interface ErrorResponse {
  ok: false;
  error: string;
}

const QUEUE_PREVIEW_LIMIT = 20;
const IDEAS_PREVIEW_LIMIT = 5;
const QUEUE_STUCK_THRESHOLD_MS = 6 * 60 * 60 * 1000;

function ageSecondsFrom(iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AdminOverviewResponse | ErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<ErrorResponse>;

  try {
    await pipeline.ensureReady();

    const sources = getScannerSourceHealth();

    const submissions = await listRepoSubmissions();
    const summary = summarizeRepoSubmissionQueue(submissions);
    const repoQueue = {
      total: submissions.length,
      pending: summary.pending,
      listed: summary.listed,
      failed: summary.failed,
      latestSubmittedAt: summary.latestSubmittedAt,
      preview: submissions.slice(0, QUEUE_PREVIEW_LIMIT).map(
        (row: RepoSubmissionRecord) => ({
          id: row.id,
          repoFullName: row.fullName,
          status: row.status,
          submittedAt: row.submittedAt,
          ageSeconds: ageSecondsFrom(row.submittedAt),
          lastScanError: row.lastScanError ?? null,
          repoPath: row.repoPath ?? null,
        }),
      ),
    };

    const aisoRows = await readQueue();
    const aisoRescanQueue = { total: aisoRows.length };

    let ideas: IdeaRecord[] = [];
    try {
      ideas = await listIdeas();
    } catch (err) {
      console.warn("[admin:overview] listIdeas failed", err);
    }
    const pending = ideas.filter((i) => i.status === "pending_moderation");
    const published = ideas.filter(
      (i) => i.status === "published" || i.status === "shipped",
    ).length;
    const rejected = ideas.filter((i) => i.status === "rejected").length;

    const issues: AdminOverviewResponse["issues"] = [];
    for (const src of sources) {
      if (src.status === "stale") {
        issues.push({
          kind: "source-stale",
          label: `${src.label} stale`,
          detail: `Last fetch ${src.fetchedAt ?? "never"} (age ${src.ageSeconds ?? "?"}s, threshold ${src.staleAfterSeconds}s).`,
        });
      } else if (src.status === "degraded") {
        issues.push({
          kind: "source-degraded",
          label: `${src.label} degraded`,
          detail: src.notes.join(" • ") || `Fresh but flagged (age ${src.ageSeconds ?? "?"}s).`,
        });
      }
    }
    const metaFailures = getRepoMetadataFailures();
    if (metaFailures.length > 0) {
      issues.push({
        kind: "metadata-failure",
        label: `${metaFailures.length} repo metadata failures`,
        detail: metaFailures.slice(0, 5).map((f) => f.fullName ?? "?").join(", "),
      });
    }
    const stuckSubmissions = submissions.filter(
      (row) =>
        (row.status === "pending" ||
          row.status === "queued" ||
          row.status === "scanning") &&
        ageSecondsFrom(row.submittedAt) * 1000 > QUEUE_STUCK_THRESHOLD_MS,
    );
    if (stuckSubmissions.length > 0) {
      issues.push({
        kind: "queue-stuck",
        label: `${stuckSubmissions.length} drop-repo submissions stuck >6h`,
        detail: stuckSubmissions.slice(0, 5).map((r) => r.fullName).join(", "),
      });
    }
    const stuckAiso = aisoRows.filter(
      (row) => ageSecondsFrom(row.queuedAt) * 1000 > QUEUE_STUCK_THRESHOLD_MS,
    );
    if (stuckAiso.length > 0) {
      issues.push({
        kind: "queue-stuck",
        label: `${stuckAiso.length} AISO rescan rows stuck >6h`,
        detail: stuckAiso.slice(0, 5).map((r) => r.repoFullName).join(", "),
      });
    }

    const body: AdminOverviewResponse = {
      ok: true,
      generatedAt: new Date().toISOString(),
      sources,
      repoQueue,
      aisoRescanQueue,
      ideasQueue: {
        pending: pending.length,
        published,
        rejected,
        preview: pending.slice(0, IDEAS_PREVIEW_LIMIT).map((i) => ({
          id: i.id,
          title: i.title,
          authorHandle: i.authorHandle,
          createdAt: i.createdAt,
        })),
      },
      issues,
      stats: {
        repoCount: repoStore.getAll().length,
        snapshotCount: snapshotStore.totalCount(),
        lastFetchedAt: lastFetchedAt ?? null,
        deltasComputedAt: deltasComputedAt ?? null,
        repoMetadataCount: getRepoMetadataCount(),
        repoMetadataSourceCount: getRepoMetadataSourceCount(),
      },
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api:admin:overview] failed", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
