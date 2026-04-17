// StarScreener Pipeline — module-level event emitter for live SSE streaming.
//
// The recompute loop, snapshotter, and alert engine emit here. The
// /api/stream SSE endpoint subscribes and forwards events to clients. Any
// future consumers (webhook delivery, Slack, metrics) subscribe the same
// way — one emitter, many consumers.
//
// Events are fire-and-forget: emitters must never block. Consumers that
// cannot keep up drop their buffer and reconnect. No replay, no persistence.

import { EventEmitter } from "node:events";

export type PipelineEventName =
  | "rank_changed"
  | "breakout_detected"
  | "snapshot_captured"
  | "alert_triggered";

export interface RankChangedEvent {
  type: "rank_changed";
  at: string; // ISO
  repoId: string;
  fullName: string;
  fromRank: number | null;
  toRank: number;
  window: "overall";
}

export interface BreakoutDetectedEvent {
  type: "breakout_detected";
  at: string;
  repoId: string;
  fullName: string;
  score: number;
  reason?: string;
}

export interface SnapshotCapturedEvent {
  type: "snapshot_captured";
  at: string;
  repoId: string;
  fullName: string;
  stars: number;
  starsDelta24h: number | null;
}

export interface AlertTriggeredEvent {
  type: "alert_triggered";
  at: string;
  ruleId: string;
  repoId: string;
  fullName: string;
  condition: string;
}

export type PipelineEvent =
  | RankChangedEvent
  | BreakoutDetectedEvent
  | SnapshotCapturedEvent
  | AlertTriggeredEvent;

// Module-level singleton — shared across all route handlers in the same
// Node.js process. Vercel serverless functions each get their own process
// so this stream only works with a persistent deploy (Railway/Fly/self-host)
// or within a single long-lived dev server. Documented in /api/stream.
const globalKey = Symbol.for("starscreener.pipeline.events");
type GlobalWithEmitter = typeof globalThis & {
  [globalKey]?: EventEmitter;
};
const g = globalThis as GlobalWithEmitter;
if (!g[globalKey]) {
  const em = new EventEmitter();
  em.setMaxListeners(100); // allow many concurrent SSE clients
  g[globalKey] = em;
}
const emitter: EventEmitter = g[globalKey]!;

export function emitPipelineEvent(event: PipelineEvent): void {
  emitter.emit("event", event);
}

export function onPipelineEvent(
  listener: (event: PipelineEvent) => void,
): () => void {
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}

/** Current subscriber count. Useful for debugging + status endpoints. */
export function subscriberCount(): number {
  return emitter.listenerCount("event");
}
