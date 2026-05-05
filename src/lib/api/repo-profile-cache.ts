import { unstable_cache } from "next/cache";
import { cache } from "react";

import { getEdgeResponseCache } from "@/lib/api/edge-response-cache";
import {
  buildCanonicalRepoProfile,
  type CanonicalRepoProfile,
} from "@/lib/api/repo-profile";

const CLOSE_EDGE_TTL_SEC = 30;
const CLOSE_EDGE_KEY_PREFIX = "repo-profile:v1:";

function normalizeFullName(fullName: string): string {
  return fullName.trim().toLowerCase();
}

const getCanonicalRepoProfileShared = unstable_cache(
  async (fullName: string): Promise<CanonicalRepoProfile | null> => {
    const key = `${CLOSE_EDGE_KEY_PREFIX}${normalizeFullName(fullName)}`;
    const edgeCache = getEdgeResponseCache();

    const cached = await edgeCache.getJson<CanonicalRepoProfile | null>(key);
    if (cached) return cached;

    const profile = await buildCanonicalRepoProfile(fullName);
    if (profile) {
      await edgeCache.setJson(key, profile, CLOSE_EDGE_TTL_SEC);
    }
    return profile;
  },
  ["canonical-repo-profile-v1"],
  { revalidate: 30 },
);

/**
 * Canonical repo-profile accessor with two layers:
 * - `React.cache` dedupes repeated calls within one server request/render pass.
 * - `unstable_cache` dedupes across requests for a short revalidate window.
 */
export const getCanonicalRepoProfileCached = cache(
  async (fullName: string): Promise<CanonicalRepoProfile | null> =>
    getCanonicalRepoProfileShared(normalizeFullName(fullName)),
);
