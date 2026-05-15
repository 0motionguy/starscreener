"use client";

/**
 * RepoLink — drop-in replacement for `<Link href="/repo/<owner>/<name>">`
 * that mounts a RepoHoverCard preview after a short delay on
 * mouseenter / focus. Touch / coarse-pointer devices get a plain link
 * with no preview (matches the underlying CSS `@media (hover: hover)`).
 *
 * Migration:
 *   - Replace `<Link href={`/repo/${owner}/${name}`}>` with
 *     `<RepoLink owner={owner} name={name}>...`
 *   - The wrapper forwards `className`, `prefetch`, `onClick`, and
 *     children to the underlying `<Link>`. Callers that need more
 *     control (e.g., custom event handlers on the anchor itself) should
 *     keep using `<Link>` directly — the hover card is opt-in.
 *
 * Network:
 *   - Single fetch to /api/repos/<owner>/<name>/hover (~500B + cache).
 *   - Triggered after 200ms hover delay so a quick mouse traversal across
 *     a long table doesn't fan out 50 requests.
 *   - Deduped by (owner,name) at the cache layer (browser HTTP cache).
 *
 * Coarse pointers (touch devices) — short-circuit and never fetch. The
 * card is a hover affordance and the tap-target navigates instead.
 */
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type MouseEvent,
} from "react";

import {
  RepoHoverCardPresence,
  type RepoHoverCardAnchorRect,
  type RepoHoverCardData,
} from "./RepoHoverCard";

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 80;

interface RepoLinkOwnerName {
  owner: string;
  name: string;
  fullName?: never;
}
interface RepoLinkFullName {
  /** "owner/name" — sugar for callers that only have the slug. */
  fullName: string;
  owner?: never;
  name?: never;
}

type RepoLinkProps = (RepoLinkOwnerName | RepoLinkFullName) & {
  /** Optional alternative target — defaults to `/repo/<owner>/<name>`. */
  href?: string;
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  prefetch?: ComponentProps<typeof Link>["prefetch"];
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** When false, render a plain `<Link>` with no preview attached. Use
   * for non-interactive contexts (PDF render, OG card composer, RSS). */
  preview?: boolean;
};

function resolveOwnerName(props: RepoLinkProps): { owner: string; name: string } | null {
  if ("fullName" in props && typeof props.fullName === "string") {
    const idx = props.fullName.indexOf("/");
    if (idx <= 0 || idx === props.fullName.length - 1) return null;
    return {
      owner: props.fullName.slice(0, idx),
      name: props.fullName.slice(idx + 1),
    };
  }
  if (
    "owner" in props &&
    "name" in props &&
    typeof props.owner === "string" &&
    typeof props.name === "string"
  ) {
    return { owner: props.owner, name: props.name };
  }
  return null;
}

function hasHoverPointer(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function RepoLink(props: RepoLinkProps) {
  const {
    href,
    children,
    className,
    style,
    prefetch,
    onClick,
    preview = true,
  } = props;
  const resolved = resolveOwnerName(props);
  const owner = resolved?.owner ?? "";
  const name = resolved?.name ?? "";

  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<RepoHoverCardAnchorRect | null>(
    null,
  );
  const [data, setData] = useState<RepoHoverCardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const computedHref = href ?? (resolved ? `/repo/${owner}/${name}` : "#");

  const captureAnchor = useCallback(() => {
    const el = linkRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchorRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  const fetchHover = useCallback(async () => {
    if (hasFetched) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/hover`,
        { credentials: "omit" },
      );
      if (!res.ok) {
        setError(true);
        setHasFetched(true);
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        repo?: RepoHoverCardData;
      };
      if (json.ok && json.repo) {
        setData(json.repo);
      } else {
        setError(true);
      }
      setHasFetched(true);
    } catch {
      setError(true);
      setHasFetched(true);
    } finally {
      setLoading(false);
    }
  }, [owner, name, hasFetched]);

  const beginOpen = useCallback(() => {
    if (!preview) return;
    if (!hasHoverPointer()) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openTimerRef.current) return;
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      captureAnchor();
      setOpen(true);
      void fetchHover();
    }, HOVER_OPEN_DELAY_MS);
  }, [preview, captureAnchor, fetchHover]);

  const beginClose = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) return;
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  }, []);

  useEffect(
    () => () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  return (
    <>
      <Link
        ref={linkRef}
        href={computedHref}
        prefetch={prefetch}
        className={className}
        style={style}
        onMouseEnter={beginOpen}
        onMouseLeave={beginClose}
        onFocus={beginOpen}
        onBlur={beginClose}
        onClick={onClick}
      >
        {children}
      </Link>
      {anchorRect ? (
        <RepoHoverCardPresence
          open={open}
          anchorRect={anchorRect}
          data={data}
          loading={loading}
          error={error}
        />
      ) : null}
    </>
  );
}
