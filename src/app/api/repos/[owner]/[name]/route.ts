import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import { getDefaultSocialAdapters } from "@/lib/pipeline/adapters/social-adapters";
import {
  NitterAdapter,
  TWITTER_AVAILABLE,
} from "@/lib/pipeline/adapters/nitter-adapter";
import type { SocialMention, WhyMoving } from "@/lib/types";
import type { RepoMention, RepoReason } from "@/lib/pipeline/types";

/**
 * Adapt the pipeline's RepoReason shape to the UI's legacy WhyMoving shape.
 * The UI component expects `{ repoId, headline, factors: [...] }` — map
 * RepoReason.details onto that. Returns null when no reason bundle exists.
 */
function reasonToWhyMoving(
  repoId: string,
  reason: RepoReason | null,
): WhyMoving | null {
  if (!reason) return null;
  return {
    repoId,
    headline: reason.summary,
    factors: reason.details.map((d) => ({
      factor: d.code,
      headline: d.headline,
      detail: d.detail,
      confidence: d.confidence,
      timeframe: d.timeframe,
    })),
  };
}

/**
 * Narrow the pipeline's RepoMention shape down to the UI's SocialMention
 * contract — drops fields the UI doesn't render (authorFollowers, reach,
 * discoveredAt, isInfluencer).
 */
function toSocialMention(m: RepoMention): SocialMention {
  return {
    id: m.id,
    repoId: m.repoId,
    platform: m.platform,
    author: m.author,
    content: m.content,
    url: m.url,
    sentiment: m.sentiment,
    engagement: m.engagement,
    postedAt: m.postedAt,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  await pipeline.ensureReady();
  const { owner, name } = await params;

  const summary = pipeline.getRepoSummary(`${owner}/${name}`);

  if (!summary) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const { repo, score, category, reasons, social } = summary;

  // Fan out to the live social adapters. Each adapter swallows its own
  // errors and returns []; the Promise.all wrapper is additionally guarded
  // so an exception (adapter constructor throwing, network stack offline)
  // still lets the JSON response ship with an empty mentions array.
  let mentions: SocialMention[] = [];
  try {
    const adapters = getDefaultSocialAdapters();
    if (TWITTER_AVAILABLE) {
      adapters.push(new NitterAdapter());
    }
    const results = await Promise.all(
      adapters.map((a) => a.fetchMentionsForRepo(repo.fullName)),
    );
    mentions = results.flat().map(toSocialMention);
    mentions.sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
  } catch (err) {
    console.error(
      `[api:repo] social fetch for ${repo.fullName} failed`,
      err,
    );
    mentions = [];
  }

  const whyMoving = reasonToWhyMoving(repo.id, reasons);

  const relatedRepos = pipeline.getRelatedRepos(repo.id, 6);

  return NextResponse.json({
    repo,
    score,
    category,
    reasons,
    social,
    mentions,
    whyMoving,
    relatedRepos,
    twitterAvailable: TWITTER_AVAILABLE,
  });
}
