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
//     resolved userId→email map (profile-backed with env fallback).
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

export interface DigestProfileEmailRow {
  profileId: string;
  clerkUserId: string;
  email: string | null;
  /** Non-null means the account was soft-deleted and must not receive mail. */
  deletedAt?: Date | string | null;
}

export interface MergeProfileEmailsInput {
  userIds: Iterable<string>;
  fallbackEmails: DigestUserEmailMap;
  profiles: Iterable<DigestProfileEmailRow>;
  /**
   * Maps a profile email to the legacy signed-session userId shape
   * (`u_<hmac>`). Optional because local tests/dev may not configure the
   * session secret; direct profile/clerk ids still work without it.
   */
  deriveUserIdFromEmail?: (email: string) => string;
}

/**
 * Load `DIGEST_USER_EMAILS_JSON` from the environment. Format:
 *   `{"u_abc":"alice@example.com","u_def":"bob@example.com"}`
 *
 * Returns an empty map when the env is unset or unparseable. The empty-
 * map path is deliberate: with no mapping today the weekly digest can't
 * deliver real emails, so the cron skips every user and logs counts.
 *
 * This is now a fallback. The weekly cron merges active `profiles.email`
 * rows over this map when a profile-backed identity can be matched.
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

/**
 * Merge profile-backed emails into the digest userId map. The weekly digest
 * has to bridge two identity eras:
 *
 * - legacy pipeline alert rules key by `verifyUserAuth().userId`, commonly
 *   `u_<HMAC(email)>` for signed browser sessions or arbitrary ids from
 *   USER_TOKENS_JSON;
 * - newer account tables key by `profiles.id` / `profiles.clerkUserId`.
 *
 * The DB profile email wins when it can be matched to any active digest
 * userId. Deleted profile identities actively suppress matching env fallback
 * entries so account deletion cannot leave a digest delivery path behind.
 * The env map remains a fallback for anonymous/sessionless ids and test
 * fixtures.
 */
export function mergeProfileEmailsIntoUserEmailMap(
  input: MergeProfileEmailsInput,
): DigestUserEmailMap {
  const requested = new Set(input.userIds);
  const merged = new Map(input.fallbackEmails);
  if (requested.size === 0) return merged;

  for (const profile of input.profiles) {
    const email = profile.email?.trim();
    // Candidate id forms, newest first: profile row id, raw Clerk id, the
    // canonical `c_<clerkUserId>` (see lib/auth/user-id — kept as a literal
    // prefix here so this pipeline lib stays Clerk-import-free), and the
    // legacy email-derived id appended below.
    const candidates = [
      profile.profileId,
      profile.clerkUserId,
      `c_${profile.clerkUserId}`,
    ];
    if (email && email.includes("@") && input.deriveUserIdFromEmail) {
      try {
        candidates.push(input.deriveUserIdFromEmail(email));
      } catch {
        // SESSION_SECRET can be missing in local/dev test contexts. Direct
        // profile/clerk id matching and env fallback still remain available.
      }
    }

    if (profile.deletedAt) {
      for (const candidate of candidates) {
        if (requested.has(candidate)) merged.delete(candidate);
      }
      continue;
    }

    if (!email || !email.includes("@")) continue;

    for (const candidate of candidates) {
      if (requested.has(candidate)) merged.set(candidate, email);
    }
  }

  return merged;
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
 *   4. `fullName` alphabetical is the FINAL deterministic tiebreak — without
 *      it, repos with equal score fell through to input (array) order, so the
 *      "top N" reshuffled run-to-run and the top-5 (per-user digest) wasn't a
 *      stable prefix of the top-10 (newsletter). Both digest surfaces call
 *      this, so they now agree on ordering, differing only in depth.
 *
 * Also deduplicates by lowercased `fullName` and drops repos with a malformed
 * `fullName` (missing owner or name) so no downstream `/repo/…` link can be
 * built as `/repo//` or `/repo/undefined/…`.
 */
export function pickTopBreakouts(repos: Repo[], limit = 5): Repo[] {
  const seen = new Set<string>();
  const clean: Repo[] = [];
  for (const r of repos) {
    const key = r.fullName?.toLowerCase();
    // Require a well-formed owner/name — the URL is built from this.
    if (!key || !isWellFormedFullName(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(r);
  }
  const ranked = clean.sort((a, b) => {
    const aB = a.movementStatus === "breakout" ? 1 : 0;
    const bB = b.movementStatus === "breakout" ? 1 : 0;
    if (aB !== bB) return bB - aB;
    if (a.momentumScore !== b.momentumScore) {
      return b.momentumScore - a.momentumScore;
    }
    const delta = (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0);
    if (delta !== 0) return delta;
    return a.fullName.localeCompare(b.fullName);
  });
  return ranked.slice(0, Math.max(0, limit));
}

/** `owner/name` with both segments non-empty and exactly one slash. */
function isWellFormedFullName(lower: string): boolean {
  const parts = lower.split("/");
  return parts.length === 2 && parts[0]!.length > 0 && parts[1]!.length > 0;
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
