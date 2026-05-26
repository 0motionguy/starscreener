"use client";

// RepoCommentsThread — the comments section for /repo/[owner]/[name].
//
// This file owns the PFComments DOM 1:1 (per `Profile - standalone.html`
// → `PFComments` + `CommentBlock`, lines 957–1046 of asset_e0686a47.js).
// It is a client component because it owns:
//   - the reply-mode hash router (`#reply-{id}` → render a nested composer
//     below the targeted comment),
//   - the optimistic prepend / revert flow (new comments arrive without
//     a full RSC refresh),
//   - the keyboard nav contract (`j` / `k` to walk root comments, `r` to
//     reply to the focused one, `Esc` to close any open reply).
//
// Server-loaded seed: the page passes `comments: RepoComment[]` already
// projected (newest-first, tombstones filtered) plus per-comment
// `initialReactions`. We bucket replies under their parent here so the
// route handler doesn't need to do tree shaping.
//
// PII boundary: the seed payload includes `clerkUserId` because the
// existing API/page contract already serializes it across the RSC boundary
// (the reactions sub-island consumes the same prop graph). We use it only
// to compute display badges (`◆ AISO` for the bot account) and the
// `author` badge match — never echoed back to the wire.
//
// Forbidden touched: inline hex (all colors go through CSS tokens), Google
// Fonts imports, anonymous emoji glyphs in the icon row (reactions stay as
// real ♥ / 🦄 Unicode characters per the standalone; Reply/Share use the
// shared `<Icon>` mask-image system).

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import type { RepoComment } from "@/lib/repo-comments";
import type { ReactionAggregate } from "@/lib/repo-comment-reactions";

import { RepoCommentsComposer } from "./RepoCommentsComposer";
import { RepoCommentReactions } from "./RepoCommentReactions";

type Reaction = "heart" | "unicorn" | "bookmark";

interface RepoCommentsThreadProps {
  repoFullName: string;
  comments: RepoComment[];
  /** Keyed by `commentId`. Missing keys fall back to a zero aggregate. */
  initialReactions: Record<string, ReactionAggregate>;
  /** null = anonymous viewer */
  currentUserId: string | null;
  /** Pre-built /sign-in?redirect_url=... for the composer's CTA. */
  signInUrl: string;
}

// ---------------------------------------------------------------------------
// Reaction normalisation — older rows used different storage keys
// ---------------------------------------------------------------------------

// Legacy emoji-keyed storage rows (red-heart with + without VS16). Kept as
// Unicode escapes per the original normalisation contract — these are
// storage keys, not display glyphs, so we never want them inlined as
// literals in source.
const LEGACY_TO_REACTION: Record<string, Reaction> = {
  "❤️": "heart",
  "❤": "heart",
};

function normaliseCounts(
  raw: Record<string, number> | undefined,
): Record<Reaction, number> {
  const out: Record<Reaction, number> = { heart: 0, unicorn: 0, bookmark: 0 };
  if (!raw) return out;
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    if (key === "heart" || key === "unicorn" || key === "bookmark") {
      out[key] += value;
      continue;
    }
    const mapped = LEGACY_TO_REACTION[key];
    if (mapped) out[mapped] += value;
  }
  return out;
}

function normaliseUserReaction(value: unknown): Reaction | null {
  if (value === "heart" || value === "unicorn" || value === "bookmark") {
    return value;
  }
  if (typeof value === "string" && LEGACY_TO_REACTION[value]) {
    return LEGACY_TO_REACTION[value];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function initial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed[0]!.toUpperCase();
}

function handleFromName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "user"
  );
}

function ageLabel(iso: string, nowMs: number): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "now";
  const ms = Math.max(0, nowMs - ts);
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function ownerFromFullName(fullName: string): string {
  const i = fullName.indexOf("/");
  return i === -1 ? fullName : fullName.slice(0, i);
}

// Render the comment body. Markdown isn't implemented yet; we render plain
// text inside <p> so newlines collapse safely. The standalone shows `code`
// spans via backticks; until a full markdown renderer lands, leave the text
// raw so we never break — `.pf-cmt-text code` styling activates when a
// future renderer wraps inline code spans.
function renderCommentBody(body: string): React.ReactNode {
  return <p>{body}</p>;
}

