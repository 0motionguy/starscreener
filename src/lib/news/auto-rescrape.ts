// Server-side auto-rescrape trigger. The news pages call
// `triggerScanIfStale` during render so a stale source quietly fans out a
// detached collector run while the user keeps reading whatever data is
// already on disk. The user never sees a "stale" empty state because the
// page renders normally with an "updated Xm ago" pill and the next reload
// has fresh data.
//
// Design rules:
//   1. Throttle per-source to ONE spawn per 15 minutes. The map lives on
//      `globalThis` so multiple route imports inside the same Node
//      runtime share state. Serverless cold starts wipe it, which is
//      fine — the cold start itself was already stale-relief.
//   2. Spawn pattern is copied verbatim from
//      `src/app/api/admin/scan/route.ts` (detached + unref + log fd
//      hand-off). That route is the canonical implementation.
//   3. NEVER throw. The page render must keep working even when the
//      spawn fails (missing script, fs error, OOM). Anything that goes
//      wrong is console.warned and the function returns a structured
//      `{ triggered: false, reason: "error: ..." }` envelope.
//   4. The function is `async` to match the external contract, but it
//      does NOT await the child process — fire-and-forget is the whole
//      point.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { classifyFreshness, type NewsSource } from "@/lib/news/freshness";

// Mirror of `SCRIPTS` from src/app/api/admin/scan/route.ts. Kept in sync
// by hand: any new collector added there should land here too. Sources
// not present in this map will return reason "no-script".
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

const THROTTLE_MS = 900_000; // 15 minutes

// Per-source last-trigger timestamps. Persisted on globalThis so HMR /
// multiple route imports share state in a single Node runtime.
const THROTTLE_KEY = Symbol.for("trendingrepo.news.auto-rescrape.throttle");

interface ThrottleBag {
  map: Map<string, number>;
}

function getThrottleMap(): Map<string, number> {
  const slot = (globalThis as unknown as Record<symbol, ThrottleBag | undefined>)[
    THROTTLE_KEY
  ];
  if (slot) return slot.map;
  const fresh: ThrottleBag = { map: new Map() };
  (globalThis as unknown as Record<symbol, ThrottleBag>)[THROTTLE_KEY] = fresh;
  return fresh.map;
}

export async function triggerScanIfStale(
  source: NewsSource,
  fetchedAt: string | null | undefined,
): Promise<{ triggered: boolean; reason: string }> {
  try {
    const verdict = classifyFreshness(source, fetchedAt);
    if (verdict.status === "live") {
      return { triggered: false, reason: "live" };
    }

    const throttle = getThrottleMap();
    const last = throttle.get(source) ?? 0;
    const now = Date.now();
    if (now - last < THROTTLE_MS) {
      return { triggered: false, reason: "throttled" };
    }

    const scriptRel = SCRIPTS[source];
    if (!scriptRel) {
      return { triggered: false, reason: "no-script" };
    }

    const scriptAbs = path.join(process.cwd(), scriptRel);
    try {
      await fs.access(scriptAbs);
    } catch {
      return {
        triggered: false,
        reason: `error: script missing on disk: ${scriptRel}`,
      };
    }

    await fs.mkdir(LOG_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logPath = path.join(LOG_DIR, `${source}-auto-${stamp}.log`);
    const logFd = await fs.open(logPath, "a");

    try {
      const child = spawn(process.execPath, [scriptAbs], {
        cwd: process.cwd(),
        env: process.env,
        detached: true,
        stdio: ["ignore", logFd.fd, logFd.fd],
      });
      child.unref();
      // Mark throttle BEFORE close so a second concurrent call within
      // the same tick still sees the lock.
      throttle.set(source, now);
      await logFd.close();
      return { triggered: true, reason: "spawned" };
    } catch (err) {
      await logFd.close().catch(() => void 0);
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[news:auto-rescrape] spawn failed for ${source}:`,
        message,
      );
      return { triggered: false, reason: `error: ${message}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[news:auto-rescrape] unexpected failure for ${source}:`,
      message,
    );
    return { triggered: false, reason: `error: ${message}` };
  }
}
