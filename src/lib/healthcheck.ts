import "server-only";

/**
 * Healthchecks.io cron wrapper for trendingrepo Vercel routes.
 * Mirrors AISO `lib/healthcheck.ts`. See that file for full doc.
 *
 * Env: HEALTHCHECK_<UPPER_SNAKE_ROUTE_NAME>=https://hc-ping.com/<uuid>
 *
 * Usage:
 *   import { withHealthcheck } from "@/lib/healthcheck";
 *
 *   export const GET = withHealthcheck("aiso-drain", async (req) => {
 *     ...
 *     return Response.json({ ok: true });
 *   });
 *
 * Defense-in-depth: skips Healthchecks pings when the request fails cron
 * auth (CRON_SECRET bearer header). This way bots probing the cron URLs
 * can't burn Healthchecks "down" alerts by hitting /start without ever
 * succeeding — only authorized cron runs count.
 */

const PING_TIMEOUT_MS = 2_000;

function envKey(routeName: string): string {
  return "HEALTHCHECK_" + routeName.toUpperCase().replace(/[-/]/g, "_");
}

function isUnauthorizedCronProbe(req: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  return req.headers.get("authorization") !== `Bearer ${expected}`;
}

async function ping(url: string, suffix: "" | "/start" | "/fail", body?: string): Promise<void> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), PING_TIMEOUT_MS);
  try {
    await fetch(`${url.replace(/\/$/, "")}${suffix}`, {
      method: body ? "POST" : "GET",
      body,
      signal: ctl.signal,
    });
  } catch {
    // Ping failures must never break the cron handler.
  } finally {
    clearTimeout(t);
  }
}

export function withHealthcheck<Req extends Request, R extends Response>(
  routeName: string,
  handler: (request: Req) => R | Promise<R>,
): (request: Req) => Promise<R> {
  return async (request: Req): Promise<R> => {
    const url = process.env[envKey(routeName)]?.trim();
    const skipPing = isUnauthorizedCronProbe(request);
    if (url && !skipPing) {
      await ping(url, "/start");
    }
    try {
      const res = await handler(request);
      if (url && !skipPing) {
        if (res.ok) {
          await ping(url, "", `Route ${routeName} returned ${res.status}`);
        } else {
          await ping(url, "/fail", `Route ${routeName} returned ${res.status}`);
        }
      }
      return res;
    } catch (err) {
      if (url && !skipPing) {
        await ping(url, "/fail", err instanceof Error ? err.message : String(err));
      }
      throw err;
    }
  };
}
