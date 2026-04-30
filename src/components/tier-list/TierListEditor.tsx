"use client";

// TierListEditor - top-level client orchestrator for /tierlist.
//
// Hydrates the Zustand store from URL state, then hosts the title input,
// search box, drag-drop board, and share/export controls.

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
    <div className="grid tier-workbench">
      <section className="panel col-9 tier-editor-panel">
        <div className="panel-head">
          <span className="corner"><i /><i /><i /></span>
          <span className="key">{"// Tier list"}</span>
          <span className="tier-head-meta">
            AI / {totalCount} repos / {today}
          </span>
          <span className="right">
            <TopSharePngButton />
          </span>
        </div>

        <div className="tier-title-shell">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            aria-label="Tier list title"
            className="tier-title-input"
          />
          <span className="tier-title-meta">
            classic S to F / drag and drop / share-ready
          </span>
        </div>

        <div className="tier-toolbar">
          <span className="lbl">Pool</span>
          <RepoSearchBox />
          <span className="lbl tier-template-label">Templates</span>
          <TemplatePicker />
          <div className="right">
            <button type="button" onClick={addTier} className="ico-btn">
              + Add row
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Clear the whole list?")) resetAll();
              }}
              className="ico-btn"
            >
              Reset
            </button>
          </div>
        </div>

        <TierBoard />
      </section>

      <aside className="col-3 tier-side">
        <ShareBar />
        <Hint />
      </aside>

      <MobileTierPicker />
    </div>
  );
}

function Hint() {
  return (
    <div className="panel tier-hint">
      <div className="panel-head">
        <span className="key">{"// How it works"}</span>
      </div>
      <div className="tier-hint-body">
        <div><b>1.</b><span>Search repos to add to the unranked pool.</span></div>
        <div><b>2.</b><span>Drag onto a tier, or use the mobile tier picker.</span></div>
        <div><b>3.</b><span>Rename tiers and pick new row colors.</span></div>
        <div><b>4.</b><span>Save, export PNG, copy link, or embed.</span></div>
      </div>
    </div>
  );
}
