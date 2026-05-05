"use client";

// TierListEditor - top-level client orchestrator for /tierlist.
//
// Hydrates the Zustand store from URL state, then hosts the title input,
// search box, drag-drop board, and share/export controls.

import Link from "next/link";
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

        {totalCount === 0 ? <TierListZeroState /> : null}
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

// AGN-1439 — branded 0-lists empty state.
//
// Renders ABOVE the (still-visible) TierBoard whenever the editor is
// fully empty (no pool items, no tier items). Operators land on
// /tierlist with no preset, so a blank board is the default first
// impression. This banner gives them three real one-click starts:
// Templates anchor (scrolls the TemplatePicker into view), the search
// box (focuses for repo lookup), and a Compare exit. Matches the
// SearchSuggestions pattern from AGN-608 (chip groups + monospace
// labels + ghost buttons) so the surface feels coherent.
function TierListZeroState() {
  const focusSearch = () => {
    if (typeof document === "undefined") return;
    const input = document.querySelector<HTMLInputElement>(
      ".tier-toolbar input[type='search'], .tier-toolbar input[type='text']",
    );
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const scrollToTemplates = () => {
    if (typeof document === "undefined") return;
    const label = document.querySelector(".tier-template-label");
    if (label) {
      label.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="tierlist-zero" role="status">
      <div className="tierlist-zero-head">
        <span className="tierlist-zero-eyebrow">{"// 00 — empty board"}</span>
        <h3>Your tier list is empty.</h3>
        <p>
          Pick a builder template, search the AI-repo index, or paste a shared
          link. Drag rows into S–F, rename tiers, then export the card.
        </p>
      </div>
      <div className="tierlist-zero-actions">
        <button
          type="button"
          onClick={scrollToTemplates}
          className="v2-btn v2-btn-primary"
        >
          Pick a template
        </button>
        <button
          type="button"
          onClick={focusSearch}
          className="v2-btn v2-btn-ghost"
        >
          Add your first repo
        </button>
        <Link href="/compare" className="v2-btn v2-btn-ghost">
          Compare instead
        </Link>
      </div>
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
