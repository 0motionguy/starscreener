"use client";

// Client-side paginator that appends additional `MentionItem` rows under
// the server-rendered `RecentMentionsFeed`. Hits
// `/api/repos/[owner]/[name]/mentions?source=&cursor=&limit=` and walks
// the cursor the API hands back until `nextCursor === null`, at which
// point the button disappears permanently for the current tab.
//
// Tab-awareness:
//   - On the "all" tab, the parent passes `initialCursor` captured from
//     the SSR render — the button starts paging from that cursor.
//   - On any per-source tab, the parent rendered a locally-filtered slice
//     of the SSR payload, so its cursor isn't valid against the source-
//     filtered backend ordering. In that case the parent passes
//     `initialCursor={undefined}` and this component starts at page 1 of
//     the filtered endpoint (no cursor query param).
//   - The "ph" tab is not persisted in the MentionStore, so we render
//     null rather than wire a button that always 404s the user.

import { useCallback, useState } from "react";
import type { RepoMention } from "@/lib/pipeline/types";
import { MentionRow } from "./RecentMentionsFeed";
import {
  mentionTabToWirePlatform,
  toMentionItem,
  type MentionItem,
  type MentionTab,
} from "./MentionMeta";

/** Exact envelope returned by `GET /api/repos/[owner]/[name]/mentions`. */
interface MentionsApiEnvelope {
  ok: true;
  fetchedAt: string;
  repo: string;
  count: number;
  nextCursor: string | null;
  items: RepoMention[];
}

interface MentionsApiError {
  ok: false;
  error: string;
  code?: string;
}

interface MentionsLoadMoreProps {
  /** Canonical `owner/name` — plugged straight into the API path. */
  repoFullName: string;
  /**
   * Mirrors the parent tab. Drives both the `?source=` query param and
   * whether the component renders at all (the "ph" tab short-circuits
   * to null).
   */
  source: MentionTab;
  /**
   * Cursor captured by the server render for the "all" tab. Semantics:
   *   - `string`       — fetch this cursor on the first click.
   *   - `null`         — SSR exhausted the mention set; render null.
   *   - `undefined`    — first page not yet fetched (per-source tabs);
   *                      the initial click fires without `?cursor=`.
   */
  initialCursor?: string | null;
  /**
   * Optional callback for the parent to observe newly-loaded rows. The
   * parent doesn't need this to render — appended items live in local
   * state — but it's exposed so the page can, say, update its aggregate
   * counter without re-fetching.
   */
  onAppend?: (newItems: MentionItem[]) => void;
}

/** Hard-coded to keep the UI predictable; matches the SSR page size. */
const PAGE_LIMIT = 50;

export function MentionsLoadMore({
  repoFullName,
  source,
  initialCursor,
  onAppend,
}: MentionsLoadMoreProps) {
  // `cursor` drives what gets sent on the next fetch.
  //   undefined → send no `?cursor=` (first page of the filtered source)
  //   string    → send this cursor
  //   null      → terminal state, button hides
  const [cursor, setCursor] = useState<string | null | undefined>(initialCursor);
  const [items, setItems] = useState<MentionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wirePlatform = mentionTabToWirePlatform(source);

  const handleClick = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_LIMIT));
      if (wirePlatform) params.set("source", wirePlatform);
      // `cursor === undefined` → first page, don't send the param. The
      // empty-string check is belt-and-suspenders — the API 400s on "".
      if (typeof cursor === "string" && cursor.length > 0) {
        params.set("cursor", cursor);
      }

      const [owner, name] = repoFullName.split("/");
      const href = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/mentions?${params.toString()}`;

      const res = await fetch(href, {
        method: "GET",
        credentials: "same-origin",
        // Pair with the route's `Cache-Control: public, s-maxage=30` so the
        // browser doesn't spam origin on rapid clicks.
        cache: "default",
      });

      if (!res.ok) {
        // Server returned an ErrorEnvelope; surface its message when we can
        // parse it, otherwise fall back to a generic string.
        let msg = `Request failed (${res.status})`;
        try {
          const body: MentionsApiError = await res.json();
          if (body && typeof body.error === "string") msg = body.error;
        } catch {
          // ignore JSON parse failures — keep the generic status message
        }
        throw new Error(msg);
      }

      const body: MentionsApiEnvelope = await res.json();
      // Normalize wire rows into MentionItem; `toMentionItem` returns null
      // for platforms the feed doesn't render (e.g. github events), so we
      // filter those out rather than crash on an undefined source.
      const converted: MentionItem[] = [];
      for (const wire of body.items) {
        const it = toMentionItem(wire);
        if (it) converted.push(it);
      }

      setItems((prev) => [...prev, ...converted]);
      setCursor(body.nextCursor);
      onAppend?.(converted);
    } catch (err) {
      // Surface the message so the retry button reads meaningfully. Never
      // leak the stack trace to the DOM — keep it a short human phrase.
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [cursor, onAppend, repoFullName, wirePlatform]);

  // ProductHunt ("ph") has no paginated backend, so we don't render a
  // button for that tab at all. Done after all hooks so we stay compliant
  // with the rules of hooks.
  if (source === "ph") {
    return null;
  }
  // SSR already exhausted the mention set on the "all" tab and no rows
  // have been appended yet → nothing to render.
  if (cursor === null && items.length === 0 && source === "all") {
    return null;
  }

  // Terminal: no more pages AND we've loaded at least one page. Keep the
  // previously-loaded rows visible but hide the button.
  const terminal = cursor === null && items.length > 0;

  return (
    <>
      {items.length > 0 ? (
        <ul className="mt-0 divide-y divide-border-primary/40">
          {items.map((m) => (
            <MentionRow key={m.id} item={m} />
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-col items-start gap-1">
        {terminal ? (
          <p className="font-mono text-[11px] text-text-tertiary">
            {"// end of feed — no more mentions"}
          </p>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            aria-busy={loading}
            title="Load the next 50 mentions"
            className={`inline-flex items-center gap-2 rounded-badge border border-border-primary bg-bg-secondary px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-secondary transition-colors min-h-[36px] ${
              loading
                ? "cursor-wait opacity-60"
                : "hover:text-text-primary hover:border-border-secondary"
            }`}
          >
            {loading ? "Loading..." : "Load more evidence"}
          </button>
        )}

        {error ? (
          <p className="font-mono text-[11px] text-accent-red">
            Failed to load —{" "}
            <button
              type="button"
              onClick={handleClick}
              className="underline hover:opacity-80"
            >
              retry?
            </button>
          </p>
        ) : null}
      </div>
    </>
  );
}

export default MentionsLoadMore;
