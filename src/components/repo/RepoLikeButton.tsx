"use client";

// RepoLikeButton — client-side toggle for the /repo/[owner]/[name] LIKE
// action. Visual + interaction pattern mirrors WatchButton (heart icon +
// count), but the source of truth is the server-side append-only JSONL
// store in src/lib/repo-likes.ts (NOT the Zustand watchlist slice).
//
// State strategy:
//   - The parent server page hydrates us with `initialCount` + `initialLiked`
//     from `getLikeStatus()`. Anonymous callers always get `initialLiked=false`.
//   - Click → optimistic flip (heart fill + count delta) → POST → on success
//     replace optimistic state with server-authoritative count + liked
//     (in case other users toggled between hydration and click).
//   - On any error (network, 401, 429, 5xx) we revert to the pre-click state
//     so the UI never lies.
//
// Auth: same gate as WatchButton — `signedIn` arrives as a prop from the
// server page. Anonymous click bounces to `signInUrl`.
//
// Cooldown: 60s soft cooldown after a successful toggle. Matches the server
// rate-limit (60/min) so we never out-pace the API and trigger 429s on
// honest users.

import { useCallback, useRef, useState } from "react";
import type { JSX } from "react";

import { Icon } from "@/components/icon/Icon";

interface RepoLikeButtonProps {
  /** "owner/name" — used to derive the API path. */
  repoFullName: string;
  /** From server-side getLikeStatus() at render time. */
  initialCount: number;
  /** False for anonymous callers. */
  initialLiked: boolean;
  signedIn: boolean;
  /** Where to send anonymous clickers (e.g. Clerk sign-in URL). */
  signInUrl: string;
}

const COOLDOWN_MS = 60_000;

function splitFullName(fullName: string): { owner: string; name: string } | null {
  const idx = fullName.indexOf("/");
  if (idx <= 0 || idx === fullName.length - 1) return null;
  const owner = fullName.slice(0, idx);
  const name = fullName.slice(idx + 1);
  if (!owner || !name) return null;
  return { owner, name };
}

interface ToggleResponse {
  ok: boolean;
  count?: number;
  liked?: boolean;
}

export function RepoLikeButton({
  repoFullName,
  initialCount,
  initialLiked,
  signedIn,
  signInUrl,
}: RepoLikeButtonProps): JSX.Element {
  const [count, setCount] = useState<number>(initialCount);
  const [liked, setLiked] = useState<boolean>(initialLiked);
  const [pending, setPending] = useState<boolean>(false);
  const cooldownUntilRef = useRef<number>(0);

  const handleClick = useCallback(async () => {
    if (!signedIn) {
      window.location.assign(signInUrl);
      return;
    }

    if (pending) return;
    if (Date.now() < cooldownUntilRef.current) return;

    const parts = splitFullName(repoFullName);
    if (!parts) return;

    // Snapshot pre-click state for revert-on-error.
    const prevLiked = liked;
    const prevCount = count;

    // Optimistic flip — keep count bounded at 0 just in case the server
    // already moved underneath us.
    const optimisticLiked = !prevLiked;
    const optimisticCount = optimisticLiked
      ? prevCount + 1
      : Math.max(0, prevCount - 1);
    setLiked(optimisticLiked);
    setCount(optimisticCount);
    setPending(true);

    try {
      const res = await fetch(
        `/api/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.name)}/like`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );

      const body = (await res.json().catch(() => null)) as ToggleResponse | null;

      if (!res.ok || !body || body.ok !== true) {
        // Revert — server rejected (401 / 429 / 5xx) or we couldn't read body.
        setLiked(prevLiked);
        setCount(prevCount);
        return;
      }

      // Authoritative reconcile. Server might disagree with our optimistic
      // numbers if another user's toggle interleaved.
      if (typeof body.count === "number") setCount(body.count);
      if (typeof body.liked === "boolean") setLiked(body.liked);

      cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
    } catch {
      // Network error → revert.
      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setPending(false);
    }
  }, [signedIn, signInUrl, repoFullName, liked, count, pending]);

  const label = liked ? "Liked" : "Like";
  const aria = signedIn
    ? `${label} ${repoFullName} (${count.toLocaleString()} ${count === 1 ? "like" : "likes"})`
    : `Sign in to like ${repoFullName}`;

  return (
    <button
      type="button"
      className={`repo-like-btn${liked ? " is-liked" : ""}`}
      aria-pressed={liked}
      aria-label={aria}
      data-repo-like
      onClick={handleClick}
      disabled={pending}
    >
      <Icon name="heart" size={16} className="heart" />
      <span className="repo-like-label">{label}</span>
      <span className="repo-like-count" aria-hidden="true">
        {count.toLocaleString()}
      </span>
    </button>
  );
}
