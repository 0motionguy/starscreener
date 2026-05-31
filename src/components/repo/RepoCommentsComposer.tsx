"use client";

// RepoCommentsComposer — mirrors the `.pf-cmt-compose` block from
// `Profile - standalone.html` (PFComments, lines 973–992 of
// asset_e0686a47.js).
//
// Lives in two modes:
//
//   - Top composer (`isGlobalListener=true`, `parentId` unset): rendered
//     once at the top of the thread. Owns the textarea, Preview/Post
//     button row, and the "Ping @aiso…" hint.
//
//   - Reply composer (`compact=true`, `parentId=<id>`): rendered inline
//     under a parent comment when `#reply-{id}` is the active URL hash.
//     Same controls, slimmer chrome, plus a Cancel button.
//
// Submission flow:
//
//   1. User types → button enables when `draft.trim()` is non-empty.
//   2. Submit → optimistic prepend of a placeholder row (`onOptimisticAdd`)
//      followed by a POST to `/api/repos/{owner}/{name}/comments`.
//   3. On 201 → call `onPosted()` (the thread does `router.refresh()` to
//      pick up the canonical row).
//   4. On 401 → bounce to `signInUrl`. On 429 → show "slow down" hint and
//      revert. On 4xx/5xx → revert + show error.
//
// Optimistic id: a transient `tmp-{uuid}` so the canonical row replaces it
// after refresh. The parent's `onOptimisticRevert` is called with the same
// id on failure.
//
// Keyboard:
//   - Cmd/Ctrl + Enter in the textarea submits (Linear-style).
//   - Esc in the reply composer cancels (delegated to the parent thread
//     via `onCancel`).
//
// repoFullName encoding: the API route is /api/repos/[owner]/[name]/...
// so each segment is encoded independently — a slash in `repoFullName`
// is part of the path, not part of either segment.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/icon/Icon";
import { openSignInModal } from "@/lib/auth/open-sign-in-modal";
import type { RepoComment } from "@/lib/repo-comments";

interface RepoCommentsComposerProps {
  repoFullName: string;
  signedIn: boolean;
  signInUrl: string;
  /** Short repo name (without owner). Used in the placeholder copy. */
  repoNameShort: string;
  /** Set when this composer is a reply to a specific comment. */
  parentId?: string;
  /** Only the top composer should attach global keyboard listeners. */
  isGlobalListener: boolean;
  /** Ref hoisted to the parent so global keyboard handlers can focus it. */
  textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
  /** Called after we optimistically add a new row before the POST completes. */
  onOptimisticAdd: (next: RepoComment) => void;
  /** Called if the POST fails — undo the optimistic row by id. */
  onOptimisticRevert: (id: string) => void;
  /** Called after a successful POST so the thread can refresh server data. */
  onPosted: () => void;
  /** Called when the user dismisses a reply composer (Cancel button / Esc). */
  onCancel?: () => void;
  /** null = anonymous viewer. */
  currentUserId: string | null;
  /** Avatar letter shown next to the textarea ("U" if signed in, "?" otherwise). */
  avatarLetter: string;
  /** Compact layout (used for reply composers nested under a parent). */
  compact?: boolean;
}

const MAX_BODY = 4000;
const COUNTER_VISIBLE_AT = 3500;

function encodeRepoPath(fullName: string): string {
  const slash = fullName.indexOf("/");
  if (slash === -1) return encodeURIComponent(fullName);
  return `${encodeURIComponent(fullName.slice(0, slash))}/${encodeURIComponent(
    fullName.slice(slash + 1),
  )}`;
}

