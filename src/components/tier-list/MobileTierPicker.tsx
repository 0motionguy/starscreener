"use client";

// MobileTierPicker — tap-to-place bottom sheet for the tier list editor.
//
// Long-press-to-drag is the documented mobile UX failure mode (NN/g, etc.):
// users miss the activation, drop unintentionally, or give up. Instead, on
// touch viewports each cell is a tap-button that opens this sheet. The user
// taps a tier (or "unranked") and the item lands there.
//
// Borrows directly from src/components/layout/MobileDrawer.tsx:
//   - AnimatePresence + Framer Motion slide
//   - useReducedMotion bypass for prefers-reduced-motion
//   - Escape-to-close + body scroll lock
//   - role="dialog" aria-modal="true"

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

import { Avatar } from "@/components/tier-list/Avatar";
import {
  MAX_ITEMS_PER_TIER,
  MAX_ITEMS_TOTAL,
} from "@/lib/tier-list/constants";
import { useTierListEditor } from "@/lib/tier-list/client-store";

export function MobileTierPicker() {
  const pickerTarget = useTierListEditor((s) => s.pickerTarget);
  const closePicker = useTierListEditor((s) => s.closePicker);
  const moveItem = useTierListEditor((s) => s.moveItem);
  const removeItem = useTierListEditor((s) => s.removeItem);
  const tiers = useTierListEditor((s) => s.tiers);
  const itemMeta = useTierListEditor((s) => s.itemMeta);
  const unrankedCount = useTierListEditor((s) => s.unrankedItems.length);
  const reduceMotion = useReducedMotion();

  const open = pickerTarget !== null;
  const meta = pickerTarget ? itemMeta[pickerTarget] : null;

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

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] as const };

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

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="picker-backdrop"
            className="fixed inset-0 bg-black/60 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={closePicker}
            aria-hidden="true"
          />
          <motion.aside
            key="picker-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Place ${pickerTarget ?? "item"} into a tier`}
            className="fixed inset-x-0 bottom-0 z-[80] flex flex-col rounded-t-[8px] border-t border-border-primary bg-bg-secondary"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={transition}
            style={{
              maxHeight: "85vh",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            <Header onClose={closePicker} />
            {meta ? (
              <ItemPreview repoId={meta.repoId} avatarUrl={meta.avatarUrl} />
            ) : pickerTarget ? (
              <ItemPreview repoId={pickerTarget} />
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
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-border-primary px-3 py-2">
      <span aria-hidden className="flex items-center gap-1.5">
        <span className="block w-1.5 h-1.5 rounded-full bg-brand" />
        <span className="block w-1.5 h-1.5 rounded-full bg-border-primary" />
        <span className="block w-1.5 h-1.5 rounded-full bg-border-primary" />
      </span>
      <span className="font-mono uppercase tracking-[0.14em] text-[11px] text-text-secondary flex-1 truncate">
        {"// PLACE · MOBILE"}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close picker"
        className="inline-flex items-center justify-center rounded-[3px] border border-border-primary bg-bg-tertiary p-1 text-text-tertiary hover:text-text-primary"
      >
        <X size={14} aria-hidden />
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
    <div className="flex items-center gap-3 border-b border-border-primary px-4 py-3">
      <Avatar repoId={repoId} avatarUrl={avatarUrl} size={40} />
      <div className="flex flex-col min-w-0">
        <span className="font-mono text-[13px] text-text-primary truncate">
          {repoId}
        </span>
        <span className="font-mono uppercase tracking-[0.14em] text-[10px] text-text-tertiary">
          tap a tier to place
        </span>
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
    <div className="grid grid-cols-2 gap-2 overflow-y-auto p-3">
      {tiers.map((tier) => {
        const full = tier.items.length >= MAX_ITEMS_PER_TIER;
        return (
          <button
            key={tier.id}
            type="button"
            onClick={() => onPick(tier.id)}
            disabled={full}
            className="flex items-center gap-3 rounded-[3px] border border-border-primary bg-bg-tertiary p-3 text-left transition-colors hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span
              className="flex items-center justify-center w-10 h-10 rounded-[3px] font-mono font-bold text-[18px] text-bg-primary flex-shrink-0"
              style={{ backgroundColor: tier.color }}
              aria-hidden
            >
              {tier.label.slice(0, 3).toUpperCase()}
            </span>
            <div className="flex flex-col min-w-0">
              <span className="font-mono uppercase tracking-[0.14em] text-[11px] text-text-secondary truncate">
                {tier.label}
              </span>
              <span className="font-mono text-[10px] text-text-tertiary">
                {tier.items.length}/{MAX_ITEMS_PER_TIER} items
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
    <div className="flex gap-2 border-t border-border-primary px-3 py-3">
      <button
        type="button"
        onClick={onPlaceInPool}
        className="flex-1 rounded-[3px] border border-border-primary bg-bg-tertiary px-3 py-2 font-mono uppercase tracking-[0.14em] text-[11px] text-text-secondary hover:text-text-primary"
      >
        ↺ unranked ({unrankedCount}/{MAX_ITEMS_TOTAL})
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-[3px] border border-border-primary bg-bg-tertiary px-3 py-2 font-mono uppercase tracking-[0.14em] text-[11px] text-[var(--v4-red)] hover:bg-down/10"
      >
        × remove
      </button>
    </div>
  );
}
