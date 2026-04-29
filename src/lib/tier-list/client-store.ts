"use client";

// TrendingRepo — Tier List editor Zustand store
//
// In-memory state for the /tierlist editor. URL state is the source of truth
// for navigation/sharing; this store is the runtime cache that the editor
// mutates between encodes. Hydrated once at mount from `decodeTierListUrl()`.

import { create } from "zustand";

import {
  DEFAULT_TIERS,
  MAX_ITEMS_PER_TIER,
  MAX_ITEMS_TOTAL,
  MAX_TIERS,
  MIN_TIERS,
  TIER_COLORS,
  type TierColor,
} from "@/lib/tier-list/constants";
import type { TierRow } from "@/lib/types/tier-list";

export interface PoolItem {
  /** owner/name */
  repoId: string;
  /** Avatar URL (from /api/search response). Optional — monogram fallback otherwise. */
  avatarUrl?: string;
  /** Display name (e.g. "next.js") */
  displayName: string;
  /** Owner ("vercel") */
  owner: string;
}

export interface TierListEditorState {
  title: string;
  tiers: TierRow[];
  /** Repo full names not yet placed in any tier. */
  unrankedItems: string[];
  /** Repo metadata cache for items currently referenced anywhere. */
  itemMeta: Record<string, PoolItem>;
  /** Save state: idle | saving | saved (with shortId) | error (with message). */
  saveState:
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved"; shortId: string }
    | { kind: "error"; message: string };
  /**
   * The repoId currently being placed via the mobile tap-to-place picker.
   * `null` means the picker is closed. The picker is the mobile alternative
   * to drag-drop (which is unreliable on touch).
   */
  pickerTarget: string | null;
}

export interface TierListEditorActions {
  hydrate: (input: {
    title: string;
    tiers: TierRow[];
    unrankedItems: string[];
    itemMeta?: Record<string, PoolItem>;
  }) => void;
  setTitle: (title: string) => void;
  addToPool: (item: PoolItem) => void;
  /**
   * Move a repoId to a target location. Pass `null` for the unranked pool, or
   * a tier id to drop into that tier.
   */
  moveItem: (repoId: string, target: { tierId: string } | "pool") => void;
  removeItem: (repoId: string) => void;
  resetAll: () => void;
  setSaveState: (s: TierListEditorState["saveState"]) => void;
  setTierColor: (tierId: string, color: TierColor) => void;
  setTierLabel: (tierId: string, label: string) => void;
  addTier: () => void;
  removeTier: (tierId: string) => void;
  openPicker: (repoId: string) => void;
  closePicker: () => void;
}

const emptyTiers = (): TierRow[] =>
  DEFAULT_TIERS.map((t) => ({ ...t, items: [] }));

function totalItemCount(state: TierListEditorState): number {
  let n = state.unrankedItems.length;
  for (const tier of state.tiers) n += tier.items.length;
  return n;
}

function stripFromAll(state: TierListEditorState, repoId: string): {
  tiers: TierRow[];
  unrankedItems: string[];
} {
  return {
    tiers: state.tiers.map((tier) =>
      tier.items.includes(repoId)
        ? { ...tier, items: tier.items.filter((id) => id !== repoId) }
        : tier,
    ),
    unrankedItems: state.unrankedItems.filter((id) => id !== repoId),
  };
}

export const useTierListEditor = create<
  TierListEditorState & TierListEditorActions
>((set, get) => ({
  title: `Tier list · ${new Date().toISOString().slice(0, 10)}`,
  tiers: emptyTiers(),
  unrankedItems: [],
  itemMeta: {},
  saveState: { kind: "idle" },
  pickerTarget: null,

  hydrate(input) {
    set({
      title: input.title,
      tiers: input.tiers,
      unrankedItems: input.unrankedItems,
      itemMeta: input.itemMeta ?? get().itemMeta,
      saveState: { kind: "idle" },
    });
  },

  setTitle(title) {
    set({ title, saveState: { kind: "idle" } });
  },

  addToPool(item) {
    const state = get();
    if (totalItemCount(state) >= MAX_ITEMS_TOTAL) return;
    const exists =
      state.unrankedItems.includes(item.repoId) ||
      state.tiers.some((tier) => tier.items.includes(item.repoId));
    if (exists) return;
    set({
      unrankedItems: [...state.unrankedItems, item.repoId],
      itemMeta: { ...state.itemMeta, [item.repoId]: item },
      saveState: { kind: "idle" },
    });
  },

  moveItem(repoId, target) {
    const state = get();
    const stripped = stripFromAll(state, repoId);
    if (target === "pool") {
      set({
        ...stripped,
        unrankedItems: [...stripped.unrankedItems, repoId],
        saveState: { kind: "idle" },
      });
      return;
    }
    const targetIdx = stripped.tiers.findIndex((t) => t.id === target.tierId);
    if (targetIdx < 0) return;
    const targetTier = stripped.tiers[targetIdx];
    if (targetTier.items.length >= MAX_ITEMS_PER_TIER) return;
    const nextTiers = stripped.tiers.map((tier, i) =>
      i === targetIdx ? { ...tier, items: [...tier.items, repoId] } : tier,
    );
    set({
      tiers: nextTiers,
      unrankedItems: stripped.unrankedItems,
      saveState: { kind: "idle" },
    });
  },

  removeItem(repoId) {
    const state = get();
    const stripped = stripFromAll(state, repoId);
    const nextMeta = { ...state.itemMeta };
    delete nextMeta[repoId];
    set({
      ...stripped,
      itemMeta: nextMeta,
      saveState: { kind: "idle" },
    });
  },

  resetAll() {
    set({
      tiers: emptyTiers(),
      unrankedItems: [],
      itemMeta: {},
      saveState: { kind: "idle" },
    });
  },

  setSaveState(saveState) {
    set({ saveState });
  },

  setTierColor(tierId, color) {
    set((state) => ({
      tiers: state.tiers.map((tier) =>
        tier.id === tierId ? { ...tier, color } : tier,
      ),
      saveState: { kind: "idle" },
    }));
  },

  setTierLabel(tierId, label) {
    set((state) => ({
      tiers: state.tiers.map((tier) =>
        tier.id === tierId ? { ...tier, label } : tier,
      ),
      saveState: { kind: "idle" },
    }));
  },

  addTier() {
    set((state) => {
      if (state.tiers.length >= MAX_TIERS) return state;
      // Pick a fresh tier id ("T1", "T2", ...) that doesn't collide.
      let suffix = state.tiers.length + 1;
      let id = `T${suffix}`;
      const existing = new Set(state.tiers.map((t) => t.id));
      while (existing.has(id)) {
        suffix += 1;
        id = `T${suffix}`;
      }
      // Cycle through TIER_COLORS so the new row has a distinct swatch.
      const color = TIER_COLORS[state.tiers.length % TIER_COLORS.length];
      return {
        tiers: [
          ...state.tiers,
          { id, label: `T${suffix}`, color, items: [] },
        ],
        saveState: { kind: "idle" },
      };
    });
  },

  removeTier(tierId) {
    set((state) => {
      if (state.tiers.length <= MIN_TIERS) return state;
      const target = state.tiers.find((t) => t.id === tierId);
      if (!target) return state;
      // Move the removed tier's items back to the unranked pool so we don't
      // silently delete user content.
      return {
        tiers: state.tiers.filter((t) => t.id !== tierId),
        unrankedItems: [...state.unrankedItems, ...target.items],
        saveState: { kind: "idle" },
      };
    });
  },
}));
