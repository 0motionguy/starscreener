// Per-idea auto-post hook — fires composeIdeaPublishedPost() into the
// configured outbound adapter when an idea transitions
// pending_moderation → published.
//
// Boundary discipline:
//   - The Twitter call is failure-isolated. A 5xx from Twitter (or a
//     "skipped" no-op from the null adapter) MUST NOT roll back the
//     moderation decision; the audit row records the failure separately.
//   - Idempotency: this module never fires for an idea whose audit log
//     already shows an idea_published run with the same author + idea id.
//     Re-approving an already-published idea is a no-op.
//   - Rate limit: 1 idea_published post per authorId per 24h. Strategy
//     doc says "to prevent flooding" — a prolific author with 5 ideas
//     approved in a burst would otherwise carpet-bomb the feed.
//
// Storage piggy-backs on the same JSONL audit log as the daily/weekly
// cron runs. The audit row records the idea id in errorMessage so
// idempotency lookups can match without adding a column.
//
// Hook invocation lives in moderateIdea() — see src/lib/ideas.ts.
// Doing it inside moderateIdea() rather than in the admin API route
// guarantees that EVERY publish path (admin queue, future
// auto-publish-after-gate flow, agent-driven publish via MCP) gets
// the hook for free.

import { selectOutboundAdapter } from "./adapters";
import { recordOutboundRun, listOutboundRuns } from "./audit";
import { composeIdeaPublishedPost } from "./composer";
// We accept a pre-projected PublicIdea + the few raw fields we need
// (authorId, prior status) instead of importing the full IdeaRecord
// type from @/lib/ideas. That eliminates a circular import: ideas.ts
// invokes this hook on publish, and this hook needs to operate on
// idea data without dragging in ideas.ts at the value level.
import type { PublicIdea } from "@/lib/ideas";

// Marker prepended to errorMessage on idea_published audit rows so we
// can cheaply locate prior posts for the same idea/author. Format:
//   "ok:idea=<idea-id>;author=<author-id>" — for successful runs
//   "skipped:idea=<idea-id>;author=<author-id>" — for null-adapter runs
//   "error:idea=<idea-id>;author=<author-id>;<actual-message>"
//
// The audit row's status field already distinguishes published / logged
// / skipped / error; the marker is just a cheap way to match a run to
// an idea without adding a column to the audit schema.
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function buildAuditMarker(
  status: "ok" | "skipped" | "error",
  ideaId: string,
  authorId: string,
  detail?: string,
): string {
  const head = `${status}:idea=${ideaId};author=${authorId}`;
  return detail ? `${head};${detail}` : head;
}

interface PriorRun {
  authorId: string | null;
  ideaId: string | null;
  isPublishedKind: boolean;
  startedAt: string;
  status: string;
}

/**
 * Cheap parser for the audit marker we encode into errorMessage.
 * Returns nulls when the row's errorMessage doesn't fit the pattern
 * (e.g. error rows from before this hook existed) so callers can skip
 * them without throwing.
 */
function parseAuditMarker(message: string | null): {
  ideaId: string | null;
  authorId: string | null;
} {
  if (!message) return { ideaId: null, authorId: null };
  const ideaMatch = message.match(/idea=([A-Za-z0-9_-]+)/);
  const authorMatch = message.match(/author=([^;]+)/);
  return {
    ideaId: ideaMatch?.[1] ?? null,
    authorId: authorMatch?.[1] ?? null,
  };
}

async function loadPriorIdeaPublishedRuns(): Promise<PriorRun[]> {
  const rows = await listOutboundRuns();
  return rows
    .filter((r) => r.kind === "idea_published")
    .map((r) => {
      const parsed = parseAuditMarker(r.errorMessage);
      return {
        authorId: parsed.authorId,
        ideaId: parsed.ideaId,
        isPublishedKind: true,
        startedAt: r.startedAt,
        status: r.status,
      };
    });
}

export type AutoPostDecision =
  | { kind: "fired"; status: "published" | "logged" | "skipped" | "error" }
  | { kind: "duplicate"; previousAt: string }
  | { kind: "rate_limited"; mostRecentAt: string }
  // `status` is whatever string came in from afterStatus — callers
  // only observe this for telemetry so we don't need a narrower type.
  | { kind: "not_published"; status: string };

// Test seam: every fire-and-forget hook invocation registers its
// promise here so test code can deterministically await completion
// without sprinkling setImmediate hacks. In production nothing reads
// from this set; it grows briefly and the entries self-remove once
// the hook settles. The set is bounded by concurrent publish
// operations — a handful at most.
const inFlight = new Set<Promise<AutoPostDecision>>();

