"use client";

// RepoCommentReactions — the `.pf-cmt-actions` row for one comment.
//
// 1:1 with the standalone (`Profile - standalone.html` →
// CommentBlock, lines 1022–1034 of asset_e0686a47.js):
//
//   [♥ <heart>] [🦄 <unicorn>] [<bookmark icon> <bookmark>] [Reply] [Share]
//
// Heart and unicorn render as Unicode text glyphs (♥, 🦄) per the spec —
// these are text characters in the standalone, not <Icon> masks. Bookmark
// uses the canonical `<Icon name="bookmark">` because it has both an empty
// and a filled state in the icon set. Reply + Share use `<Icon>` for the
// leading glyph.
//
// Optimistic semantics:
//   - same reaction again      → toggle off
//   - different reaction       → switch (decrement old, increment new)
//   - none active              → add
// On 401/429/5xx the optimistic state reverts and the button row stays
// interactable so the user can retry. On 401 we also flip `authBlocked`
// so subsequent clicks short-circuit to the sign-in tooltip.
//
// Reply: clicking sets `window.location.hash` to `#reply-{id}`. The thread
// component listens for `hashchange` and renders a nested composer below
// the matching comment. Sharing flips the hash to `#comment-{id}` and
// copies the canonical URL to the clipboard.

import { useCallback, useState } from "react";

import { Icon } from "@/components/icon/Icon";

type Reaction = "heart" | "unicorn" | "bookmark";

interface RepoCommentReactionsProps {
  commentId: string;
  repoFullName: string;
  initialCounts: Record<Reaction, number>;
  initialUserReaction: Reaction | null;
  /** false → buttons render counts but click is inert (title: "Sign in to react"). */
  canReact: boolean;
  /**
   * Reserved for a future sign-in deep-link from the reaction row. Today the
   * inactive tooltip is enough, but keeping the prop in the contract lets the
   * thread keep its existing wiring stable when we add the CTA.
   */
  signInUrl: string;
}

interface ReactionDef {
  name: Reaction;
  /** Unicode glyph for heart + unicorn (text per the standalone). */
  glyph?: string;
  /** Icon name (used for bookmark). */
  iconName?: string;
  /** CSS class added on the active state — drives the colored `is-on` shade. */
  onClass: "on" | "on uni" | "on bk";
  /** Token name to feed into the `--reaction-on` variable for active state. */
  colorVar: "--heart" | "--unicorn" | "--accent";
  label: string;
}

// Order matters — the standalone shows heart → unicorn → bookmark.
const REACTIONS: readonly ReactionDef[] = [
  { name: "heart",    glyph: "♥",  onClass: "on",    colorVar: "--heart",    label: "Heart" },
  { name: "unicorn",  glyph: "🦄", onClass: "on uni", colorVar: "--unicorn",  label: "Unicorn" },
  { name: "bookmark", iconName: "bookmark", onClass: "on bk", colorVar: "--accent", label: "Bookmark" },
] as const;

function encodeRepoPath(fullName: string): string {
  const slash = fullName.indexOf("/");
  if (slash === -1) return encodeURIComponent(fullName);
  return `${encodeURIComponent(fullName.slice(0, slash))}/${encodeURIComponent(
    fullName.slice(slash + 1),
  )}`;
}