// ---------------------------------------------------------------------------
// Badge logic — honest fallbacks per agent contract
// ---------------------------------------------------------------------------
//
// `author`: the comment author IS the repo owner. Cleanest match would be
//   `comment.clerkUserId === repoOwnerProfile.clerkUserId`, but we don't
//   have an owner→Clerk lookup on this page. Honest fallback: case-fold
//   `displayName === owner`. This catches the common case (a maintainer
//   posting under their GitHub handle) without ever falsely tagging an
//   unrelated user.
// `op`: "original poster". The standalone treats this as separate from
//   `author`. We have no source signal for it — there's no `is_op` flag,
//   nor a "first commenter" semantic that survives moderation. Per task
//   spec: **skip the badge entirely** rather than synthesise one.
// `aiso`: the AISO bot account. Match against `AISO_BOT_CLERK_USER_ID`
//   inlined at build via `process.env.NEXT_PUBLIC_AISO_BOT_CLERK_USER_ID`
//   (server-side env vars never reach the client). When unset, no badge.

const AISO_BOT_ID =
  process.env.NEXT_PUBLIC_AISO_BOT_CLERK_USER_ID ?? "";

type BadgeKind = "author" | "aiso";

function badgesFor(
  comment: RepoComment,
  ownerLower: string,
): readonly BadgeKind[] {
  const out: BadgeKind[] = [];
  if (comment.displayName.trim().toLowerCase() === ownerLower) {
    out.push("author");
  }
  if (AISO_BOT_ID.length > 0 && comment.clerkUserId === AISO_BOT_ID) {
    out.push("aiso");
  }
  return out;
}

function badgeLabel(kind: BadgeKind): string {
  switch (kind) {
    case "author":
      return "◉ AUTHOR";
    case "aiso":
      return "◇ AISO";
  }
}

// ---------------------------------------------------------------------------
// Tree shaping — group replies under their parent
// ---------------------------------------------------------------------------
//
// JSONL ordering from `listCommentsForRepo` is already newest-first across
// the whole repo. For the thread layout we keep roots in that order and
// inline their replies in chronological (oldest-first) order beneath each
// root — that's the conventional reply order and matches the standalone.

interface CommentNode extends RepoComment {
  children: CommentNode[];
}

