// /tierlist/[shortId] — saved/shared tier-list view plus remix entry.
//
// Hydrates the editor with the saved payload's title/tiers/unrankedItems and
// surfaces a remix banner that deep-links back to /tierlist?…tiers=… so the
// viewer can fork.
//
// 2026-05-25 update: accepts `?state=<base64>` as a fallback when the
// shortId can't be resolved from Redis (typical case: tier list saved on
// dev Redis but shared with the prod URL — Twitterbot would otherwise see
// 404 and skip the unfurl). With the state fallback, the OG card always
// renders.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/lib/icons";
import { TierListEditor } from "@/components/tools/tier-list/TierListEditor";
import type { PoolItem } from "@/lib/tier-list/client-store";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { isShortId } from "@/lib/tier-list/short-id";
import { decodeStateParam, pickFirst } from "@/lib/tier-list/state-url";
import { getTierList } from "@/lib/tier-list/store";
import { encodeTierListUrl, stateHash } from "@/lib/tier-list/url";
import type { TierListPayload } from "@/lib/types/tier-list";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ shortId: string }>;
  searchParams: Promise<{ state?: string | string[] }>;
}

function buildItemMeta(repoIds: string[]): Record<string, PoolItem> {
  const meta: Record<string, PoolItem> = {};
  for (const id of repoIds) {
    const repo = getDerivedRepoByFullName(id);
    if (!repo) {
      const [owner = "", name = ""] = id.split("/");
      meta[id] = {
        repoId: id,
        owner,
        displayName: name || id,
      };
      continue;
    }
    meta[id] = {
      repoId: repo.fullName,
      owner: repo.owner,
      displayName: repo.name,
      avatarUrl: repo.ownerAvatarUrl,
      stars: repo.stars,
    };
  }
  return meta;
}

/**
 * Resolve the tier-list payload via Redis (preferred) or fall back to the
 * `?state=` query param when Redis can't find the shortId. The fallback is
 * the same base64 payload the share URL carries, so cards always render
 * even when a list saved in dev is shared via the prod URL.
 */
async function resolvePayload(
  shortId: string,
  stateRaw: string | string[] | undefined,
): Promise<{ payload: TierListPayload | null; stateParam: string | null }> {
  const stateParam = pickFirst(stateRaw) ?? null;
  if (isShortId(shortId)) {
    const redisHit = await getTierList(shortId);
    if (redisHit) return { payload: redisHit, stateParam };
  }
  const decoded = decodeStateParam(stateRaw);
  return { payload: decoded, stateParam };
}

export async function generateMetadata({
  params,
  searchParams,
}: Params): Promise<Metadata> {
  const { shortId } = await params;
  const { state } = await searchParams;
  const { payload, stateParam } = await resolvePayload(shortId, state);
  if (!payload) {
    return { title: `Tier list · ${SITE_NAME}` };
  }
  const hash = stateHash({
    title: payload.title,
    tiers: payload.tiers,
    unrankedItems: payload.unrankedItems,
  });
  // Prefer state-encoded OG URL when we have one — the renderer never
  // needs to hit Redis, which means the unfurl works for crawlers even
  // when the saved payload only exists in another environment's store.
  const ogPath = stateParam
    ? `/api/og/tier-list?state=${stateParam}&aspect=h&v=${hash}`
    : `/api/og/tier-list?id=${shortId}&aspect=h&v=${hash}`;
  const ogUrl = absoluteUrl(ogPath);
  const pageUrl = stateParam
    ? absoluteUrl(`/tierlist/${shortId}?state=${stateParam}`)
    : absoluteUrl(`/tierlist/${shortId}`);
  const description = payload.description
    ? payload.description
    : `${payload.title} — tier list built on TrendingRepo.`;
  return {
    title: `${payload.title} · ${SITE_NAME}`,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: payload.title,
      description,
      url: pageUrl,
      // 1200×630 (true 2:1) is Twitter's documented `summary_large_image`
      // aspect. 1200×675 (16:9) silently center-crops on the X renderer.
      images: [{ url: ogUrl, width: 1200, height: 630 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      site: "@TrendingRepo",
      title: payload.title,
      description,
      images: [ogUrl],
    },
  };
}

export default async function SavedTierListPage({
  params,
  searchParams,
}: Params) {
  const { shortId } = await params;
  const { state } = await searchParams;
  const { payload } = await resolvePayload(shortId, state);
  if (!payload) notFound();

  const allItemIds = [
    ...payload.unrankedItems,
    ...payload.tiers.flatMap((tier) => tier.items),
  ];
  const itemMeta = buildItemMeta(allItemIds);

  return (
    <main className="home-surface tools-page tierlist-page">
      <RemixBanner payload={payload} />
      <TierListEditor
        initial={{
          title: payload.title,
          tiers: payload.tiers,
          unrankedItems: payload.unrankedItems,
          itemMeta,
        }}
      />
    </main>
  );
}

function RemixBanner({ payload }: { payload: TierListPayload }) {
  const remixHref = `/tierlist?${encodeTierListUrl({
    title: `${payload.title} — remix`,
    tiers: payload.tiers,
    unrankedItems: payload.unrankedItems,
  }).toString()}`;
  const author = payload.ownerHandle
    ? `@${payload.ownerHandle}`
    : "anonymous author";
  return (
    <section className="tier-remix-banner">
      <span className="tier-remix-banner-meta">
        {"// viewing tier list "}
        <b>{payload.shortId}</b>
        {" / made by "}
        <b>{author}</b>
      </span>
      <Link href={remixHref} className="btn primary tier-remix-cta">
        <Icon name="sparkles" size="sm" />
        <span>Remix this board</span>
      </Link>
    </section>
  );
}
