"use client";

// RepoReactionButton — client-side toggle for repo-level reactions on the
// /repo/[owner]/[name] hero. Generalized version of RepoLikeButton: same
// optimistic-flip, revert-on-error, post-success authoritative reconcile,
// soft-cooldown, sign-in-bounce contract — but parameterized by reaction
// `kind` so multiple reactions share one client component.
//
// State strategy:
//   - The parent server page hydrates us with `initialCount` + `initialActive`
//     from `getReactionStatus()`. Anonymous callers always get
//     `initialActive=false`.
//   - Click → optimistic flip (icon fill + count delta) → POST → on success
//     replace optimistic state with server-authoritative count + active
//     (in case other users toggled between hydration and click).
//   - On any error (network, 401, 429, 5xx) we revert to the pre-click state
//     so the UI never lies.
//
// Auth: `signedIn` arrives as a prop from the server page. Anonymous click
// bounces to `signInUrl`.
//
// Cooldown: 60 s soft cooldown after a successful toggle. Matches the
// server rate-limit (60/min) so honest users never out-pace the API and
// trigger 429s.

import { useCallback, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";

import { Icon } from "@/components/icon/Icon";
import { openSignInModal } from "@/lib/auth/open-sign-in-modal";
import type { RepoReactionKind } from "@/lib/repo-reactions";

interface RepoReactionButtonProps {
  /** "owner/name" — used to derive the API path. */
  repoFullName: string;
  /** Reaction kind sent to the API. */
  kind: RepoReactionKind;
  /** Icon-mask name (under /public/icons/) for the button glyph. */
  iconName: string;
  /** Hero-row className suffix — e.g. "unicorn" → `pf-react unicorn`. */
  variantClass: string;
  /** CSS color for `--reaction-on` (active-state hue). */
  activeColorVar: string;
  /** Initial cardinality of the on-set, from server. */
  initialCount: number;
  /** False for anonymous callers. */
  initialActive: boolean;
  signedIn: boolean;
  /** Where to send anonymous clickers (e.g. Clerk sign-in URL). */
  signInUrl: string;
  /** Visible label for screen readers when inactive. e.g. "Mark as unicorn". */
  inactiveLabel: string;
  /** Visible label for screen readers when active. e.g. "Remove unicorn". */
  activeLabel: string;
  /** Whether to render the numeric count badge (off-state hides for bookmark-style toggles). */
  showCount?: boolean;
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
  /** Echoes the toggled kind so the client can sanity-check. */
  kind?: RepoReactionKind;
  count?: number;
  active?: boolean;
}

export function RepoReactionButton({
  repoFullName,
  kind,
  iconName,
  variantClass,
  activeColorVar,
  initialCount,
  initialActive,
  signedIn,
  signInUrl,
  inactiveLabel,
  activeLabel,
  showCount = true,
}: RepoReactionButtonProps): JSX.Element {
  const [count, setCount] = useState<number>(initialCount);
  const [active, setActive] = useState<boolean>(initialActive);
  const [pending, setPending] = useState<boolean>(false);
  const cooldownUntilRef = useRef<number>(0);

  const handleClick = useCallback(async () => {
    if (!signedIn) {
      openSignInModal(signInUrl);
      return;
    }

    if (pending) return;
    if (Date.now() < cooldownUntilRef.current) return;

    const parts = splitFullName(repoFullName);
    if (!parts) return;

    const prevActive = active;
    const prevCount = count;

    const optimisticActive = !prevActive;
    const optimisticCount = optimisticActive
      ? prevCount + 1
      : Math.max(0, prevCount - 1);
    setActive(optimisticActive);
    setCount(optimisticCount);
    setPending(true);

    try {
      const res = await fetch(
        `/api/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.name)}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        },
      );

      const body = (await res.json().catch(() => null)) as ToggleResponse | null;

      if (!res.ok || !body || body.ok !== true) {
        setActive(prevActive);
        setCount(prevCount);
        return;
      }

      // Authoritative reconcile. Server might disagree with our optimistic
      // numbers if another user's toggle interleaved.
      if (typeof body.count === "number") setCount(body.count);
      if (typeof body.active === "boolean") setActive(body.active);

      cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
    } catch {
      setActive(prevActive);
      setCount(prevCount);
    } finally {
      setPending(false);
    }
  }, [signedIn, signInUrl, repoFullName, kind, active, count, pending]);

  const aria = signedIn ? (active ? activeLabel : inactiveLabel) : `Sign in to ${inactiveLabel.toLowerCase()}`;

  return (
    <button
      type="button"
      className={`pf-react ${variantClass}${active ? " is-active" : ""}`}
      style={{ ["--reaction-on" as string]: activeColorVar } as CSSProperties}
      aria-pressed={active}
      aria-label={aria}
      onClick={handleClick}
      disabled={pending}
    >
      <Icon name={iconName} size={14} className="gly" />
      {showCount ? (
        <span className="count">{count.toLocaleString()}</span>
      ) : null}
    </button>
  );
}
