"use client";

// TrendingRepo — Tier List ShareBar.
//
// Visual language matches the Star Activity ShareBar at
// `src/components/share/ShareBar.tsx` (same Tailwind tokens, lucide icons,
// BUTTON_BASE pattern, sonner toasts) so the two read as one component
// family. The actions diverge — tier list owns a primary "Save & Share"
// (POST /api/tier-lists), three card-aspect downloads, and a tier-list
// embed snippet set instead of CSV / SVG.
//
// A future generalization wave can extract the shared chrome (button base,
// EmbedPanel) into `src/components/share/primitives.tsx` and have both
// surfaces consume it; in the meantime the markup is a deliberate parallel.

import { useState } from "react";
import {
  Code,
  Copy,
  Download,
  Link as LinkIcon,
  Share2,
} from "lucide-react";

import { useTierListEditor } from "@/lib/tier-list/client-store";
import { toast } from "@/lib/toast";
import { stateHash } from "@/lib/tier-list/url";
import { buildShareToXUrl } from "@/lib/twitter/outbound/share";
import { cn } from "@/lib/utils";
import type { TierListDraft } from "@/lib/types/tier-list";

interface CreateResponse {
  ok: boolean;
  shortId?: string;
  shareUrl?: string;
  ogUrl?: string;
  error?: string;
}

const BUTTON_BASE =
  "inline-flex items-center gap-1.5 rounded-[3px] border border-border-primary bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary font-mono uppercase tracking-[0.14em] transition-colors px-2.5 py-1.5 text-[11px]";

const ASPECTS = [
  { key: "h", label: "PNG · X (1200×675)" },
  { key: "v", label: "PNG · IG (1080×1350)" },
  { key: "yt", label: "PNG · YouTube (1280×720)" },
] as const;

