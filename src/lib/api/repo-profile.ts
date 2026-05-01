// Canonical repo-profile assembler.
//
// Single entry point that stitches together every per-signal loader the
// profile surfaces consume. Used by:
//   - GET /api/repos/[owner]/[name]?v=2 (public read API)
//   - future client-side refresh hooks (one HTTP call, not eleven)
//   - later: the SSR page at /repo/[owner]/[name] can call this directly
//     to eliminate the duplicated loader stitching there.
//
// Contract:
//   - Pure read function. No side effects beyond the cached reads the
//     individual loaders already perform.
//   - Returns `null` when the repo is unknown (route → 404). Every other
//     field degrades gracefully to empty/null so a partial snapshot still
//     renders.
//   - Does NOT paginate mentions beyond 50 rows. The /mentions endpoint
//     owns the full walk; this stitches the "first 50" slice used by the
//     profile's evidence feed.
//
import {
  getDerivedRepoByFullName,
} from "@/lib/derived-repos";
import { getRepoReasons, type HumanReason } from "@/lib/repo-reasons";
import {
  getRelatedReposFor,
  type RelatedRepoItem,
} from "@/lib/repo-related";
import {
  getPredictionForRepo,
  type PredictionItem,
} from "@/lib/repo-predictions";
import {
  getIdeasForRepo,
  type IdeaItem,
} from "@/lib/repo-ideas";
import {
  getFreshnessSnapshot,
  type FreshnessSnapshot,
} from "@/lib/source-health";
import { getTwitterRepoPanel } from "@/lib/twitter/service";
import type { TwitterRepoPanel } from "@/lib/twitter/types";
import {
  getNpmPackagesForRepo,
  type NpmPackageRow,
} from "@/lib/npm";
import {
  getDailyDownloadsForPackage,
  type DailyDownload,
} from "@/lib/npm-daily";
import { getNpmDependentsCount } from "@/lib/npm-dependents";
import { getLaunchForRepo, type Launch } from "@/lib/producthunt";
import {
  getRevenueOverlay,
  getSelfReportedOverlay,
  getTrustmrrClaimOverlay,
  refreshRevenueOverlaysFromStore,
} from "@/lib/revenue-overlays";
import { refreshRepoProfilesFromStore } from "@/lib/repo-profiles";
import {
  getFundingEventsForRepo,
  type RepoFundingEvent,
} from "@/lib/funding/repo-events";
import { pipeline, mentionStore } from "@/lib/pipeline/pipeline";
import { scoreStore } from "@/lib/pipeline/storage/singleton";
import type { Repo, RevenueOverlay, SocialPlatform } from "@/lib/types";
import type { RepoMention, RepoScore } from "@/lib/pipeline/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Upper bound on mentions returned inline with the canonical profile. */
const PROFILE_MENTIONS_LIMIT = 50;

export interface CanonicalRepoProfileMentions {
  /**
   * Newest-first mention window, capped at PROFILE_MENTIONS_LIMIT across
   * every platform. For deeper walks, callers use the paginated endpoint
   * (GET /api/repos/[owner]/[name]/mentions).
   */
  recent: RepoMention[];
  /**
   * Base64url-encoded cursor for the NEXT page when the first-50 slice hit
   * the limit; `null` when the full set fits under the cap. Consumers feed
   * this into the paginated endpoint.
   */
  nextCursor: string | null;
  /** Per-platform counts over the full persisted set for this repo. */
  countsBySource: Partial<Record<SocialPlatform, number>>;
}

export interface CanonicalRepoProfileNpm {
  packages: NpmPackageRow[];
  /** 30d daily download history keyed by package name. */
  dailyDownloads: Record<string, DailyDownload[]>;
  /** Dependents count keyed by package name. `null` = unknown, not zero. */
  dependents: Record<string, number | null>;
}

export interface CanonicalRepoProfileRevenue {
  verified: RevenueOverlay | null;
  selfReported: RevenueOverlay | null;
  /** Only non-null when no verified overlay exists for this repo. */
  trustmrrClaim: RevenueOverlay | null;
}

export interface CanonicalRepoProfile {
  /** ISO timestamp — assembly time, not per-loader freshness. */
  fetchedAt: string;
  v: 2;
  repo: Repo;
  score: RepoScore | null;
  reasons: HumanReason[];
  mentions: CanonicalRepoProfileMentions;
  freshness: FreshnessSnapshot;
  twitter: TwitterRepoPanel | null;
  npm: CanonicalRepoProfileNpm;
  productHunt: Launch | null;
  revenue: CanonicalRepoProfileRevenue;
  funding: RepoFundingEvent[];
  related: RelatedRepoItem[];
  /** Latest prediction matching the 30d horizon bias; null when no prediction. */
  prediction: PredictionItem | null;
  /** Ideas targeting this repo; capped at 5, sorted by createdAt desc. */
  ideas: IdeaItem[];
}

