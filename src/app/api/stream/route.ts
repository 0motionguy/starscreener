// GET /api/stream
//
// Server-Sent Events stream of live pipeline events: rank changes, new
// breakouts, snapshot captures, and alert triggers. Clients subscribe with
// an EventSource; the response stays open until the client disconnects or
// the process shuts down.
//
// CAVEAT: this only works on a single long-lived Node.js process. Vercel
// serverless functions each get a fresh process per invocation and don't
// hold SSE connections — deploy to Railway / Fly / Render / self-host if
// you need this in production. Dev-server on localhost works perfectly.
//
// Query params:
//   types=rank_changed,breakout_detected,...  (comma list; default: all)
//
// Protocol:
//   - Each event arrives as one `event: <name>\ndata: <json>\n\n` frame
//   - A heartbeat comment (`: heartbeat\n\n`) is sent every 15s so proxies
//     don't close idle connections
//   - Connection closes cleanly on client disconnect via AbortSignal

import { NextRequest } from "next/server";
import {
  onPipelineEvent,
  subscriberCount,
  type PipelineEvent,
  type PipelineEventName,
} from "@/lib/pipeline/events";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = (() => {
  const raw = Number(process.env.SSE_HEARTBEAT_MS);
  return Number.isFinite(raw) && raw >= 1_000 && raw <= 60_000 ? raw : 15_000;
})();

const MAX_SUBSCRIBERS = (() => {
  const raw = Number(process.env.SSE_MAX_SUBSCRIBERS);
  return Number.isFinite(raw) && raw > 0 && raw <= 1_000 ? raw : 50;
})();

const ALL_TYPES: PipelineEventName[] = [
  "rank_changed",
  "breakout_detected",
  "snapshot_captured",
  "alert_triggered",
];

function parseTypeFilter(req: NextRequest): Set<PipelineEventName> {
  const raw = req.nextUrl.searchParams.get("types");
  if (!raw) return new Set(ALL_TYPES);
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = parts.filter((p): p is PipelineEventName =>
    ALL_TYPES.includes(p as PipelineEventName),
  );
  return new Set(valid.length > 0 ? valid : ALL_TYPES);
}

export async function GET(req: NextRequest): Promise<Response> {
  // APP-18: Vercel serverless functions get a fresh process per invocation
  // and don't hold long-lived SSE connections. The endpoint *appears* to
  // work — the connection establishes, then drops on the next platform
  // recycle (often within seconds). Refuse fast in that environment so
  // clients fall back to polling rather than reconnect-flapping.
  if (process.env.VERCEL) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "SSE not supported on Vercel — deploy to Railway/Fly/self-host",
        code: "SSE_UNAVAILABLE_ON_VERCEL",
      }),
      {
        status: 501,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  // Cap concurrent subscribers to protect the long-lived process. Returning
  // 503 here keeps clients' auto-reconnect honest — they'll back off and
  // retry rather than hammering a saturated server.
  if (subscriberCount() >= MAX_SUBSCRIBERS) {
    return new Response(
      `event: full\ndata: ${JSON.stringify({
        max: MAX_SUBSCRIBERS,
        at: new Date().toISOString(),
      })}\n\n`,
      {
        status: 503,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Retry-After": "30",
        },
      },
    );
  }

  const wantedTypes = parseTypeFilter(req);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore — controller may already be closed on abort
        }
      };
      const send = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      // Opening frame: tells the client we're live + which types they'll get.
      send(
        `event: ready\ndata: ${JSON.stringify({
          at: new Date().toISOString(),
          types: [...wantedTypes],
          subscribers: subscriberCount() + 1,
        })}\n\n`,
      );

      const unsubscribe = onPipelineEvent((event: PipelineEvent) => {
        if (!wantedTypes.has(event.type)) return;
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        send(`: heartbeat ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      const cleanup = (): void => {
        clearInterval(heartbeat);
        unsubscribe();
        close();
      };

      req.signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering on reverse proxies
    },
  });
}
