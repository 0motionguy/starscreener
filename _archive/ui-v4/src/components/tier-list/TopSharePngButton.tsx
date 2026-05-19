"use client";

// TopSharePngButton - primary CTA in the editor toolbar.

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
      className="ico-btn acc"
    >
      <Download size={12} aria-hidden />
      <span>Share PNG</span>
    </a>
  );
}

function encodeUnsavedState(draft: TierListDraft): string {
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
