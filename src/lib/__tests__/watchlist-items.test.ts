import assert from "node:assert/strict";
import test from "node:test";

import {
  watchlistItemFullName,
  watchlistItemHref,
} from "@/lib/watchlist-items";
import type { WatchlistItem } from "@/lib/types";

test("watchlist item keeps exact fullName for dotted repos", () => {
  const item: WatchlistItem = {
    repoId: "vercel--next-js",
    fullName: "vercel/next.js",
    addedAt: "2026-05-15T00:00:00.000Z",
    starsAtAdd: 139_000,
  };

  assert.equal(watchlistItemFullName(item), "vercel/next.js");
  assert.equal(watchlistItemHref(item), "/repo/vercel/next.js");
});

test("watchlist item falls back to legacy repoId when fullName is missing", () => {
  const item: WatchlistItem = {
    repoId: "owner--repo",
    addedAt: "2026-05-15T00:00:00.000Z",
    starsAtAdd: 42,
  };

  assert.equal(watchlistItemFullName(item), "owner/repo");
  assert.equal(watchlistItemHref(item), "/repo/owner/repo");
});
