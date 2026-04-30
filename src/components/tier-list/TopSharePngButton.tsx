"use client";

// TopSharePngButton — primary CTA in the editor toolbar.
//
// One-click download of the 1200×675 PNG (the X-friendly aspect). Falls
// back to the `state=<base64>` query when the list isn't saved yet so the
// download works even on a brand-new draft.
//
// The full ShareBar still lives in the right rail for the secondary actions
// (other aspects, copy link, embed snippets, save & share). This is just
// the headline action surfaced where the eye lands first.

import { Download } from "lucide-react";

import { useTierListEditor } from "@/lib/tier-list/client-store";
import { stateHash } from "@/lib/tier-list/url";
import type { TierListDraft } from "@/lib/types/tier-list";

export function TopSharePngButton() {
  const title = useTierListEditor((s) => s.title);
  const tiers = useTierListEditor((s) => s.tiers);
  const unranked = useTierListEditor((s) => s.unrankedItems);
  const saveState = useTierListEditor((s) => s.saveState);

  const draft: TierListDraft = { title, tiers, unrankedItems: unranked };
  const hash = stateHash(draft);
  const savedShortId =
    saveState.kind === "saved" ? saveState.shortId : null;

  const href = savedShortId
    ? `/api/og/tier-list?id=${savedShortId}&aspect=h&v=${hash}`
    : `/api/og/tier-list?state=${encodeUnsavedState(draft)}&aspect=h&v=${hash}`;

  return (
    <a
      href={href}
      download={`tierlist-${savedShortId ?? "draft"}-h.png`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-[3px] bg-brand text-bg-primary px-3 py-1.5 font-mono uppercase tracking-[0.14em] text-[11px] font-bold no-underline hover:bg-brand-hover transition-colors"
    >
      <Download size={12} aria-hidden />
      <span>↓ Share PNG</span>
    </a>
  );
}

function encodeUnsavedState(draft: TierListDraft): string {
  // Mirrors ShareBar's `encodeUnsavedState`. Send a payload-shape so the
  // server-side schema in /api/og/tier-list accepts it.
  const stateLike = {
    shortId: "DRAFT0AA",
    title: draft.title,
    tiers: draft.tiers,
    unrankedItems: draft.unrankedItems,
    ownerHandle: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewCount: 0,
    published: false,
  };
  if (typeof window === "undefined") return "";
  const json = JSON.stringify(stateLike);
  const utf8 = unescape(encodeURIComponent(json));
  return window
    .btoa(utf8)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