export function RepoCommentReactions({
  commentId,
  repoFullName,
  initialCounts,
  initialUserReaction,
  canReact,
}: RepoCommentReactionsProps) {
  const [counts, setCounts] = useState<Record<Reaction, number>>(initialCounts);
  const [userReaction, setUserReaction] = useState<Reaction | null>(
    initialUserReaction,
  );
  const [busy, setBusy] = useState<Reaction | null>(null);
  const [authBlocked, setAuthBlocked] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const endpoint = `/api/repos/${encodeRepoPath(repoFullName)}/comments/${encodeURIComponent(
    commentId,
  )}/reactions`;

  const toggle = useCallback(
    async (next: Reaction) => {
      if (!canReact || authBlocked || busy) return;

      const previousCounts = counts;
      const previousReaction = userReaction;
      const nextCounts: Record<Reaction, number> = { ...previousCounts };

      if (previousReaction === next) {
        nextCounts[next] = Math.max(0, (nextCounts[next] ?? 0) - 1);
      } else {
        if (previousReaction) {
          nextCounts[previousReaction] = Math.max(
            0,
            (nextCounts[previousReaction] ?? 0) - 1,
          );
        }
        nextCounts[next] = (nextCounts[next] ?? 0) + 1;
      }
      const nextReaction: Reaction | null =
        previousReaction === next ? null : next;
      setCounts(nextCounts);
      setUserReaction(nextReaction);
      setBusy(next);

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reaction: next }),
        });
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as
            | {
                ok?: boolean;
                counts?: Record<string, number>;
                userReaction?: string | null;
              }
            | null;
          if (data && data.counts) {
            setCounts({
              heart: data.counts.heart ?? 0,
              unicorn: data.counts.unicorn ?? 0,
              bookmark: data.counts.bookmark ?? 0,
            });
          }
          if (data && (data.userReaction === null || data.userReaction === undefined)) {
            setUserReaction(null);
          } else if (
            data &&
            (data.userReaction === "heart" ||
              data.userReaction === "unicorn" ||
              data.userReaction === "bookmark")
          ) {
            setUserReaction(data.userReaction);
          }
        } else if (res.status === 401) {
          setCounts(previousCounts);
          setUserReaction(previousReaction);
          setAuthBlocked(true);
        } else {
          setCounts(previousCounts);
          setUserReaction(previousReaction);
        }
      } catch {
        setCounts(previousCounts);
        setUserReaction(previousReaction);
      } finally {
        setBusy(null);
      }
    },
    [authBlocked, busy, canReact, counts, endpoint, userReaction],
  );

  // Reply — flip the hash so the thread listener mounts a reply composer
  // under this comment. Linear-style: deep-linkable and back-button-aware.
  const onReply = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.hash = `reply-${commentId}`;
    // Scroll the targeted comment into view for visual continuity.
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`comment-${commentId}`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [commentId]);

  // Share — copy the canonical URL (`/repo/{owner}/{name}#comment-{id}`)
  // to the clipboard. Fall back to setting the hash if clipboard write
  // fails (e.g. permissions denied in an iframe).
  const onShare = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${window.location.pathname}#comment-${commentId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 1500);
    } catch {
      // Clipboard unavailable — still update the hash so the share target
      // is at least selectable from the address bar.
      window.location.hash = `comment-${commentId}`;
    }
  }, [commentId]);

  const inactiveTooltip = !canReact || authBlocked ? "Sign in to react" : undefined;

  return (
    <div className="pf-cmt-actions" role="group" aria-label="React to comment">
      {REACTIONS.map((def) => {
        const active = userReaction === def.name;
        const title = inactiveTooltip ?? def.label;
        const className = `pf-cmt-act ${def.name}${active ? ` ${def.onClass} is-active` : ""}`;
        const onClick =
          canReact && !authBlocked
            ? (e: React.MouseEvent) => {
                e.preventDefault();
                void toggle(def.name);
              }
            : (e: React.MouseEvent) => e.preventDefault();
        return (
          <button
            key={def.name}
            type="button"
            className={className}
            style={{
              ["--reaction-on" as unknown as string]: `var(${def.colorVar})`,
            }}
            aria-label={def.label}
            aria-pressed={active}
            title={title}
            disabled={busy === def.name}
            onClick={onClick}
          >
            {def.glyph ? (
              <span className="gly" aria-hidden>
                {def.glyph}
              </span>
            ) : def.iconName ? (
              <Icon name={def.iconName} size={12} className="gly" />
            ) : null}
            <span className="count">{counts[def.name] ?? 0}</span>
          </button>
        );
      })}

      <button
        type="button"
        className="pf-cmt-act reply"
        onClick={onReply}
        aria-label="Reply to this comment"
        title="Reply (r)"
      >
        <Icon name="messages-square" size={12} className="gly" />
        <span className="count">Reply</span>
      </button>

      <button
        type="button"
        className="pf-cmt-act share"
        onClick={() => void onShare()}
        aria-label="Copy link to this comment"
        title={copiedShare ? "Link copied" : "Share"}
      >
        <Icon name={copiedShare ? "check" : "arrow-up-right"} size={12} className="gly" />
        <span className="count">{copiedShare ? "Copied" : "Share"}</span>
      </button>
    </div>
  );
}