function buildTree(comments: RepoComment[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const c of comments) byId.set(c.id, { ...c, children: [] });
  const roots: CommentNode[] = [];
  // Walk in original (newest-first) order to keep root positions stable.
  for (const c of comments) {
    const node = byId.get(c.id)!;
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId)!.children.push(node);
    } else {
      // Includes both true roots and orphan replies whose parent was
      // tombstoned. Treating orphans as roots is honest — the text still
      // matters, just without its conversation context.
      roots.push(node);
    }
  }
  // Sort reply children oldest-first (chronological).
  for (const root of byId.values()) {
    root.children.sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Optimistic add / remove primitives
// ---------------------------------------------------------------------------

type ThreadAction =
  | { kind: "add"; comment: RepoComment }
  | { kind: "remove"; id: string };

function applyAction(
  state: RepoComment[],
  action: ThreadAction,
): RepoComment[] {
  if (action.kind === "add") {
    // Top of the list (newest-first ordering).
    return [action.comment, ...state];
  }
  return state.filter((c) => c.id !== action.id);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RepoCommentsThread({
  repoFullName,
  comments,
  initialReactions,
  currentUserId,
  signInUrl,
}: RepoCommentsThreadProps) {
  const router = useRouter();
  const canReact = currentUserId !== null;
  const ownerLower = ownerFromFullName(repoFullName).toLowerCase();
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // Optimistic comment list.
  const [optimistic, dispatchOptimistic] = useOptimistic<
    RepoComment[],
    ThreadAction
  >(comments, applyAction);

  // Reply mode (which comment id is being replied to, null when none).
  const [replyOpen, setReplyOpen] = useState<string | null>(null);

  // Focus index for j/k nav.
  const [focusIndex, setFocusIndex] = useState<number>(-1);

  // Now-clock so age labels stay roughly fresh on long sessions without
  // forcing a re-render storm. Tick once a minute.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const tree = useMemo(() => buildTree(optimistic), [optimistic]);
  const totalCount = optimistic.length;

  // -------------------------------------------------------------------------
  // Hash sync — `#comment-{id}` (Share target) AND `#reply-{id}` (reply UI)
  // -------------------------------------------------------------------------
  useEffect(() => {
    function readHash() {
      const raw = window.location.hash.slice(1);
      if (raw.startsWith("reply-")) {
        setReplyOpen(raw.slice(6));
      } else {
        setReplyOpen(null);
      }
    }
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  // -------------------------------------------------------------------------
  // Keyboard nav (Linear-style)
  // -------------------------------------------------------------------------
  //
  // `j` / `k` walk root comments and call `focus()` on them.
  // `r` opens reply mode for the currently-focused comment.
  // `Esc` closes any open reply composer.
  // Cmd/Ctrl+Enter on the composer is handled inside `RepoCommentsComposer`.
  //
  // We skip when the user is mid-typing in an input/textarea so the chord
  // doesn't fight regular editing.

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "Escape" && replyOpen !== null) {
        e.preventDefault();
        window.history.replaceState(null, "", "#comments");
        setReplyOpen(null);
        return;
      }
      if (inEditable) return;

      const roots = threadRef.current?.querySelectorAll<HTMLElement>(
        "[data-cmt-root]",
      );
      if (!roots || roots.length === 0) return;

      if (e.key === "j") {
        e.preventDefault();
        const next = Math.min(roots.length - 1, focusIndex + 1);
        roots[next]?.focus();
        setFocusIndex(next);
      } else if (e.key === "k") {
        e.preventDefault();
        const prev = Math.max(0, focusIndex - 1);
        roots[prev]?.focus();
        setFocusIndex(prev);
      } else if (e.key === "r") {
        if (focusIndex < 0 || focusIndex >= roots.length) return;
        e.preventDefault();
        const node = roots[focusIndex];
        const id = node?.getAttribute("data-cmt-id");
        if (id) {
          window.location.hash = `reply-${id}`;
        }
      }
    },
    [focusIndex, replyOpen],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // -------------------------------------------------------------------------
  // Optimistic helpers passed down to the composer
  // -------------------------------------------------------------------------

  const addOptimistic = useCallback(
    (next: RepoComment) => {
      // useOptimistic dispatches must happen inside a transition; the
      // composer wraps its fetch in one already, but we wrap here too as a
      // safety net so a direct call from a non-transition stack still works.
      startTransition(() => {
        dispatchOptimistic({ kind: "add", comment: next });
      });
    },
    [dispatchOptimistic],
  );

  const removeOptimistic = useCallback(
    (id: string) => {
      startTransition(() => {
        dispatchOptimistic({ kind: "remove", id });
      });
    },
    [dispatchOptimistic],
  );

  const onPosted = useCallback(() => {
    // After a successful POST, ask the server for fresh data so the
    // optimistic row is replaced by the canonical one (server timestamp,
    // canonical id). The optimistic row is filtered out by id match because
    // the optimistic + canonical share the temporary id.
    router.refresh();
  }, [router]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section className="pf-section" id="comments" aria-label="Discussion">
      <div className="pf-card pf-comments">
        <div className="pf-card-head">
          <h3>
            <span className="slash">{"//"}</span>COMMENTS · {totalCount}
          </h3>
          <div className="meta">live thread · operators only</div>
        </div>

        {/* Top composer */}
        <RepoCommentsComposer
          repoFullName={repoFullName}
          signedIn={canReact}
          signInUrl={signInUrl}
          repoNameShort={repoFullName.split("/")[1] ?? repoFullName}
          isGlobalListener
          textareaRef={composerRef}
          onOptimisticAdd={addOptimistic}
          onOptimisticRevert={removeOptimistic}
          onPosted={onPosted}
          currentUserId={currentUserId}
          avatarLetter={canReact ? "U" : "?"}
        />

        {/* Thread */}
        {tree.length === 0 ? (
          <div className="pf-cmt-empty" role="status">
            Be the first to comment.
          </div>
        ) : (
          <div
            ref={threadRef}
            className="pf-cmt-thread"
            aria-live="polite"
            aria-relevant="additions"
          >
            {tree.map((c) => (
              <CommentBlock
                key={c.id}
                node={c}
                reply={false}
                repoFullName={repoFullName}
                ownerLower={ownerLower}
                nowMs={nowMs}
                initialReactions={initialReactions}
                canReact={canReact}
                signInUrl={signInUrl}
                replyOpen={replyOpen}
                onOptimisticAdd={addOptimistic}
                onOptimisticRevert={removeOptimistic}
                onPosted={onPosted}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CommentBlock — direct mirror of the standalone's `CommentBlock` function
// ---------------------------------------------------------------------------

interface CommentBlockProps {
  node: CommentNode;
  reply: boolean;
  repoFullName: string;
  ownerLower: string;
  nowMs: number;
  initialReactions: Record<string, ReactionAggregate>;
  canReact: boolean;
  signInUrl: string;
  replyOpen: string | null;
  onOptimisticAdd: (c: RepoComment) => void;
  onOptimisticRevert: (id: string) => void;
  onPosted: () => void;
  currentUserId: string | null;
}

function CommentBlock({
  node,
  reply,
  repoFullName,
  ownerLower,
  nowMs,
  initialReactions,
  canReact,
  signInUrl,
  replyOpen,
  onOptimisticAdd,
  onOptimisticRevert,
  onPosted,
  currentUserId,
}: CommentBlockProps) {
  const raw = initialReactions[node.id];
  const counts = normaliseCounts(raw?.counts);
  const userReaction = normaliseUserReaction(raw?.userReaction);
  const badges = badgesFor(node, ownerLower);
  const avatarLetter = initial(node.displayName);
  const handle = `@${handleFromName(node.displayName)}`;
  const isReplyOpenHere = replyOpen === node.id;

  const articleClass = reply ? "pf-cmt-reply" : "pf-cmt";
  const avatarClass = `pf-cmt-avatar${reply ? " sm" : ""}`;

  return (
    <article
      id={`comment-${node.id}`}
      className={articleClass}
      data-cmt-id={node.id}
      data-cmt-root={reply ? undefined : true}
      tabIndex={reply ? -1 : 0}
    >
      <div className={avatarClass} aria-hidden>
        {node.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={node.avatarUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            width={reply ? 28 : 36}
            height={reply ? 28 : 36}
          />
        ) : (
          avatarLetter
        )}
      </div>
      <div className="pf-cmt-body">
        <div className="pf-cmt-head">
          <span className="pf-cmt-name">{node.displayName}</span>
          <span className="pf-cmt-handle">{handle}</span>
          {badges.map((b) => (
            <span key={b} className={`pf-cmt-badge ${b}`}>
              {badgeLabel(b)}
            </span>
          ))}
          <span className="pf-cmt-time">· {ageLabel(node.createdAt, nowMs)} ago</span>
        </div>
        <div className="pf-cmt-text">{renderCommentBody(node.body)}</div>

        <RepoCommentReactions
          commentId={node.id}
          repoFullName={repoFullName}
          initialCounts={counts}
          initialUserReaction={userReaction}
          canReact={canReact}
          signInUrl={signInUrl}
        />

        {/* Nested reply composer — toggled by `#reply-{id}` */}
        {isReplyOpenHere ? (
          <div className="pf-cmt-reply-composer" style={{ marginTop: 12 }}>
            <RepoCommentsComposer
              repoFullName={repoFullName}
              signedIn={canReact}
              signInUrl={signInUrl}
              repoNameShort={repoFullName.split("/")[1] ?? repoFullName}
              parentId={node.id}
              isGlobalListener={false}
              onOptimisticAdd={onOptimisticAdd}
              onOptimisticRevert={onOptimisticRevert}
              onPosted={() => {
                window.history.replaceState(null, "", `#comment-${node.id}`);
                onPosted();
              }}
              onCancel={() => {
                window.history.replaceState(null, "", "#comments");
              }}
              currentUserId={currentUserId}
              avatarLetter={canReact ? "U" : "?"}
              compact
            />
          </div>
        ) : null}

        {/* Recursive children */}
        {node.children.length > 0 ? (
          <div className="pf-cmt-replies">
            {node.children.map((child) => (
              <CommentBlock
                key={child.id}
                node={child}
                reply
                repoFullName={repoFullName}
                ownerLower={ownerLower}
                nowMs={nowMs}
                initialReactions={initialReactions}
                canReact={canReact}
                signInUrl={signInUrl}
                replyOpen={replyOpen}
                onOptimisticAdd={onOptimisticAdd}
                onOptimisticRevert={onOptimisticRevert}
                onPosted={onPosted}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