// ---------------------------------------------------------------------------
// Cursor encoding (duplicated locally so we don't cross-import the route;
// the shape MUST stay identical to the paginated mentions endpoint so a
// cursor produced here is usable there).
// ---------------------------------------------------------------------------

function encodeCursor(cursor: {
  postedAt: string;
  id: string;
}): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countMentionsByPlatform(
  all: RepoMention[],
): Partial<Record<SocialPlatform, number>> {
  const out: Partial<Record<SocialPlatform, number>> = {};
  for (const m of all) {
    out[m.platform] = (out[m.platform] ?? 0) + 1;
  }
  return out;
}

/**
 * Synthesize RepoMention rows from a TwitterRepoPanel's `topPosts` array.
 *
 * Twitter signals live in their own per-repo store (twitter-repo-signals.jsonl)
 * and bypass the general mentionStore. Until the Twitter pipeline writes
 * directly into mentionStore, we project the panel's topPosts into RepoMention
 * shape at profile-assembly time so the recent-mentions feed and the
 * countsBySource breakdown surface Twitter activity alongside HN/Reddit/etc.
 *
 * IDs are namespaced (`twitter-<postId>`) so they never collide with native
 * mentionStore rows. Confidence is mapped from the Apify scorer's tiering:
 * high→1.0, medium→0.6, low→0.3 (mirrors the same band the Twitter scorer uses).
 */
function synthesizeTwitterMentions(
  panel: TwitterRepoPanel | null,
  repoId: string,
  discoveredAt: string,
): RepoMention[] {
  if (!panel?.topPosts?.length) return [];
  const out: RepoMention[] = [];
  for (const p of panel.topPosts) {
    const conf =
      p.confidence === "high" ? 1.0 : p.confidence === "medium" ? 0.6 : 0.3;
    out.push({
      id: `twitter-${p.postId}`,
      repoId,
      platform: "twitter",
      author: p.authorHandle,
      authorFollowers: null,
      content: p.text,
      url: p.postUrl,
      sentiment: "neutral",
      engagement: p.engagement ?? 0,
      reach: 0,
      postedAt: p.postedAt,
      discoveredAt,
      isInfluencer: false,
      confidence: conf,
      matchReason: p.matchedBy,
      normalizedUrl: p.postUrl,
    });
  }
  return out;
}

/**
 * Synthesize a single RepoMention row from a ProductHunt Launch.
 *
 * ProductHunt launches are a per-repo singleton (one launch per repo at most
 * per cycle). We project the launch into a RepoMention so it shows up in the
 * recent feed. ID is `producthunt-<launch.id>`.
 */
