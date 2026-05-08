// POST /api/admin/scrape/run  { source: "all" | <CollectorName> }
//
// Operator-triggered scrape kick-off for the /admin/scrapes panel. Sister
// endpoint to /api/admin/scan, but this one is keyed on the canonical
// collector name list shared with the admin pages (see
// src/lib/admin/scrape-status.ts) and supports a "run all" fan-out.
//
// Auth: gated by middleware.ts (matches /api/admin/* and the global
// admin-cookie middleware before reaching this handler). We re-verify
// here as defence-in-depth using the same helper used by /api/admin/scan
// so the surface stays consistent with the existing scan endpoint and
// returns 503 cleanly when ADMIN_TOKEN/SESSION_SECRET are unset.
//
// We spawn detached children and return immediately — operators see
// progress through the next /admin/scrapes refresh, which re-reads the
// log directory and the meta sidecars. No streaming, no polling here.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mirrors the COLLECTORS list in src/lib/admin/scrape-status.ts. We
// duplicate the literal here (instead of importing) because route.ts in
// Next 15 can only export the allow-listed handlers + specials —
// re-exporting a `CollectorName` type would compile but pulling the
// runtime tuple still works fine. Keeping the literal in this file makes
// the SCRIPTS map below self-contained.
const COLLECTORS = [
  "reddit",
  "hackernews",
  "bluesky",
  "devto",
  "lobsters",
  "producthunt",
  "twitter",
  "arxiv",
  "huggingface",
  "npm",
] as const;

type CollectorName = (typeof COLLECTORS)[number];

// Maps every collector to its on-disk script. `runner` chooses the
// interpreter — twitter is a TS file routed through tsx; everything
// else is a plain .mjs Node script. New collectors must add their entry
// here AND in src/lib/admin/scrape-status.ts.
type ScriptSpec = {
  rel: string;
  runner: "node" | "tsx";
};

const SCRIPTS: Record<CollectorName, ScriptSpec> = {
  reddit: { rel: "scripts/scrape-reddit.mjs", runner: "node" },
  hackernews: { rel: "scripts/scrape-hackernews.mjs", runner: "node" },
  bluesky: { rel: "scripts/scrape-bluesky.mjs", runner: "node" },
  devto: { rel: "scripts/scrape-devto.mjs", runner: "node" },
  lobsters: { rel: "scripts/scrape-lobsters.mjs", runner: "node" },
  producthunt: { rel: "scripts/scrape-producthunt.mjs", runner: "node" },
  twitter: { rel: "scripts/collect-twitter-signals.ts", runner: "tsx" },
  arxiv: { rel: "scripts/scrape-arxiv.mjs", runner: "node" },
  huggingface: { rel: "scripts/scrape-huggingface.mjs", runner: "node" },
  npm: { rel: "scripts/scrape-npm.mjs", runner: "node" },
};

const LOG_DIR = path.join(process.cwd(), ".data", "admin-scan-runs");

// Same env allow-list pattern as /api/admin/scan — explicit keys only,
// no `process.env` blanket pass-through (P0 fix from APP-01). When a
// new collector needs a credential, add it here and document why.
const CHILD_ENV_ALLOW = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "NODE_ENV",
  "NODE_OPTIONS",
  "REDIS_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "DATA_STORE_DISABLE",
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "REDDIT_USER_AGENT",
  "REDDIT_USER_AGENTS",
  "BLUESKY_HANDLE",
  "BLUESKY_APP_PASSWORD",
  "GITHUB_TOKEN",
  "APIFY_API_TOKEN",
  "APIFY_TWITTER_ACTOR",
  "APIFY_TWITTER_ACTOR_COST_USD",
  "PRODUCTHUNT_API_TOKEN",
  "DEVTO_API_KEY",
  "STARSCREENER_USER_AGENT",
  "TRENDINGREPO_USER_AGENT",
  "STARSCREENER_DATA_DIR",
  "TRENDINGREPO_DATA_DIR",
] as const;

function buildChildEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const key of CHILD_ENV_ALLOW) {
    const value = parent[key];
    if (value !== undefined) env[key] = value;
  }
  return env as NodeJS.ProcessEnv;
}

const Body = z.object({
  source: z.union([
    z.literal("all"),
    z.enum(COLLECTORS),
  ]),
});

interface SpawnResult {
  source: CollectorName;
  script: string;
  pid: number | null;
  logFile: string;
  spawnError?: string;
}

async function spawnCollector(source: CollectorName): Promise<SpawnResult> {
  const spec = SCRIPTS[source];
  const scriptAbs = path.join(process.cwd(), spec.rel);

  // If the on-disk script is missing we still return a row so the UI
  // can show "missing" for this source rather than fail the whole batch.
  try {
    await fs.access(scriptAbs);
  } catch {
    return {
      source,
      script: spec.rel,
      pid: null,
      logFile: "",
      spawnError: `script missing on disk: ${spec.rel}`,
    };
  }

  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(
    LOG_DIR,
    `admin-trigger-${source}-${stamp}.log`,
  );
  const logFd = await fs.open(logFile, "a");

  try {
    const childEnv = buildChildEnv(process.env);
    // tsx is invoked through Node's --import flag instead of as a binary
    // so we don't depend on `tsx` being on PATH at the right resolution.
    // Falls back to the standard `npx tsx` semantics by way of the
    // package's local `node_modules/.bin/tsx` if available.
    const args =
      spec.runner === "tsx"
        ? [
            "--import",
            // tsx ships an ESM loader hook; --import keeps Node's loader
            // chain happy on Node 22 without --loader deprecation noise.
            "tsx",
            scriptAbs,
          ]
        : [scriptAbs];
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: childEnv,
      detached: true,
      stdio: ["ignore", logFd.fd, logFd.fd],
    });
    child.unref();
    await logFd.close();
    return {
      source,
      script: spec.rel,
      pid: child.pid ?? null,
      logFile: path.relative(process.cwd(), logFile).replaceAll("\\", "/"),
    };
  } catch (err) {
    await logFd.close().catch(() => undefined);
    return {
      source,
      script: spec.rel,
      pid: null,
      logFile: path.relative(process.cwd(), logFile).replaceAll("\\", "/"),
      spawnError: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Belt-and-braces: middleware should already have redirected
  // unauthenticated browsers, but this endpoint also runs collectors
  // server-side — defence-in-depth against any future middleware
  // matcher regression.
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "body must be valid JSON" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid body",
        details: parsed.error.flatten(),
        allowed: ["all", ...COLLECTORS],
      },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  await fs.mkdir(LOG_DIR, { recursive: true });

  const targets: CollectorName[] =
    parsed.data.source === "all"
      ? [...COLLECTORS]
      : [parsed.data.source];

  // Spawn in parallel — each child is detached + unrefed, so the API
  // response returns as soon as the spawn calls resolve. Operators
  // observe progress via the next /admin/scrapes refresh.
  const results = await Promise.all(targets.map(spawnCollector));

  return NextResponse.json(
    {
      ok: true,
      source: parsed.data.source,
      startedAt: new Date().toISOString(),
      results,
    },
    {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
