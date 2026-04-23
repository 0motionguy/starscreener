import { NextRequest, NextResponse } from "next/server";
import { getDefaultSocialAdapters } from "@/lib/pipeline/adapters/social-adapters";
import {
  NitterAdapter,
  isTwitterAvailable,
} from "@/lib/pipeline/adapters/nitter-adapter";
import {
  buildDerivedWhyMoving,
  getDerivedRelatedRepos,
} from "@/lib/derived-insights";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import type { SocialMention } from "@/lib/types";
import type { RepoMention } from "@/lib/pipeline/types";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { getTwitterRepoPanel } from "@/lib/twitter/service";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

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
  const { owner, name } = await params;

  // Reject path-traversal / malformed slugs before hitting the pipeline.
  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return NextResponse.json({ error: "Invalid repo slug" }, { status: 400 });
  }

  const repo = getDerivedRepoByFullName(`${owner}/${name}`);
  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  // Fan out to the live social adapters. Each adapter swallows its own
  // errors and returns []; the Promise.all wrapper is additionally guarded
  // so an exception (adapter constructor throwing, network stack offline)
  // still lets the JSON response ship with an empty mentions array.
  let mentions: SocialMention[] = [];
  try {
    const adapters = getDefaultSocialAdapters();
    if (isTwitterAvailable()) {
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

  const whyMoving = buildDerivedWhyMoving(repo);
  const relatedRepos = getDerivedRelatedRepos(repo, 6);
  const twitterSignal = await getTwitterRepoPanel(repo.fullName);

  return NextResponse.json(
    {
      repo,
      score: null,
      category: null,
      reasons: null,
      social: [],
      mentions,
      twitterSignal,
      whyMoving,
      relatedRepos,
      twitterAvailable: isTwitterAvailable(),
    },
    { headers: READ_CACHE_HEADERS },
  );
}
