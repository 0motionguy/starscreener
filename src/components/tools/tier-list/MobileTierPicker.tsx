"use client";

// MobileTierPicker — tap-to-place bottom sheet for the tier-list editor.
//
// Long-press-to-drag is the documented mobile UX failure mode (NN/g, etc.):
// users miss the activation, drop unintentionally, or give up. Instead, on
// touch viewports each cell is a tap-button that opens this sheet. The user
// taps a tier (or "unranked") and the item lands there.
//
// Patterned after src/components/layout/MobileDrawer.tsx:
//   - CSS-only backdrop/sheet transition (220ms, eased)
//   - prefers-reduced-motion bypass
//   - Escape to close + body scroll lock
//   - role="dialog" aria-modal="true"
//
// Restored from audit/imp-wave-10c-tierlist into the tools subtree. The
// previous file mixed Tailwind-arbitrary-hex utilities with bg-border-primary
// utilities that no longer exist in the v6 shell; this version uses canonical
// design tokens via `var(--*)` and the `<Icon>` registry.

import { useEffect, useState } from "react";

import { Icon } from "@/lib/icons";
import {
  MAX_ITEMS_PER_TIER,
  MAX_ITEMS_TOTAL,
} from "@/lib/tier-list/constants";
import { useTierListEditor } from "@/lib/tier-list/client-store";

import { Avatar } from "./Avatar";

const PICKER_TRANSITION_MS = 220;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function MobileTierPicker() {
  const pickerTarget = useTierListEditor((s) => s.pickerTarget);
  const closePicker = useTierListEditor((s) => s.closePicker);
  const moveItem = useTierListEditor((s) => s.moveItem);
  const removeItem = useTierListEditor((s) => s.removeItem);
  const tiers = useTierListEditor((s) => s.tiers);
  const itemMeta = useTierListEditor((s) => s.itemMeta);
  const unrankedCount = useTierListEditor((s) => s.unrankedItems.length);
  const [renderedTarget, setRenderedTarget] = useState<string | null>(null);
  const [isPresented, setIsPresented] = useState(false);

  const open = pickerTarget !== null;
  const activeTarget = pickerTarget ?? renderedTarget;
  const shouldRender = activeTarget !== null;
  const meta = activeTarget ? itemMeta[activeTarget] : null;

  useEffect(() => {
    let enterFrame = 0;
    let exitTimer = 0;

    if (pickerTarget) {
      setRenderedTarget(pickerTarget);
      if (prefersReducedMotion()) {
        setIsPresented(true);
        return;
      }
      setIsPresented(false);
      enterFrame = window.requestAnimationFrame(() => {
        setIsPresented(true);
      });
      return () => {
        if (enterFrame) window.cancelAnimationFrame(enterFrame);
      };
    }

    if (renderedTarget) {
      setIsPresented(false);
      const delay = prefersReducedMotion() ? 0 : PICKER_TRANSITION_MS;
      if (delay === 0) {
        setRenderedTarget(null);
        return;
      }
      exitTimer = window.setTimeout(() => {
        setRenderedTarget(null);
      }, delay);
      return () => {
        if (exitTimer) window.clearTimeout(exitTimer);
      };
    }
  }, [pickerTarget, renderedTarget]);

  // Escape to close + body scroll lock — same pattern as MobileDrawer.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePicker();
    };
    document.addEventListener("keydown", handler);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, closePicker]);

  function placeIn(target: { tierId: string } | "pool") {
    if (!pickerTarget) return;
    moveItem(pickerTarget, target);
    closePicker();
  }

  function removeFromList() {
    if (!pickerTarget) return;
    removeItem(pickerTarget);
    closePicker();
  }

  return shouldRender ? (
    <>
      <div
        className={`tier-picker-scrim${isPresented ? " is-open" : ""}`}
        onClick={closePicker}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Place ${activeTarget ?? "item"} into a tier`}
        className={`tier-picker-sheet${isPresented ? " is-open" : ""}`}
      >
        <Header onClose={closePicker} />
        {meta ? (
          <ItemPreview repoId={meta.repoId} avatarUrl={meta.avatarUrl} />
        ) : activeTarget ? (
          <ItemPreview repoId={activeTarget} />
        ) : null}
        <TierGrid
          tiers={tiers}
          onPick={(tierId) => placeIn({ tierId })}
        />
        <Footer
          unrankedCount={unrankedCount}
          onPlaceInPool={() => placeIn("pool")}
          onRemove={removeFromList}
        />
      </aside>
    </>
  ) : null;
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="tier-picker-head">
      <span className="tier-picker-eyebrow">{"// PLACE · MOBILE"}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close picker"
        className="tier-picker-close"
      >
        <Icon name="x-circle" size="md" />
      </button>
    </div>
  );
}

function ItemPreview({
  repoId,
  avatarUrl,
}: {
  repoId: string;
  avatarUrl?: string;
}) {
  return (
    <div className="tier-picker-preview">
      <Avatar repoId={repoId} avatarUrl={avatarUrl} size={40} rounded={4} />
      <div className="tier-picker-preview-meta">
        <span className="tier-picker-preview-name">{repoId}</span>
        <span className="tier-picker-preview-hint">tap a tier to place</span>
      </div>
    </div>
  );
}

function TierGrid({
  tiers,
  onPick,
}: {
  tiers: Array<{ id: string; label: string; color: string; items: string[] }>;
  onPick: (tierId: string) => void;
}) {
  return (
    <div className="tier-picker-grid">
      {tiers.map((tier) => {
        const full = tier.items.length >= MAX_ITEMS_PER_TIER;
        return (
          <button
            key={tier.id}
            type="button"
            onClick={() => onPick(tier.id)}
            disabled={full}
            className="tier-picker-cell"
          >
            <span
              className="tier-picker-cell-letter"
              style={{ backgroundColor: tier.color }}
              aria-hidden
            >
              {tier.label.slice(0, 3).toUpperCase()}
            </span>
            <div className="tier-picker-cell-meta">
              <span className="tier-picker-cell-label">{tier.label}</span>
              <span className="tier-picker-cell-count">
                {tier.items.length}/{MAX_ITEMS_PER_TIER}
                {full ? " · full" : ""}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Footer({
  unrankedCount,
  onPlaceInPool,
  onRemove,
}: {
  unrankedCount: number;
  onPlaceInPool: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="tier-picker-foot">
      <button
        type="button"
        onClick={onPlaceInPool}
        className="tier-picker-foot-btn"
      >
        ↺ unranked ({unrankedCount}/{MAX_ITEMS_TOTAL})
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="tier-picker-foot-btn is-danger"
      >
        × remove
      </button>
    </div>
  );
}