export function ShareBar() {
  const title = useTierListEditor((s) => s.title);
  const tiers = useTierListEditor((s) => s.tiers);
  const unranked = useTierListEditor((s) => s.unrankedItems);
  const saveState = useTierListEditor((s) => s.saveState);
  const setSaveState = useTierListEditor((s) => s.setSaveState);
  const [embedOpen, setEmbedOpen] = useState(false);

  const draft: TierListDraft = {
    title,
    tiers,
    unrankedItems: unranked,
  };
  const hash = stateHash(draft);
  const savedShortId =
    saveState.kind === "saved" ? saveState.shortId : null;

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
        toast.error(data.error ?? "save failed");
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

  function ogUrlFor(aspect: "h" | "v" | "yt"): string {
    if (savedShortId) {
      return `/api/og/tier-list?id=${savedShortId}&aspect=${aspect}&v=${hash}`;
    }
    const state = encodeUnsavedState(draft);
    return `/api/og/tier-list?state=${state}&aspect=${aspect}&v=${hash}`;
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Could not copy — clipboard blocked");
    }
  }

  function copyLink() {
    const url = savedShortId
      ? `${window.location.origin}/tierlist/${savedShortId}`
      : window.location.href;
    void copyToClipboard(url, "Link copied to clipboard");
  }

  function shareOnX() {
    const url = savedShortId
      ? `${window.location.origin}/tierlist/${savedShortId}`
      : window.location.href;
    const intent = buildShareToXUrl({
      text: `${title} — built on @TrendingRepo`,
      url,
      via: ["TrendingRepo"],
    });
    window.open(intent, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-2 rounded-[3px] border border-border-primary bg-bg-secondary p-3">
      <div className="font-mono uppercase tracking-[0.14em] text-[11px] text-text-tertiary">
        {"// share"}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saveState.kind === "saving"}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-[3px] border border-transparent bg-brand text-bg-primary font-mono uppercase tracking-[0.14em] text-[12px] font-bold px-3 py-2 hover:bg-brand-hover transition-colors",
          saveState.kind === "saving" && "cursor-wait opacity-70",
        )}
      >
        <Share2 size={12} aria-hidden />
        {saveState.kind === "saving"
          ? "Saving…"
          : saveState.kind === "saved"
            ? `Saved · ${saveState.shortId}`
            : "Save & Share"}
      </button>
      {saveState.kind === "error" && (
        <div
          role="alert"
          className="font-mono text-[11px] text-down"
        >
          {saveState.message}
        </div>
      )}

      <div className="flex flex-col gap-1">
        {ASPECTS.map((a) => (
          <a
            key={a.key}
            href={ogUrlFor(a.key)}
            target="_blank"
            rel="noopener noreferrer"
            download={`tierlist-${savedShortId ?? "draft"}-${a.key}.png`}
            className={BUTTON_BASE}
          >
            <Download size={12} aria-hidden />
            <span>{a.label}</span>
          </a>
        ))}
      </div>

      <div className="flex gap-1">
        <button
          type="button"
          onClick={copyLink}
          className={cn(BUTTON_BASE, "flex-1 justify-center")}
        >
          <LinkIcon size={12} aria-hidden />
          <span>Link</span>
        </button>
        <button
          type="button"
          onClick={shareOnX}
          className={cn(BUTTON_BASE, "flex-1 justify-center")}
        >
          <Share2 size={12} aria-hidden />
          <span>Share on X</span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => setEmbedOpen((o) => !o)}
        aria-expanded={embedOpen}
        aria-controls="tierlist-embed-panel"
        className={cn(BUTTON_BASE, "justify-center")}
      >
        <Code size={12} aria-hidden />
        <span>Embed{embedOpen ? " ▴" : " ▾"}</span>
      </button>
      {embedOpen && (
        <EmbedPanel
          id="tierlist-embed-panel"
          draft={draft}
          savedShortId={savedShortId}
          hash={hash}
          onCopy={copyToClipboard}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmbedPanel — three snippet variants (markdown / html <img> / iframe).
// Layout mirrors src/components/share/ShareBar.tsx EmbedPanel/EmbedRow.
// ---------------------------------------------------------------------------

interface EmbedPanelProps {
  id: string;
  draft: TierListDraft;
  savedShortId: string | null;
  hash: string;
  onCopy: (text: string, label: string) => Promise<void>;
}

function EmbedPanel({
  id,
  draft,
  savedShortId,
  hash,
  onCopy,
}: EmbedPanelProps) {
  if (typeof window === "undefined") return null;
  const origin = window.location.origin;
  const ogPath = savedShortId
    ? `/api/og/tier-list?id=${savedShortId}&aspect=h&v=${hash}`
    : `/api/og/tier-list?state=${encodeUnsavedState(draft)}&aspect=h&v=${hash}`;
  const pagePath = savedShortId
    ? `/tierlist/${savedShortId}`
    : window.location.pathname + window.location.search;
  const safeTitle = draft.title.replace(/"/g, "'").replace(/\n/g, " ");

  const markdown = `[![${safeTitle}](${origin}${ogPath})](${origin}${pagePath})`;
  const htmlImg = `<a href="${origin}${pagePath}"><img src="${origin}${ogPath}" alt="${safeTitle}" width="1200" height="675" /></a>`;
  const sep = pagePath.includes("?") ? "&" : "?";
  const iframe = `<iframe src="${origin}${pagePath}${sep}embed=1" width="100%" height="600" style="border:0" loading="lazy" title="${safeTitle}"></iframe>`;

  return (
    <div
      id={id}
      className="rounded-[3px] border border-border-primary bg-bg-secondary p-3 text-[11px] font-mono"
    >
      <EmbedRow label="MD" value={markdown} onCopy={onCopy} />
      <EmbedRow label="IMG" value={htmlImg} onCopy={onCopy} />
      <EmbedRow label="IFRAME" value={iframe} onCopy={onCopy} />
    </div>
  );
}

interface EmbedRowProps {
  label: string;
  value: string;
  onCopy: (text: string, label: string) => Promise<void>;
}

function EmbedRow({ label, value, onCopy }: EmbedRowProps) {
  return (
    <div className="flex items-start gap-2 py-1.5 first:pt-0 last:pb-0">
      <span className="w-16 shrink-0 uppercase tracking-[0.14em] text-text-tertiary">
        {label}
      </span>
      <code className="flex-1 break-all text-text-secondary">{value}</code>
      <button
        type="button"
        onClick={() => void onCopy(value, `${label} snippet copied`)}
        className="shrink-0 inline-flex items-center justify-center rounded-[3px] border border-border-primary bg-bg-tertiary p-1 text-text-tertiary hover:text-text-primary"
        aria-label={`Copy ${label} snippet`}
      >
        <Copy size={11} aria-hidden />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encodeUnsavedState(draft: TierListDraft): string {
  // The OG endpoint accepts `state=<base64>` for unsaved drafts (see
  // src/app/api/og/tier-list/route.tsx). Send a payload-shape so the
  // server-side schema accepts it without forcing a save first.
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