/**
 * Test helper: await every currently-in-flight auto-post hook. Used
 * by integration tests that fire the hook via moderateIdea / createIdea
 * and need to see the audit row before asserting. Callers in
 * production code should NOT use this — it's for tests only.
 */
export async function __awaitInFlightAutoPosts(): Promise<void> {
  // Settle everything that was in flight when this was called; more
  // work may enqueue while we wait, so loop until empty.
  while (inFlight.size > 0) {
    const snapshot = Array.from(inFlight);
    await Promise.allSettled(snapshot);
  }
}

export interface AutoPostInput {
  /**
   * Pre-projected idea for composer input. Caller computes via
   * `toPublicIdea(record)` — keeps this module off @/lib/ideas at
   * the value level (no circular import).
   */
  idea: PublicIdea;
  /**
   * Raw authorId (NOT the public authorHandle). We need this for the
   * per-author rate-limit lookup; it never leaves the audit row.
   */
  authorId: string;
  /** Idea status before the moderation decision was applied. */
  beforeStatus: string;
  /** Status AFTER the decision. Only "published" triggers a post. */
  afterStatus: string;
}

/**
 * Decide and (if appropriate) fire the auto-post for a freshly
 * moderated idea. Returns a decision describing what happened —
 * callers inspect this for observability but never depend on it for
 * correctness. Failure-isolated: a 5xx from Twitter does NOT throw
 * back to the caller (moderation must persist regardless).
 */
export function autoPostIdeaIfEligible(
  input: AutoPostInput,
  now: Date = new Date(),
): Promise<AutoPostDecision> {
  const promise = autoPostIdeaIfEligibleInner(input, now);
  inFlight.add(promise);
  promise.finally(() => inFlight.delete(promise));
  return promise;
}

async function autoPostIdeaIfEligibleInner(
  input: AutoPostInput,
  now: Date = new Date(),
): Promise<AutoPostDecision> {
  // Only fire on the moderation transition into "published". A
  // buildStatus-driven promotion to "shipped" is a separate event
  // and does not auto-post (that's handled by a future shipped-repo
  // hook — strategy doc P1).
  if (input.afterStatus !== "published") {
    return { kind: "not_published", status: input.afterStatus };
  }
  if (input.beforeStatus === "published") {
    return {
      kind: "duplicate",
      previousAt: input.idea.publishedAt ?? input.idea.createdAt,
    };
  }

  // Idempotency + rate limit are answered from the same audit log
  // read, so we read once.
  const prior = await loadPriorIdeaPublishedRuns();

  // Idempotency: this exact idea was already auto-posted (status ok
  // or skipped — error rows are retried because the prior didn't
  // actually surface to readers).
  const exact = prior.find(
    (r) =>
      r.ideaId === input.idea.id &&
      (r.status === "published" ||
        r.status === "logged" ||
        r.status === "skipped"),
  );
  if (exact) {
    return { kind: "duplicate", previousAt: exact.startedAt };
  }

  // Rate limit: 1 idea_published per authorId per 24h. Skip when the
  // most recent ok/skipped run for this author is inside the window.
  const cutoff = now.getTime() - RATE_LIMIT_WINDOW_MS;
  const sameAuthorRecent = prior.find(
    (r) =>
      r.authorId === input.authorId &&
      Date.parse(r.startedAt) >= cutoff &&
      (r.status === "published" ||
        r.status === "logged" ||
        r.status === "skipped"),
  );
  if (sameAuthorRecent) {
    return {
      kind: "rate_limited",
      mostRecentAt: sameAuthorRecent.startedAt,
    };
  }

  // Compose + fire.
  const startedAt = now.toISOString();
  const adapter = selectOutboundAdapter();
  const post = composeIdeaPublishedPost(input.idea);

  try {
    const result = await adapter.postThread([post]);
    const first = result.posts[0];
    const status: "published" | "logged" | "skipped" =
      first?.status === "published"
        ? "published"
        : first?.status === "logged"
          ? "logged"
          : "skipped";
    await recordOutboundRun({
      kind: "idea_published",
      adapterName: adapter.name,
      status,
      threadUrl: result.threadUrl,
      postCount: 1,
      startedAt,
      // Encode the idea + author into errorMessage so subsequent
      // calls can match for idempotency without a schema change.
      errorMessage: buildAuditMarker(
        status === "published" || status === "logged" ? "ok" : "skipped",
        input.idea.id,
        input.authorId,
      ),
    });
    return { kind: "fired", status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordOutboundRun({
      kind: "idea_published",
      adapterName: adapter.name,
      status: "error",
      threadUrl: null,
      postCount: 0,
      startedAt,
      errorMessage: buildAuditMarker(
        "error",
        input.idea.id,
        input.authorId,
        message.slice(0, 200),
      ),
    }).catch(() => undefined);
    return { kind: "fired", status: "error" };
  }
}
