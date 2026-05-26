"use client";

// ShareBar — right-rail share surface for the tier-list editor.
//
// Restored from audit/imp-wave-10c-tierlist and migrated to the canonical
// <SharePanel> primitive (docs/DESIGN-SYSTEM.md §7 / SharePanel.tsx) so the
// tier-list, top-10, and star-history surfaces all read from the same
// component. The tier-list-specific concerns (save → /api/tier-lists, OG card
// presets, save-state callouts) stay here as the panel's behaviour layer.

import { useMemo, useState } from "react";

import { Icon } from "@/lib/icons";
import { SharePanel } from "@/components/share/SharePanel";
import { toast } from "@/lib/toast";
import { useTierListEditor } from "@/lib/tier-list/client-store";
import { composeTierShareText } from "@/lib/tier-list/share-text";
import { stateHash } from "@/lib/tier-list/url";
import type { TierListDraft } from "@/lib/types/tier-list";

// Hard-pinned production host — used for share URLs ONLY. Reasons:
//   - Twitter/Slack/iMessage crawlers cannot reach localhost or preview-only
//     hostnames. Any non-public URL = no card preview, full stop.
//   - `absoluteUrl()` from @/lib/seo respects NEXT_PUBLIC_APP_URL which
//     defaults to localhost in dev, defeating the whole point.
// The tier-list payload (when saved) lives in production Redis; the OG card
// endpoint at trendingrepo.com/api/og/tier-list will render it for crawlers.
// Unsaved drafts encode their state in the URL so the OG endpoint can render
// without a DB lookup.
const SHARE_ORIGIN = "https://trendingrepo.com";

interface CreateResponse {
  ok: boolean;
  shortId?: string;
  shareUrl?: string;
  ogUrl?: string;
  error?: string;
}

const SIZES = [
  { id: "h", label: "X POST", w: 1200, h: 675 },
  { id: "v", label: "STORY", w: 1080, h: 1350 },
  { id: "yt", label: "YOUTUBE", w: 1280, h: 720 },
] as const;

type SizeId = (typeof SIZES)[number]["id"];

export function ShareBar() {
  const title = useTierListEditor((s) => s.title);
  const tiers = useTierListEditor((s) => s.tiers);
  const unranked = useTierListEditor((s) => s.unrankedItems);
  const saveState = useTierListEditor((s) => s.saveState);
  const setSaveState = useTierListEditor((s) => s.setSaveState);
  const [activeSize, setActiveSize] = useState<SizeId>("h");

  const draft: TierListDraft = useMemo(
    () => ({ title, tiers, unrankedItems: unranked }),
    [title, tiers, unranked],
  );
  const hash = useMemo(() => stateHash(draft), [draft]);
  const savedShortId =
    saveState.kind === "saved" ? saveState.shortId : null;

  // SAVED → clean short URL (e.g. `/tierlist/N9PMMAT1`). Twitter unfurls
  //   the URL via the saved-view page's OG meta (which hits Redis).
  // UNSAVED → `/tools/tier-list?state=<base64>` with the full draft in
  //   the URL. Unavoidable: prod can't render a card for a list it's
  //   never seen, so the data has to travel in the URL itself. To get a
  //   short URL, hit "Save & share" first.
  //
  // The `/tierlist/[shortId]` page also accepts `?state=` as a fallback
  // (added in the 2026-05-25 share rewrite) — useful when sharing a
  // dev-only save by pasting `&state=…` manually, but not the default
  // because it bloats the visible link.
  const stateParam = useMemo(() => encodeUnsavedState(draft), [draft]);
  const permalink = savedShortId
    ? `${SHARE_ORIGIN}/tierlist/${savedShortId}`
    : `${SHARE_ORIGIN}/tools/tier-list?state=${stateParam}`;

  function ogUrlFor(aspect: SizeId): string {
    // PNG download/embed always uses `state` so the rendered image
    // reflects whatever's on the editor canvas RIGHT NOW (not the last
    // saved snapshot). This decouples export from save state.
    return `${SHARE_ORIGIN}/api/og/tier-list?state=${stateParam}&aspect=${aspect}&v=${hash}`;
  }

  // Compose the tweet body: title + per-tier summary, capped so the
  // composed text + URL + hashtags fit Twitter's 280-char budget.
  // Twitter shortens URLs to ~23 chars regardless of length, and the
  // builder also appends `#tag1 #tag2 via @TrendingRepo` (~32 chars),
  // so the body itself gets ~220 chars of headroom.
  const shareText = useMemo(
    () => composeTierShareText({ title, tiers }, 220),
    [title, tiers],
  );

  async function handleSave() {
    setSaveState({ kind: "saving" });
    try {
      const res = await fetch("/api/tier-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await res.json()) as CreateResponse;
      if (!res.ok || !data.ok || !data.shortId) {
        setSaveState({
          kind: "error",
          message: data.error ?? `save failed (${res.status})`,
        });
        toast.error(data.error ?? "Save failed");
        return;
      }
      setSaveState({ kind: "saved", shortId: data.shortId });
      window.history.replaceState(null, "", `/tierlist/${data.shortId}`);
      toast.success("Tier list saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "save failed";
      setSaveState({ kind: "error", message });
      toast.error(message);
    }
  }

  // The CTA flips between Save (when nothing is saved) and Download PNG
  // (after save, since download is the natural follow-up the moment the
  // short URL exists and the OG cache key is stable).
  const primaryCta = savedShortId
    ? {
        label: "Download PNG",
        icon: "download",
        href: ogUrlFor(activeSize),
        download: `tierlist-${savedShortId}-${activeSize}.png`,
      }
    : {
        label: saveState.kind === "saving" ? "Saving…" : "Save & share",
        icon: "share",
        onClick: handleSave,
        disabled: saveState.kind === "saving",
      };

  const statusLabel =
    saveState.kind === "saved"
      ? `Saved · ${saveState.shortId}`
      : saveState.kind === "saving"
        ? "Saving…"
        : saveState.kind === "error"
          ? "Save failed"
          : undefined;
  const statusTone: "live" | "warn" | "cold" =
    saveState.kind === "saved"
      ? "live"
      : saveState.kind === "error"
        ? "cold"
        : "warn";

  return (
    <>
      <SharePanel
        title="Share this tier list"
        variant="ranking"
        statusLabel={statusLabel}
        statusTone={statusTone}
        sizes={SIZES.map((s) => ({ ...s }))}
        activeSize={activeSize}
        onSelectSize={(id) => setActiveSize(id as SizeId)}
        primaryCta={primaryCta}
        shareUrl={permalink}
        shareText={shareText}
        hashtags={["tierlist", "github"]}
        copyLink
        postOnX
        permalink={permalink}
        steps={[
          { label: "Search repos", hint: "Type a name to add to the unranked pool" },
          { label: "Rank them", hint: "Drag onto S/A/B/C/D/E/F or use mobile picker" },
          { label: "Save & share", hint: "Publish a short link + branded PNG" },
        ]}
      />

      {saveState.kind === "error" ? (
        <div role="alert" className="tier-share-error">
          <Icon name="alert-triangle" size="sm" />
          <span>{saveState.message}</span>
        </div>
      ) : null}
    </>
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
