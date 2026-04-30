"use client";

// TierListEditor — top-level client orchestrator for /tierlist.
//
// - Hydrates the Zustand store on mount from URL state (or the props seed).
// - Hosts the title input, search box, drag-drop board, and share bar.

import { useEffect, useRef } from "react";

import { useTierListEditor, type PoolItem } from "@/lib/tier-list/client-store";
import { decodeTierListUrl } from "@/lib/tier-list/url";
import type { TierRow } from "@/lib/types/tier-list";

import { MobileTierPicker } from "./MobileTierPicker";
import { RepoSearchBox } from "./RepoSearchBox";
import { ShareBar } from "./ShareBar";
import { TemplatePicker } from "./TemplatePicker";
import { TierBoard } from "./TierBoard";
import { TopSharePngButton } from "./TopSharePngButton";

export interface TierListEditorProps {
  initial?: {
    title: string;
    tiers: TierRow[];
    unrankedItems: string[];
    itemMeta?: Record<string, PoolItem>;
  };
}

export function TierListEditor({ initial }: TierListEditorProps) {
  const hydrate = useTierListEditor((s) => s.hydrate);
  const title = useTierListEditor((s) => s.title);
  const setTitle = useTierListEditor((s) => s.setTitle);
  const resetAll = useTierListEditor((s) => s.resetAll);
  const tiers = useTierListEditor((s) => s.tiers);
  const unrankedCount = useTierListEditor((s) => s.unrankedItems.length);
  const addTier = useTierListEditor((s) => s.addTier);
  const hydratedRef = useRef(false);

  const totalCount =
    unrankedCount + tiers.reduce((sum, t) => sum + t.items.length, 0);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (initial) {
      hydrate(initial);
      return;
    }
    if (typeof window !== "undefined" && window.location.search.length > 1) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tiers")) {
        const decoded = decodeTierListUrl(params);
        hydrate({
          title: decoded.title,
          tiers: decoded.tiers,
          unrankedItems: decoded.unrankedItems,
        });
      }
    }
  }, [hydrate, initial]);

  return (
    <div
      // Single column on mobile (<768px) so the right rail (Share /
      // Templates / Hint) stacks below the main editor instead of squeezing
      // the tier grid. Two-column at md+ keeps the desktop layout we had.
      className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px] gap-4 md:gap-6 p-4 md:p-6 mx-auto max-w-[1280px] text-text-primary font-sans"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Top header row — info-line on the left, static "share-ready" meta
            on the right. Mirrors the meme-format reference. */}
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono uppercase tracking-[0.06em] text-[12px] text-text-tertiary">
          <span>
            {`// 01 · TIER LIST · ${totalCount} REPOS · ${today}`}
          </span>
          <span className="text-text-muted">
            CLASSIC S → F · DRAG & DROP · SHARE-READY
          </span>
        </div>
        {/* Title + secondary toolbar (reset / + add row / share png). */}
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            aria-label="Tier list title"
            style={{
              width: "100%",
              padding: "4px 0",
              fontSize: 32,
              fontWeight: 800,
              backgroundColor: "transparent",
              border: "none",
              borderBottom: "1px solid #2B2B2F",
              color: "#FBFBFB",
              outline: "none",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addTier}
              className="inline-flex items-center gap-1 rounded-[3px] border border-border-primary bg-bg-secondary px-2.5 py-1 font-mono uppercase tracking-[0.14em] text-[11px] text-text-secondary hover:bg-bg-tertiary hover:text-text-primary cursor-pointer"
            >
              + add row
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Clear the whole list?")) resetAll();
              }}
              className="inline-flex items-center gap-1 rounded-[3px] border border-border-primary bg-bg-secondary px-2.5 py-1 font-mono uppercase tracking-[0.14em] text-[11px] text-text-secondary hover:bg-bg-tertiary hover:text-text-primary cursor-pointer"
            >
              reset
            </button>
            <span className="flex-1" />
            <TopSharePngButton />
          </div>
        </div>
        <RepoSearchBox />
        <TemplatePicker />
        <TierBoard />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ShareBar />
        <Hint />
      </div>
      {/* Modal — only renders when pickerTarget !== null. Mobile-only path
          but cheap enough to mount at the editor root regardless. */}
      <MobileTierPicker />
    </div>
  );
}

function Hint() {
  return (
    <div
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        color: "#5A5A5C",
        lineHeight: 1.7,
        padding: 12,
        border: "1px dashed #2B2B2F",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          marginBottom: 6,
          color: "#878787",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {"// how it works"}
      </div>
      1. search repos to add to the unranked pool
      <br />
      2. drag onto a tier — or use the &quot;→ tier&quot; dropdown
      <br />
      3. rename tiers / pick new colors via the swatch
      <br />
      4. hit Save &amp; Share when you&apos;re happy
    </div>
  );
}
