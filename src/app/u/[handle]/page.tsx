// /u/[handle] — public user profile. Strategy doc: "where social
// density forms."
//
// v1 identity model: handle === authorId from verifyUserAuth. Once a
// real users/handles table lands we'll normalize the incoming handle
// against it and return 404 for unknown handles; today a handle with
// no ideas + no reactions renders a soft "no activity yet" state.

import type { Metadata } from "next";

import { getProfile } from "@/lib/profile";
import {
  countReactions,
  listReactionsForObject,
} from "@/lib/reactions";
import type { ReactionCounts } from "@/lib/reactions-shape";
import { ProfileView } from "@/components/profile/ProfileView";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const dynamic = "force-dynamic";

// Loose handle validation — same character set as the idea authorHandle
// intake (USER_TOKENS_JSON can carry arbitrary ids, but browser URLs
// only round-trip a predictable charset so /u/[handle] accepts that).
const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const canonical = absoluteUrl(`/u/${handle}`);
  return {
    title: `@${handle} — ${SITE_NAME}`,
    description: `Public profile of @${handle} on ${SITE_NAME}: ideas posted, repos shipped, builder reactions given.`,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      url: canonical,
      title: `@${handle} — ${SITE_NAME}`,
      description: `Public profile of @${handle} on ${SITE_NAME}`,
      siteName: SITE_NAME,
    },
    // Deliberately indexable once a user has activity. For empty
    // profiles we hide from search because there's nothing to show.
    robots: { index: true, follow: true },
  };
}

export default async function UserProfilePage({ params }: PageProps) {
  const { handle } = await params;
  if (!HANDLE_PATTERN.test(handle)) {
    // Render the same empty-state UI the aggregator returns for an
    // unknown handle — visually identical, no 404 brand hit.
    return (
      <ProfileView
        profile={{
          handle,
          exists: false,
          ideas: [],
          shippedRepos: [],
          reactionsGiven: { build: 0, use: 0, buy: 0, invest: 0, total: 0 },
          recentReactions: [],
        }}
        ideaReactionCounts={{}}
      />
    );
  }

  const profile = await getProfile(handle);

  // Fetch reaction counts for every idea in one pass. The storage
  // layer reads the file once per call; for a profile with N ideas
  // that's N reads. Small N (<50) — acceptable for v1; the Postgres
  // cutover batches this into a single GROUP BY.
  const entries = await Promise.all(
    profile.ideas.map(async (idea) => {
      const records = await listReactionsForObject("idea", idea.id);
      return [idea.id, countReactions(records)] as const;
    }),
  );
  const ideaReactionCounts: Record<string, ReactionCounts> =
    Object.fromEntries(entries);

  return (
    <ProfileView
      profile={profile}
      ideaReactionCounts={ideaReactionCounts}
    />
  );
}
