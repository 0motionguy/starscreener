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
  const hydratedRef = useRef(false);

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            color: "#878787",
            letterSpacing: "0.06em",
          }}
        >
          <span>{"// 01 · TIER LIST"}</span>
          <button
            type="button"
            onClick={() => {
              if (confirm("Clear the whole list?")) resetAll();
            }}
            style={{
              background: "transparent",
              color: "#878787",
              border: "1px solid #2B2B2F",
              borderRadius: 2,
              padding: "2px 8px",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            reset all
          </button>
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 80))}
          aria-label="Tier list title"
          style={{
            width: "100%",
            padding: "8px 0",
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
