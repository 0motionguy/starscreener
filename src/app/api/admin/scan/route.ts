// POST /api/admin/scan  { source: "reddit" | "bluesky" | ... }
//
// Operator escape hatch for the scrape pipeline: when a scheduled scan
// silently drops a source (Reddit anti-bot, Bluesky auth lapse, etc), the
// admin dashboard needs a "scan now" button that kicks off the actual
// script without waiting for the next cron tick.
//
// Each supported source maps to exactly one .mjs script under ./scripts/.
// We spawn the script as a detached child process, return immediately so
// the UI doesn't hang on a 30-60s scrape, and write stdout/stderr into
// .data/admin-scan-runs/<source>-<ts>.log so the dashboard can link to the
// tail on the next overview refresh.
//
// Auth: ADMIN_TOKEN bearer or ss_admin cookie. Executes server-side scripts
// — must NEVER fall back to an unauth path.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

const SCRIPTS: Record<string, string> = {
  reddit: "scripts/scrape-reddit.mjs",
  bluesky: "scripts/scrape-bluesky.mjs",
  devto: "scripts/scrape-devto.mjs",
  hackernews: "scripts/scrape-hackernews.mjs",
  lobsters: "scripts/scrape-lobsters.mjs",
  producthunt: "scripts/scrape-producthunt.mjs",
  npm: "scripts/scrape-npm.mjs",
  "npm-daily": "scripts/scrape-npm-daily.mjs",
  trending: "scripts/scrape-trending.mjs",
  "funding-news": "scripts/scrape-funding-news.mjs",
};

const LOG_DIR = path.join(process.cwd(), ".data", "admin-scan-runs");

/**
 * Allow-list of env vars the spawned scrape script needs. Curated to
 * deny secrets that don't belong in scrapers (Stripe, session, admin,
 * email delivery). New collectors should add their var name here, not
 * fall back to process.env wholesale.
 */
const CHILD_ENV_ALLOW = [
  // System — needed by every Node child (PATH for npm subbins, HOME for
  // ssh/git plumbing, locale for date parsing, TMP for fs.mkdtemp).
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
  // Data-store dual-write — every collector imports _data-store-write.mjs
  // and reads these to land its payload in Redis alongside the file.
  "REDIS_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "DATA_STORE_DISABLE",
  // Per-source scraper credentials. Add when a new scrape:* script needs
  // a non-public token.
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "REDDIT_USER_AGENT",
  "REDDIT_USER_AGENTS",
  "BLUESKY_HANDLE",
  "BLUESKY_APP_PASSWORD",
  "GITHUB_TOKEN",
  "APIFY_API_TOKEN",
  "PRODUCTHUNT_API_TOKEN",
  "DEVTO_API_KEY",
  "STARSCREENER_USER_AGENT",
  "TRENDINGREPO_USER_AGENT",
  // Project-local discovery (used by repo-metadata + scoring).
  "STARSCREENER_DATA_DIR",
  "TRENDINGREPO_DATA_DIR",
];

function buildChildEnv(
  parent: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const key of CHILD_ENV_ALLOW) {
    const value = parent[key];
    if (value !== undefined) env[key] = value;
  }
  return env as NodeJS.ProcessEnv;
}

/**
 * Keep at most N newest logs per source (APP-13). Without this the scan-run
 * directory grew unbounded — every operator click left another file in
 * place forever, and the dashboard tail-link logic eventually slowed to a
 * crawl scanning thousands of historical files. Fire-and-forget after the
 * spawn so log rotation never blocks the API response.
 */
const KEEP_LOGS_PER_SOURCE = 20;

async function pruneScanRunLogs(
  logDir: string,
  source: string,
  keep: number,
): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(logDir);
  } catch {
    return; // dir missing — nothing to prune
  }
  const prefix = `${source}-`;
  const matching = entries.filter(
    (name) => name.startsWith(prefix) && name.endsWith(".log"),
  );
  if (matching.length <= keep) return;

  const stats = await Promise.all(
    matching.map(async (name) => {
      try {
        const full = path.join(logDir, name);
        const stat = await fs.stat(full);
        return { name, full, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  const valid = stats.filter(
    (s): s is { name: string; full: string; mtime: number } => s !== null,
  );
  valid.sort((a, b) => b.mtime - a.mtime);

  const toDelete = valid.slice(keep);
  await Promise.all(
    toDelete.map((entry) =>
      fs.unlink(entry.full).catch(() => void 0),
    ),
  );
}

interface Ok {
  ok: true;
  source: string;
  script: string;
  pid: number | null;
  logPath: string;
  startedAt: string;
}

interface Err {
  ok: false;
  error: string;
  allowed?: string[];
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<Ok | Err>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<Err>;

  let body: { source?: unknown } = {};
  try {
    body = (await request.json()) as { source?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "body must be valid JSON" },
      { status: 400 },
    );
  }

  const source = typeof body.source === "string" ? body.source.trim() : "";
  if (!source) {
    return NextResponse.json(
      { ok: false, error: "source is required", allowed: Object.keys(SCRIPTS) },
      { status: 400 },
    );
  }

  const scriptRel = SCRIPTS[source];
  if (!scriptRel) {
    return NextResponse.json(
      {
        ok: false,
        error: `unknown source "${source}"`,
        allowed: Object.keys(SCRIPTS),
      },
      { status: 400 },
    );
  }

  const scriptAbs = path.join(process.cwd(), scriptRel);
  try {
    await fs.access(scriptAbs);
  } catch {
    return NextResponse.json(
      { ok: false, error: `script missing on disk: ${scriptRel}` },
      { status: 500 },
    );
  }

  await fs.mkdir(LOG_DIR, { recursive: true });
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(LOG_DIR, `${source}-${stamp}.log`);
  const logFd = await fs.open(logPath, "a");

  try {
    // APP-01: curate the env passed to the child. Previously
    // `env: process.env` handed every secret on the box (STRIPE_SECRET_KEY,
    // SESSION_SECRET, ADMIN_PASSWORD, RESEND_API_KEY, ...) to whatever
    // script the operator picked from SCRIPTS. The whitelist + path
    // sanity check is the only barrier between an admin compromise and
    // full secret exfil. Defense-in-depth: explicitly opt secrets in.
    const childEnv = buildChildEnv(process.env);
    const child = spawn(process.execPath, [scriptAbs], {
      cwd: process.cwd(),
      env: childEnv,
      detached: true,
      stdio: ["ignore", logFd.fd, logFd.fd],
    });
    child.unref();

    await logFd.close();

    // Fire-and-forget rotation — keep only the newest N logs per source.
    // Errors don't propagate; pruning failures must never block scans.
    void pruneScanRunLogs(LOG_DIR, source, KEEP_LOGS_PER_SOURCE).catch(
      (err) => {
        console.warn(
          `[api:admin:scan] log rotation failed for ${source}`,
          err,
        );
      },
    );

    return NextResponse.json({
      ok: true,
      source,
      script: scriptRel,
      pid: child.pid ?? null,
      logPath: path.relative(process.cwd(), logPath).replaceAll("\\", "/"),
      startedAt: startedAt.toISOString(),
    });
  } catch (err) {
    await logFd.close().catch(() => void 0);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api:admin:scan] spawn failed", err);
    return NextResponse.json(
      { ok: false, error: `spawn failed: ${message}` },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse<{ ok: true; sources: string[] }>> {
  return NextResponse.json({ ok: true, sources: Object.keys(SCRIPTS) });
}
