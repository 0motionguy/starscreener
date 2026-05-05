// GET/POST /api/pipeline/profiles/enrich
//
// Repo-profile enrichment controller.
//
// GET:
//   Returns the current persisted repo-profile summary and recent rows.
//
// POST:
//   Runs scripts/enrich-repo-profiles.mjs with authenticated operator control.
//   This is the "catch up now" / "incremental cron" path for website scans and
//   other repo-surface enrichment.

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import {
  getRepoProfilesGeneratedAt,
  readRepoProfilesFileSync,
  refreshRepoProfilesFromStore,
} from "@/lib/repo-profiles";
import {
  buildRepoEnrichmentChecklist,
  summarizeRepoEnrichmentChecklists,
} from "@/lib/repo-enrichment-checklist";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type EnrichMode = "top" | "catchup" | "incremental";

const EnrichBodySchema = z.object({
  mode: z.enum(["top", "catchup", "incremental"]).optional(),
  limit: z.number().int().min(1).max(10_000).optional(),
  maxScans: z.number().int().min(0).max(10_000).optional(),
  includeRepos: z.array(z.string()).optional(),
  scanIdOverrides: z.record(z.string(), z.string()).optional(),
  aisoBaseUrl: z.string().optional(),
});

function stringifyList(values: unknown): string | null {
  if (!Array.isArray(values)) return null;
  const repos = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.includes("/"));
  return repos.length > 0 ? repos.join(",") : null;
}

function stringifyScanOverrides(values: unknown): string | null {
  if (!values || typeof values !== "object") return null;
  const pairs = Object.entries(values as Record<string, unknown>)
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" &&
        entry[0].includes("/") &&
        typeof entry[1] === "string" &&
        entry[1].trim().length > 0,
    )
    .map(([fullName, scanId]) => `${fullName.trim()}=${scanId.trim()}`);
  return pairs.length > 0 ? pairs.join(",") : null;
}

function summarizeProfiles() {
  const file = readRepoProfilesFileSync();
  const checklists = file.profiles.map(buildRepoEnrichmentChecklist);
  const counts = {
    total: file.profiles.length,
    scanned: file.profiles.filter((profile) => profile.status === "scanned").length,
    queued: file.profiles.filter(
      (profile) =>
        profile.status === "scan_pending" || profile.status === "scan_running",
    ).length,
    noWebsite: file.profiles.filter((profile) => profile.status === "no_website")
      .length,
    failed: file.profiles.filter(
      (profile) =>
        profile.status === "scan_failed" || profile.status === "rate_limited",
    ).length,
  };
  const recent = file.profiles.slice(0, 12).map((profile) => ({
    fullName: profile.fullName,
    rank: profile.rank,
    status: profile.status,
    websiteUrl: profile.websiteUrl,
    lastProfiledAt: profile.lastProfiledAt,
    enrichmentChecklist: buildRepoEnrichmentChecklist(profile),
  }));
  return {
    generatedAt: getRepoProfilesGeneratedAt(),
    selection: file.selection,
    counts,
    enrichmentChecklistSummary: summarizeRepoEnrichmentChecklists(checklists),
    recent,
  };
}

function runEnricher(args: string[]): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr });
    });
    child.on("error", (error) => {
      resolvePromise({
        code: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;
  await refreshRepoProfilesFromStore();
  return NextResponse.json({
    ok: true,
    mode: "status",
    ...summarizeProfiles(),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  const parsed = await parseBody(request, EnrichBodySchema, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const mode: EnrichMode = body.mode ?? "incremental";
  const limit = body.limit ?? (mode === "catchup" ? 500 : 50);
  const maxScans = body.maxScans ?? (mode === "incremental" ? 10 : 25);
  const include = stringifyList(body.includeRepos);
  const scanOverrides = stringifyScanOverrides(body.scanIdOverrides);
  const aisoBaseUrl =
    typeof body.aisoBaseUrl === "string" && body.aisoBaseUrl.trim()
      ? body.aisoBaseUrl.trim()
      : null;

  const scriptPath = resolve(process.cwd(), "scripts", "enrich-repo-profiles.mjs");
  const args = [
    scriptPath,
    "--mode",
    mode,
    "--limit",
    String(limit),
    "--max-scans",
    String(maxScans),
  ];
  if (include) args.push("--include", include);
  if (scanOverrides) args.push("--scan-overrides", scanOverrides);
  if (aisoBaseUrl) args.push("--aiso-base-url", aisoBaseUrl);

  const startedAt = Date.now();
  const result = await runEnricher(args);
  const summary = summarizeProfiles();
  const stdoutLines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-20);
  const stderrLines = result.stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-20);

  return NextResponse.json(
    {
      ok: result.code === 0,
      mode,
      durationMs: Date.now() - startedAt,
      exitCode: result.code,
      stdout: stdoutLines,
      stderr: stderrLines,
      ...summary,
    },
    { status: result.code === 0 ? 200 : 500 },
  );
}
