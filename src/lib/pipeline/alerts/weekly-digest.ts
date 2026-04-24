// Weekly email digest composition — pure helper module.
//
// Used by `src/app/api/cron/digest/weekly/route.ts`. Kept separate so
// the business rules (what counts as a "recent alert", how we pick
// "top breakouts", how user→email lookup works) can be unit-tested
// without importing Next.js.
//
// Contract:
//   - INPUT: the set of userIds that have rules, the last-7d alert
//     events grouped by user, the current Repo[] snapshot, and the
//     operator-provided userId→email map.
//   - OUTPUT: `DigestInput[]` ready for `renderDigestEmail`, plus the
//     count of users we had to skip because they had no email on file.
//
// Selection rules:
//   - A user gets a digest only when they have an email on file AND
//     (they have ≥1 recent alert OR there is ≥1 platform breakout to
//     show). Empty digests are dropped — we'd rather not email at all
//     than burn trust with a blank one.
//   - Platform breakouts: top 5 by `(breakout ? 1 : 0) | momentumScore
//     | starsDelta7d` composite. Breakouts always sort above non-
//     breakouts regardless of raw score.

import type { Repo } from "../../types";
import type {
  AlertEventSummary,
  DigestInput,
  RepoBreakoutSummary,
} from "../../email/render-digest";
import type { AlertEvent, AlertEventStore } from "../types";

// ---------------------------------------------------------------------------
// User → email map
// ---------------------------------------------------------------------------

export type DigestUserEmailMap = ReadonlyMap<string, string>;

/**
 * Load `DIGEST_USER_EMAILS_JSON` from the environment. Format:
 *   `{"u_abc":"alice@example.com","u_def":"bob@example.com"}`
 *
 * Returns an empty map when the env is unset or unparseable. The empty-
 * map path is deliberate: with no mapping today the weekly digest can't
 * deliver real emails, so the cron skips every user and logs counts.
 *
 * TODO(auth): replace with a real user table lookup once accounts have
 * email on file. At that point this env map should degrade to a
 * test-only override.
 */
export function loadUserEmailMapFromEnv(): DigestUserEmailMap {
  const raw = process.env.DIGEST_USER_EMAILS_JSON;
  if (!raw || raw.trim().length === 0) return new Map();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Map();
    }
    const entries: Array<[string, string]> = [];
    for (const [userId, email] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof userId !== "string" || userId.trim().length === 0) continue;
      if (typeof email !== "string" || email.trim().length === 0) continue;
      if (!email.includes("@")) continue;
      entries.push([userId.trim(), email.trim()]);
    }
    return new Map(entries);
  } catch {
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Alert collection
// ---------------------------------------------------------------------------

/**
 * Collect last-7d AlertEvents per user. Events older than `cutoffMs` are
 * excluded. The `userIds` set restricts the scan — the AlertEventStore
 * interface requires a userId to list events.
 */
export function collectAlertsByUser(
  userIds: Iterable<string>,
  eventStore: Pick<AlertEventStore, "listForUser">,
  cutoffMs: number,
): Map<string, AlertEvent[]> {
  const out = new Map<string, AlertEvent[]>();
  for (const userId of userIds) {
    const raw = eventStore.listForUser(userId);
    const recent: AlertEvent[] = [];
    for (const ev of raw) {
      const t = Date.parse(ev.firedAt);
      if (!Number.isFinite(t)) continue;
      if (t < cutoffMs) continue;
      recent.push(ev);
    }
    // Newest first so the digest leads with what's freshest.
    recent.sort((a, b) => (a.firedAt < b.firedAt ? 1 : a.firedAt > b.firedAt ? -1 : 0));
    out.set(userId, recent);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Top breakouts
// ---------------------------------------------------------------------------

/**
 * Pick the top N breakouts platform-wide. Criteria, in priority order:
 *   1. `movementStatus === "breakout"` wins over all non-breakouts.
 *   2. Higher `momentumScore` wins ties.
 *   3. Higher `starsDelta7d` breaks remaining ties.
 */
export function pickTopBreakouts(repos: Repo[], limit = 5): Repo[] {
  const ranked = [...repos].sort((a, b) => {
    const aB = a.movementStatus === "breakout" ? 1 : 0;
    const bB = b.movementStatus === "breakout" ? 1 : 0;
    if (aB !== bB) return bB - aB;
    if (a.momentumScore !== b.momentumScore) {
      return b.momentumScore - a.momentumScore;
    }
    return (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0);
  });
  return ranked.slice(0, Math.max(0, limit));
}

function toBreakoutSummary(repo: Repo): RepoBreakoutSummary {
  return {
    repoId: repo.id,
    fullName: repo.fullName,
    owner: repo.owner,
    name: repo.name,
    description: repo.description ?? null,
    stars: repo.stars,
    starsDelta7d: repo.starsDelta7d ?? 0,
    momentumScore: repo.momentumScore,
    categoryId: repo.categoryId ?? null,
  };
}

function toAlertSummary(event: AlertEvent, repoFullName: string): AlertEventSummary {
  return {
    id: event.id,
    repoId: event.repoId,
    repoFullName,
    title: event.title,
    trigger: event.trigger,
    firedAt: event.firedAt,
  };
}

// ---------------------------------------------------------------------------
// Top-level builder
// ---------------------------------------------------------------------------

export interface BuildWeeklyDigestsInput {
  activeUserIds: ReadonlySet<string>;
  alertsByUser: ReadonlyMap<string, AlertEvent[]>;
  repos: Repo[];
  userEmails: DigestUserEmailMap;
  generatedAt: string;
}

export interface BuildWeeklyDigestsOutput {
  digests: DigestInput[];
  /** Count of users we had to skip because we had no email on file. */
  skippedUsers: number;
}

export function buildWeeklyDigests(
  input: BuildWeeklyDigestsInput,
): BuildWeeklyDigestsOutput {
  const repoById = new Map<string, Repo>();
  for (const r of input.repos) repoById.set(r.id, r);

  const topBreakouts = pickTopBreakouts(input.repos, 5).map(toBreakoutSummary);

  const digests: DigestInput[] = [];
  let skippedUsers = 0;

  for (const userId of input.activeUserIds) {
    const email = input.userEmails.get(userId);
    if (!email) {
      skippedUsers += 1;
      continue;
    }

    const rawAlerts = input.alertsByUser.get(userId) ?? [];
    const recentAlerts = rawAlerts.map((ev) => {
      const repo = repoById.get(ev.repoId);
      // If the repo has been cleaned from the snapshot, fall back to the
      // event's repoId as the fullName so we still render *something*.
      const fullName = repo?.fullName ?? ev.repoId.replace("--", "/");
      return toAlertSummary(ev, fullName);
    });

    // Skip users with no content at all — avoid mailing a blank digest.
    if (recentAlerts.length === 0 && topBreakouts.length === 0) {
      continue;
    }

    digests.push({
      userId,
      userEmail: email,
      recentAlerts,
      topBreakouts,
      generatedAt: input.generatedAt,
    });
  }

  return { digests, skippedUsers };
}
