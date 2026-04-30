"use client";

// Tier list share/export controls.

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
import type { TierListDraft } from "@/lib/types/tier-list";

interface CreateResponse {
  ok: boolean;
  shortId?: string;
  shareUrl?: string;
  ogUrl?: string;
  error?: string;
}

const ASPECTS = [
  { key: "h", label: "PNG / X", detail: "1200 x 675" },
  { key: "v", label: "PNG / Instagram", detail: "1080 x 1350" },
  { key: "yt", label: "PNG / YouTube", detail: "1280 x 720" },
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
      toast.error("Could not copy - clipboard blocked");
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
      text: `${title} - built on @TrendingRepo`,
      url,
      via: ["TrendingRepo"],
    });
    window.open(intent, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="panel tier-share-panel">
      <div className="panel-head">
        <span className="corner"><i /><i /><i /></span>
        <span className="key">{"// Share"}</span>
        <span className="right">PNG / link / embed</span>
      </div>
      <div className="share-list">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveState.kind === "saving"}
          className="share-row share-row-primary"
        >
          <span className="ic"><Share2 size={13} aria-hidden /></span>
          <span className="body">
            <span className="h">
              {saveState.kind === "saving"
                ? "Saving..."
                : saveState.kind === "saved"
                  ? `Saved / ${saveState.shortId}`
                  : "Save and share"}
            </span>
            <span className="d">publish short link</span>
          </span>
          <span className="ar">-&gt;</span>
        </button>
        {saveState.kind === "error" && (
          <div role="alert" className="tier-share-error">
            {saveState.message}
          </div>
        )}

        {ASPECTS.map((a) => (
          <a
            key={a.key}
            href={ogUrlFor(a.key)}
            target="_blank"
            rel="noopener noreferrer"
            download={`tierlist-${savedShortId ?? "draft"}-${a.key}.png`}
            className="share-row"
          >
            <span className="ic"><Download size={13} aria-hidden /></span>
            <span className="body">
              <span className="h">{a.label}</span>
              <span className="d">{a.detail}</span>
            </span>
            <span className="ar">download</span>
          </a>
        ))}

        <button type="button" onClick={copyLink} className="share-row">
          <span className="ic"><LinkIcon size={13} aria-hidden /></span>
          <span className="body">
            <span className="h">Shareable link</span>
            <span className="d">copy current page url</span>
          </span>
          <span className="ar">copy</span>
        </button>
        <button type="button" onClick={shareOnX} className="share-row">
          <span className="ic"><Share2 size={13} aria-hidden /></span>
          <span className="body">
            <span className="h">Share on X</span>
            <span className="d">open outbound composer</span>
          </span>
          <span className="ar">open</span>
        </button>
        <button
          type="button"
          onClick={() => setEmbedOpen((o) => !o)}
          aria-expanded={embedOpen}
          aria-controls="tierlist-embed-panel"
          className="share-row"
        >
          <span className="ic"><Code size={13} aria-hidden /></span>
          <span className="body">
            <span className="h">Embed</span>
            <span className="d">markdown / image / iframe</span>
          </span>
          <span className="ar">{embedOpen ? "close" : "open"}</span>
        </button>
      </div>
      {embedOpen && (
        <EmbedPanel
          id="tierlist-embed-panel"
          draft={draft}
          savedShortId={savedShortId}
          hash={hash}
          onCopy={copyToClipboard}
        />
      )}
    </section>
  );
}

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
    <div id={id} className="tier-embed-panel">
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
    <div className="tier-embed-row">
      <span>{label}</span>
      <code>{value}</code>
      <button
        type="button"
        onClick={() => void onCopy(value, `${label} snippet copied`)}
        aria-label={`Copy ${label} snippet`}
      >
        <Copy size={11} aria-hidden />
      </button>
    </div>
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