function tempId(): string {
  // Use crypto.randomUUID where available; this is just for optimistic
  // ordering, not security.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `tmp-${crypto.randomUUID()}`;
  }
  return `tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function RepoCommentsComposer({
  repoFullName,
  signedIn,
  signInUrl,
  repoNameShort,
  parentId,
  isGlobalListener,
  textareaRef,
  onOptimisticAdd,
  onOptimisticRevert,
  onPosted,
  onCancel,
  currentUserId,
  avatarLetter,
  compact = false,
}: RepoCommentsComposerProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const formId = useId();
  const errId = `${formId}-error`;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const trimmed = draft.trim();
  const remaining = MAX_BODY - draft.length;
  const counterVisible = draft.length >= COUNTER_VISIBLE_AT;
  const counterWarning = remaining < 200;

  const endpoint = useMemo(
    () => `/api/repos/${encodeRepoPath(repoFullName)}/comments`,
    [repoFullName],
  );

  const isReply = typeof parentId === "string" && parentId.length > 0;
  const placeholder = isReply
    ? `Reply — share your take. Markdown + \`code\` supported.`
    : `Add to the thread — what are you using ${repoNameShort} for? Markdown + \`code\` supported.`;

  // Hoist the ref so the thread can focus the top composer from elsewhere.
  const setTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (textareaRef) textareaRef.current = node;
    },
    [textareaRef],
  );

  // Auto-focus the reply composer when it appears.
  useEffect(() => {
    if (compact && localRef.current) {
      localRef.current.focus();
    }
  }, [compact]);

  const submit = useCallback(async () => {
    if (!signedIn) {
      // Belt-and-braces — the button is hidden when signed-out, but a
      // Cmd+Enter keystroke from a stale focus state shouldn't be a silent
      // no-op. Open the Clerk modal in place (falls back to a hard /sign-in
      // redirect if Clerk's browser SDK isn't loaded).
      openSignInModal();
      return;
    }
    if (!trimmed || busy) return;

    // Optimistic prepend.
    const optimisticId = tempId();
    const optimisticRow: RepoComment = {
      id: optimisticId,
      repoFullName,
      clerkUserId: currentUserId ?? "self",
      displayName: "You",
      avatarUrl: null,
      body: trimmed,
      createdAt: new Date().toISOString(),
      ...(parentId ? { parentId } : {}),
    };
    onOptimisticAdd(optimisticRow);

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isReply ? { body: trimmed, parentId } : { body: trimmed },
        ),
      });
      if (res.ok) {
        setDraft("");
        setPreview(false);
        // Hand off to the parent — it will router.refresh() so the canonical
        // row replaces the optimistic one on the next paint.
        onPosted();
        // The optimistic row stays visible until router.refresh() repaints;
        // the parent layer keys by id so there's no double-render flash.
        onOptimisticRevert(optimisticId);
      } else if (res.status === 401) {
        onOptimisticRevert(optimisticId);
        openSignInModal();
      } else if (res.status === 429) {
        onOptimisticRevert(optimisticId);
        setErr("Slow down — too many posts in the last minute");
      } else if (res.status === 400) {
        onOptimisticRevert(optimisticId);
        let msg = "Could not post — check your message and try again";
        try {
          const data = (await res.json()) as { error?: string };
          if (typeof data.error === "string" && data.error.length > 0) {
            msg = data.error;
          }
        } catch {
          /* keep generic copy */
        }
        setErr(msg);
      } else {
        onOptimisticRevert(optimisticId);
        setErr("Could not post — try again in a moment");
      }
    } catch {
      onOptimisticRevert(optimisticId);
      setErr("Network error — your draft wasn’t sent");
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    currentUserId,
    endpoint,
    isReply,
    onOptimisticAdd,
    onOptimisticRevert,
    onPosted,
    parentId,
    repoFullName,
    signInUrl,
    signedIn,
    trimmed,
  ]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void submit();
        return;
      }
      if (e.key === "Escape" && compact && onCancel) {
        e.preventDefault();
        onCancel();
      }
    },
    [compact, onCancel, submit],
  );

  // Global "/" focus shortcut — only the top composer registers this so the
  // page doesn't fight reply-composer focus when multiple are mounted.
  useEffect(() => {
    if (!isGlobalListener) return;
    function onGlobalKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inEditable) return;
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // `c` focuses the top composer — adjacent to Linear's `c` for
        // "comment" / "compose".
        e.preventDefault();
        localRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, [isGlobalListener]);

  // --- Signed-out ---------------------------------------------------------
  //
  // When signed-out we still render the PF compose-box shell so the layout
  // doesn't shift; the textarea is replaced by a sign-in CTA inside the box.

  if (!signedIn) {
    return (
      <div className="pf-cmt-compose">
        <div className="pf-cmt-avatar" aria-hidden>
          {avatarLetter}
        </div>
        <div
          className="pf-cmt-compose-box"
          role="region"
          aria-label="Sign in to comment"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "var(--text-soft, var(--fg-muted))",
            }}
          >
            Sign in to join the discussion
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={() => openSignInModal()}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // --- Signed-in ----------------------------------------------------------

  const wrapClass = compact ? "pf-cmt-compose pf-cmt-compose-reply" : "pf-cmt-compose";

  return (
    <div className={wrapClass}>
      <div className={`pf-cmt-avatar${compact ? " sm" : ""}`} aria-hidden>
        {avatarLetter}
      </div>
      <form
        className="pf-cmt-compose-box"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        aria-label={isReply ? "Post a reply" : "Post a comment"}
        id={formId}
      >
        {preview ? (
          <div
            className="pf-cmt-text"
            aria-live="polite"
            style={{
              minHeight: 38,
              padding: "8px 2px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {trimmed.length === 0 ? (
              <span style={{ color: "var(--text-soft, var(--fg-muted))" }}>
                Nothing to preview yet.
              </span>
            ) : (
              trimmed
            )}
          </div>
        ) : (
          <textarea
            ref={setTextareaRef}
            placeholder={placeholder}
            rows={2}
            value={draft}
            maxLength={MAX_BODY}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={isReply ? "Reply draft" : "Comment draft"}
            aria-describedby={err ? errId : undefined}
            disabled={busy}
          />
        )}
        <div className="pf-cmt-compose-foot">
          <div className="hint">
            {counterVisible ? (
              <span
                style={{
                  color: counterWarning
                    ? "var(--warning, var(--accent))"
                    : "var(--text-dim, var(--fg-subtle))",
                }}
              >
                {remaining} left
              </span>
            ) : isReply ? (
              <span>
                Replying ·{" "}
                <span style={{ color: "var(--accent)" }}>
                  Esc
                </span>{" "}
                to cancel
              </span>
            ) : (
              <span>
                Ping{" "}
                <span style={{ color: "var(--info)" }}>@aiso</span> in a
                comment for an on-demand summary.
              </span>
            )}
          </div>
          <div className="btns">
            {compact && onCancel ? (
              <button
                type="button"
                className="btn ghost"
                onClick={onCancel}
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              onClick={() => setPreview((p) => !p)}
              aria-pressed={preview}
              disabled={busy}
            >
              {preview ? "Edit" : "Preview"}
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || trimmed.length === 0}
              aria-busy={busy || undefined}
            >
              <Icon name="send" size={12} />{" "}
              {busy ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
        {err ? (
          <p
            id={errId}
            role="alert"
            style={{
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--negative, var(--down))",
            }}
          >
            {err}
          </p>
        ) : null}
      </form>
    </div>
  );
}
