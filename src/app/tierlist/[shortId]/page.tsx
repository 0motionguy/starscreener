// /tierlist/[shortId] — saved/shared tier list (view + remix).
//
// Server-side hydration: looks up the payload, builds the avatar metadata
// cache from the derived-repos index, and seeds the client editor.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TierListEditor } from "@/components/tier-list/TierListEditor";
import type { PoolItem } from "@/lib/tier-list/client-store";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { isShortId } from "@/lib/tier-list/short-id";
import { getTierList } from "@/lib/tier-list/store";
import { encodeTierListUrl, stateHash } from "@/lib/tier-list/url";
import type { TierListPayload } from "@/lib/types/tier-list";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ shortId: string }>;
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

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { shortId } = await params;
  if (!isShortId(shortId)) {
    return { title: `Tier list — ${SITE_NAME}` };
  }
  const payload = await getTierList(shortId);
  if (!payload) {
    return { title: `Tier list — ${SITE_NAME}` };
  }
  const hash = stateHash({
    title: payload.title,
    tiers: payload.tiers,
    unrankedItems: payload.unrankedItems,
  });
  const ogUrl = absoluteUrl(
    `/api/og/tier-list?id=${shortId}&aspect=h&v=${hash}`,
  );
  const description = payload.description
    ? payload.description
    : `${payload.title} — tier list built on TrendingRepo.`;
  return {
    title: `${payload.title} — ${SITE_NAME}`,
    description,
    alternates: {
      canonical: absoluteUrl(`/tierlist/${shortId}`),
    },
    openGraph: {
      title: payload.title,
      description,
      url: absoluteUrl(`/tierlist/${shortId}`),
      images: [{ url: ogUrl, width: 1200, height: 675 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: payload.title,
      description,
      images: [ogUrl],
    },
  };
}

export default async function SavedTierListPage({ params }: Params) {
  const { shortId } = await params;
  if (!isShortId(shortId)) notFound();
  const payload = await getTierList(shortId);
  if (!payload) notFound();

  const allItemIds = [
    ...payload.unrankedItems,
    ...payload.tiers.flatMap((tier) => tier.items),
  ];
  const itemMeta = buildItemMeta(allItemIds);

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#151419" }}>
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

// ---------------------------------------------------------------------------
// Remix banner — shown at the top of any saved-list page so the visitor can
// fork the list into a fresh editable draft. Hitting Save & Share on the
// remix produces a NEW shortId (the original is never overwritten — POST
// always creates).
// ---------------------------------------------------------------------------

function RemixBanner({ payload }: { payload: TierListPayload }) {
  const remixHref = `/tierlist?${encodeTierListUrl({
    title: `${payload.title} — remix`,
    tiers: payload.tiers,
    unrankedItems: payload.unrankedItems,
  }).toString()}`;
  const author = payload.ownerHandle
    ? `@${payload.ownerHandle}`
    : "an anonymous author";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 24px",
        borderBottom: "1px solid #2B2B2F",
        backgroundColor: "#13161a",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        color: "#aab0b6",
        letterSpacing: "0.04em",
      }}
    >
      <span>
        {"// "}viewing tier list{" "}
        <span style={{ color: "#FBFBFB" }}>{payload.shortId}</span>
        {" · made by "}
        <span style={{ color: "#FBFBFB" }}>{author}</span>
      </span>
      <a
        href={remixHref}
        style={{
          padding: "6px 12px",
          border: "1px solid #272c33",
          borderRadius: 3,
          backgroundColor: "#1b1b1e",
          color: "#FBFBFB",
          textDecoration: "none",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          fontSize: 11,
        }}
      >
        ↻ Remix
      </a>
    </div>
  );
}
