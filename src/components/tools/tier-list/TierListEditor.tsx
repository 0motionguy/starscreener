"use client";

// TierListEditor — top-level client orchestrator for /tools/tier-list and
// /tierlist (share-URL surface).
//
// 2026-05-24 rebuild brief from Mirko: "tier-list is broken, no clarity for
// where to select repos or LLMs, templates aren't present, share has to be
// presentable for live streams." This rebuild restructures the editor into
// a numbered three-step workflow (SEARCH · TEMPLATES · RANK) with a fixed
// right-rail share panel on desktop. The Zustand store and dnd-kit wiring
// underneath are untouched — only the chrome moves.
//
// Layout (≥1100px):
//   ┌──────────────────────────────────────────┬──────────────┐
//   │ editor panel (1fr)                       │ rail (340px) │
//   │   ▸ head: eyebrow · meta · Share PNG     │   ShareBar   │
//   │   ▸ title input + tagline                │   Hint       │
//   │   ▸ stage: 01 search │ 02 templates      │              │
//   │   ▸ rank bar: 03 rank · +row · reset     │              │
//   │   ▸ TierBoard (S→F rows + pool)          │              │
//   └──────────────────────────────────────────┴──────────────┘
// Below 1100px the rail moves under the editor as a full-width strip.
//
// Visual contract: docs/DESIGN-SYSTEM.md §6 atmosphere, §7 primitives,
// §8 icons. All shell.css classes prefixed `.tier-*` live in the tier-list
// block of public/shell.css.

import { useState } from "react";

import { Icon } from "@/lib/icons";
import {
  useTierListEditor,
  type PoolItem,
} from "@/lib/tier-list/client-store";
import { decodeTierListUrl } from "@/lib/tier-list/url";
import type { TierRow } from "@/lib/types/tier-list";

// Module-level guard so React 19 strict-mode's double-invoke of the lazy
// init doesn't trigger two `hydrate(initial)` calls (each is a Zustand
// `set()`, so the second one would clobber any user edits made between
// the first init and the strict-mode second pass). Keyed by reference;
// the value is unused.
const HYDRATED_INITIALS = new WeakSet<object>();

import { MobileTierPicker } from "./MobileTierPicker";
import { RepoSearchBox } from "./RepoSearchBox";
import { ShareBar } from "./ShareBar";
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
  // ──────────────────────────────────────────────────────────────────────
  // Synchronous store hydration. MUST run before any selector reads, so
  // ShareBar's `useMemo(() => composeTierShareText(...))` sees the saved
  // tiers on its very first invocation (not the empty defaults).
  //
  // Why useState's lazy init?
  //   - It fires synchronously during the first render, before any code
  //     below it executes — including the selector reads on the next lines.
  //   - Zustand's `set()` is synchronous, so by the time those selectors
  //     run, the store already contains the saved payload.
  //   - The module-level WeakSet guard makes the init idempotent across
  //     React 19 strict-mode's double-invoke (re-entrant render of the
  //     same component with the same `initial` reference) without
  //     clobbering user edits.
  //   - Going through `.getState().hydrate()` instead of subscribing via
  //     `useTierListEditor((s) => s.hydrate)` avoids a phantom dependency
  //     that would re-evaluate when the store updates.
  //
  // The previous useEffect-based hydration painted once with empty tiers
  // before the saved payload arrived — that race caused the X intent URL
  // to be baked with a title-only shareText for saved boards (see the
  // 2026-05-25 "tier summary missing from tweet" bug).
  // ──────────────────────────────────────────────────────────────────────
  useState(() => {
    if (initial) {
      if (!HYDRATED_INITIALS.has(initial)) {
        HYDRATED_INITIALS.add(initial);
        useTierListEditor.getState().hydrate(initial);
      }
      return null;
    }
    if (typeof window !== "undefined" && window.location.search.length > 1) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tiers")) {
        const decoded = decodeTierListUrl(params);
        useTierListEditor.getState().hydrate({
          title: decoded.title,
          tiers: decoded.tiers,
          unrankedItems: decoded.unrankedItems,
        });
      }
    }
    return null;
  });

  const title = useTierListEditor((s) => s.title);
  const setTitle = useTierListEditor((s) => s.setTitle);
  const resetAll = useTierListEditor((s) => s.resetAll);
  const tiers = useTierListEditor((s) => s.tiers);
  const unrankedCount = useTierListEditor((s) => s.unrankedItems.length);
  const addTier = useTierListEditor((s) => s.addTier);

  const rankedCount = tiers.reduce((sum, t) => sum + t.items.length, 0);
  const totalCount = unrankedCount + rankedCount;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="tier-workbench">
      <section className="panel tier-editor-panel">
        <header className="tier-editor-head">
          <div className="tier-editor-head-info">
            <span className="tier-editor-eyebrow">
              {"// TIER LIST · BUILDER"}
            </span>
            <span className="tier-editor-head-meta">
              {today} · <span className="num">{totalCount}</span> repos ·{" "}
              <span className="num">{rankedCount}</span> ranked
            </span>
          </div>
          <div className="tier-editor-head-cta">
            <TopSharePngButton />
          </div>
        </header>

        <div className="tier-title-shell">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            aria-label="Tier list title"
            placeholder="Untitled tier list"
            className="tier-title-input"
          />
          <span className="tier-title-meta">
            classic S to F · drag and drop · share-ready
          </span>
        </div>

        <section className="tier-stage tier-stage--solo">
          <header className="tier-step-head">
            <div className="tier-step-titles">
              <h2 className="tier-step-title">Add a repo</h2>
              <p className="tier-step-sub">
                Type a name or <span className="num">owner/repo</span> — it
                lands in the unranked pool below, ready to drag onto a tier.
              </p>
            </div>
          </header>
          <RepoSearchBox />
        </section>

        <div className="tier-rank-bar">
          <div className="tier-rank-bar-step">
            <span className="tier-rank-bar-copy">
              Drag onto <b>S–F</b> · double-click a letter to rename · tap the{" "}
              <Icon
                name="more-horizontal"
                size="xs"
                style={{ verticalAlign: "-1px" }}
              />{" "}
              dot to recolor a row
            </span>
          </div>
          <div className="tier-rank-bar-actions">
            <button
              type="button"
              onClick={addTier}
              className="btn ghost tier-rank-bar-btn"
              aria-label="Add a tier row"
            >
              <Icon name="plus" size="sm" />
              <span>Add row</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Clear the whole list?")) resetAll();
              }}
              className="btn ghost tier-rank-bar-btn"
              aria-label="Reset everything"
            >
              <Icon name="refresh" size="sm" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        <TierBoard />
      </section>

      <aside className="tier-side">
        <ShareBar />
        <Hint />
      </aside>

      <MobileTierPicker />
    </div>
  );
}

function Hint() {
  return (
    <section className="panel tier-hint">
      <header className="panel-head">
        <span className="tier-editor-eyebrow">{"// HOW IT WORKS"}</span>
      </header>
      <ol className="tier-hint-list">
        <li>
          <span className="tier-hint-num">01</span>
          <span>Search any repo to add it to the unranked pool.</span>
        </li>
        <li>
          <span className="tier-hint-num">02</span>
          <span>Drag each card onto S, A, B, C, D, E, or F.</span>
        </li>
        <li>
          <span className="tier-hint-num">03</span>
          <span>Rename rows, change colors, add new tiers.</span>
        </li>
        <li>
          <span className="tier-hint-num">04</span>
          <span>Hit Save &amp; share for a permalink + branded PNG.</span>
        </li>
      </ol>
    </section>
  );
}
