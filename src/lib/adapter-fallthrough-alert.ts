// Sentry warning when a TOOLBOX read adapter returns null AND the legacy
// data-store path also has no data — i.e. the page is about to render
// with zero data for that signal. Silent before this instrumentation.
//
// Called at the end of each refresh hook (refreshHackernewsMentionsFromStore,
// refreshRedditMentionsFromStore, etc.). Signal name is the lowercase
// source key ("hn", "reddit", "bluesky", "devto", "velocity"); reason
// names the failure mode for triage.

import "server-only";
import * as Sentry from "@sentry/nextjs";

type FallthroughSignal =
  | "hn"
  | "reddit"
  | "bluesky"
  | "devto"
  | "velocity"
  | "huggingface"
  | "producthunt"
  | "openai"
  | "arxiv"
  | "claude_rss"
  | "lobsters"
  | "npm_dependents"
  | "funding";

type FallthroughReason =
  | "toolbox_null_legacy_missing"
  | "toolbox_null_legacy_fallback_empty";

export function alertAdapterFallthrough(
  signal: FallthroughSignal,
  reason: FallthroughReason,
  extra?: Record<string, unknown>,
): void {
  Sentry.captureMessage(`adapter_fall_through:${signal}`, {
    level: "warning",
    tags: { signal, reason, kind: "adapter_fall_through" },
    extra: extra ?? {},
  });
}