function synthesizeProductHuntMention(
  launch: Launch | null,
  repoId: string,
  discoveredAt: string,
): RepoMention | null {
  if (!launch) return null;
  return {
    id: `producthunt-${launch.id}`,
    repoId,
    platform: "producthunt",
    author: launch.makers?.[0]?.username ?? launch.name,
    authorFollowers: null,
    content: launch.tagline || launch.description || launch.name,
    url: launch.url,
    sentiment: "neutral",
    engagement: (launch.votesCount ?? 0) + (launch.commentsCount ?? 0),
    reach: 0,
    postedAt: launch.createdAt,
    discoveredAt,
    isInfluencer: false,
    confidence: 1.0,
    matchReason: "github_repo_field",
    normalizedUrl: launch.url,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble the full canonical profile for a repo by `owner/name`.
 *
 * Resolution is case-insensitive (matches getDerivedRepoByFullName). Loader
 * calls run in parallel where they are independent; each loader already
 * carries its own cache so no extra memoization is needed at this layer.
 */
export async function buildCanonicalRepoProfile(
  fullName: string,
): Promise<CanonicalRepoProfile | null> {
  const repo = getDerivedRepoByFullName(fullName);
  if (!repo) return null;

  // Pull fresh repo-profiles + revenue-overlays payloads from the data-store
  // before stitching. Both refreshes are internally rate-limited (30s) so a
  // burst of detail-page requests doesn't fan out to N Redis calls.
  await Promise.all([
    refreshRepoProfilesFromStore(),
    refreshRevenueOverlaysFromStore(),
  ]);

  // Hydrate mentions from disk. Idempotent on warm Lambdas; the store is
  // the source of truth for the recent-mentions slice + countsBySource.
  try {
    await pipeline.ensureReady();
  } catch (err) {
    console.error(
      `[repo-profile] pipeline.ensureReady failed for ${repo.fullName}`,
      err,
    );
    // Fall through with whatever is in memory — the slice degrades to [].
  }

  // Kick the async loader in parallel with the synchronous ones. Everything
  // else is a pure in-process read, so `Promise.all` buys us nothing there,
  // but we do want the twitter network trip off the critical path.
  const twitterPromise = getTwitterRepoPanel(repo.fullName);

  // --- Mentions slice + counts (read from the paginated store) ------------
  // listForRepoPaginated returns items in (postedAt desc, id desc); pass the
  // profile cap so the slice matches what the page feed renders. Full count
  // is taken from listForRepo() to avoid a second sort pass.
  const allMentions = mentionStore.listForRepo(repo.id);
  const page = mentionStore.listForRepoPaginated(repo.id, {
    limit: PROFILE_MENTIONS_LIMIT,
  });

  // --- Score --------------------------------------------------------------
  // scoreStore is in-memory — cold Lambdas won't have a score until the
  // pipeline recomputes. `null` is the documented "no score yet" signal.
  const score = scoreStore.get(repo.id) ?? null;

  // --- Synchronous loaders (all are mtime/memo cached internally) ---------
  const reasons = getRepoReasons(repo.fullName);
  const freshness = getFreshnessSnapshot();
  const related = getRelatedReposFor(repo.fullName);
  const productHunt = getLaunchForRepo(repo.fullName);
  const funding = getFundingEventsForRepo(repo.fullName);
  const prediction = getPredictionForRepo(repo.fullName);
  const ideas = getIdeasForRepo(repo.fullName);

  // Revenue trio — verified and trustmrrClaim are mutually exclusive by
  // design (see getTrustmrrClaimOverlay's short-circuit on getRevenueOverlay).
  const verifiedRevenue = getRevenueOverlay(repo.fullName);
  const selfReportedRevenue = getSelfReportedOverlay(repo.fullName);
  const trustmrrClaim = verifiedRevenue
    ? null
    : getTrustmrrClaimOverlay(repo.fullName);

  // --- npm trio ------------------------------------------------------------
  const npmPackages = getNpmPackagesForRepo(repo.fullName);
  const npmDailyDownloads: Record<string, DailyDownload[]> = {};
  const npmDependents: Record<string, number | null> = {};
  for (const pkg of npmPackages) {
    npmDailyDownloads[pkg.name] = getDailyDownloadsForPackage(pkg.name);
    npmDependents[pkg.name] = getNpmDependentsCount(pkg.name);
  }

  // --- Twitter (awaited last so the sync work overlaps its IO) ------------
  let twitter: TwitterRepoPanel | null = null;
  try {
    twitter = await twitterPromise;
  } catch (err) {
    console.error(
      `[repo-profile] twitter panel failed for ${repo.fullName}`,
      err,
    );
    twitter = null;
  }

  // Synthesize Twitter + ProductHunt mentions (these signals live outside
  // the general mentionStore — see synthesizeTwitterMentions docstring) and
  // mix them into the recent slice + countsBySource. Sort newest-first by
  // postedAt and re-cap to PROFILE_MENTIONS_LIMIT so a viral repo doesn't
  // push HN/Reddit out of the slice.
  const fetchedAtIso = new Date().toISOString();
  const twitterSynth = synthesizeTwitterMentions(twitter, repo.id, fetchedAtIso);
  const phSynth = synthesizeProductHuntMention(productHunt, repo.id, fetchedAtIso);
  const synthMentions: RepoMention[] = [...twitterSynth];
  if (phSynth) synthMentions.push(phSynth);

  const mergedRecent =
    synthMentions.length > 0
      ? [...page.items, ...synthMentions]
          .sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1))
          .slice(0, PROFILE_MENTIONS_LIMIT)
      : page.items;
  const mergedAll =
    synthMentions.length > 0 ? [...allMentions, ...synthMentions] : allMentions;

  const mentions: CanonicalRepoProfileMentions = {
    recent: mergedRecent,
    nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    countsBySource: countMentionsByPlatform(mergedAll),
  };

  return {
    fetchedAt: new Date().toISOString(),
    v: 2,
    repo,
    score,
    reasons,
    mentions,
    freshness,
    twitter,
    npm: {
      packages: npmPackages,
      dailyDownloads: npmDailyDownloads,
      dependents: npmDependents,
    },
    productHunt,
    revenue: {
      verified: verifiedRevenue,
      selfReported: selfReportedRevenue,
      trustmrrClaim,
    },
    funding,
    related,
    prediction,
    ideas,
  };
}
