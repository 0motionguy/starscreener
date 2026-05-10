// Drizzle schema — `watchlists` + `watchlist_items` tables.
//
// Replaces the JSONL-backed pro-tier store at
// `src/lib/watchlist/private-store.ts` with a relational model so the alert
// engine can JOIN against watched items per-user. The legacy localStorage
// Zustand store at `src/lib/store.ts` continues to work for anonymous
// users; signed-in watchlists live in the relational tables below.
//
// Cap: max 1000 repos per user (matches private-store.MAX_PRIVATE_WATCHLIST_REPOS).
// Enforced at insert time, not by schema constraint, so admins can hot-fix.

import {
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { tr } from "./_schema";
import { profiles } from "./profiles";

export const watchlists = tr.table(
  "watchlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Default"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("watchlists_profile_idx").on(t.profileId),
  ],
);

export const watchlistItems = tr.table(
  "watchlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    watchlistId: uuid("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    repoFullName: text("repo_full_name").notNull(), // 'vercel/next.js'
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    starsAtAdd: text("stars_at_add"), // string-encoded so very-large numbers are safe
  },
  (t) => [
    // A repo appears at most once per watchlist.
    uniqueIndex("watchlist_items_uniq").on(t.watchlistId, t.repoFullName),
    // Fast lookup: "which watchlists track this repo?" — used by the alert
    // event router to fan out a single trigger to every matching user.
    index("watchlist_items_repo_idx").on(t.repoFullName),
  ],
);

export type Watchlist = typeof watchlists.$inferSelect;
export type NewWatchlist = typeof watchlists.$inferInsert;
export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type NewWatchlistItem = typeof watchlistItems.$inferInsert;
