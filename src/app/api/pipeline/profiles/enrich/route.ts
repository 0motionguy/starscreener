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
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import {
  getRepoProfilesGeneratedAt,
  readRepoProfilesFileSync,
  refreshRepoProfilesFromStore,
} from "@/lib/repo-profiles";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type EnrichMode = "top" | "catchup" | "incremental";

interface EnrichBody {
  mode?: EnrichMode;
  limit?: number;
  maxScans?: number;
  includeRepos?: string[];
  scanIdOverrides?: Record<string, string>;
  aisoBaseUrl?: string;
}

function normalizeMode(value: unknown): EnrichMode {
  const raw = String(value ?? "incremental").trim().toLowerCase();
  if (raw === "top" || raw === "catchup") return raw;
  return "incremental";
}

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

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
  }));
  return {
    generatedAt: getRepoProfilesGeneratedAt(),
    selection: file.selection,
    counts,
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

  let body: EnrichBody = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      const parsed = (await request.json()) as unknown;
      if (parsed && typeof parsed === "object") body = parsed as EnrichBody;
    }
  } catch {
    body = {};
  }

  const mode = normalizeMode(body.mode);
  const limit = clampInt(body.limit, mode === "catchup" ? 500 : 50, 1, 10_000);
  const maxScans = clampInt(body.maxScans, mode === "incremental" ? 10 : 25, 0, 10_000);
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
