"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

const HOVER_INTENT_DELAY_MS = 90;
const HOVER_PREVIEW_DELAY_MS = 140;

interface HoverCommit {
  sha: string;
  message: string;
  url: string;
}

interface HoverPayload {
  ownerAvatarUrl: string | null;
  commits: HoverCommit[];
}

interface RepoHoverPrefetchLinkProps {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function RepoHoverPrefetchLink({
  href,
  className,
  style,
  children,
}: RepoHoverPrefetchLinkProps) {
  const router = useRouter();
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prefetchedRef = useRef(false);
  const fetchedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<HoverPayload | null>(null);

  const hoverRepo = useMemo(() => {
    const match = href.match(/^\/repo\/([^/]+)\/([^/?#]+)/);
    if (!match) return null;
    return { owner: match[1], name: match[2] };
  }, [href]);

  const clearHoverTimer = useCallback(() => {
    if (!hoverTimerRef.current) return;
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  const prefetchNow = useCallback(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    router.prefetch(href);
  }, [href, router]);

  const clearPreviewTimer = useCallback(() => {
    if (!previewTimerRef.current) return;
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
  }, []);

  const fetchHoverPreview = useCallback(async () => {
    if (!hoverRepo || fetchedRef.current) return;
    fetchedRef.current = true;
    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(hoverRepo.owner)}/${encodeURIComponent(hoverRepo.name)}/commits?per_page=3`,
        { signal: ac.signal, cache: "force-cache" },
      );
      if (!res.ok) return;
      const json = await res.json();
      if (!Array.isArray(json)) return;
      setPreview({
        ownerAvatarUrl: `https://avatars.githubusercontent.com/${encodeURIComponent(hoverRepo.owner)}?s=40&v=4`,
        commits: json
          .filter((item: unknown) => !!item && typeof item === "object")
          .map((item: {
            sha?: string;
            html_url?: string;
            commit?: { message?: string };
          }) => ({
            sha: typeof item.sha === "string" ? item.sha.slice(0, 7) : "",
            message: typeof item.commit?.message === "string"
              ? item.commit.message.split("\n")[0]
              : "",
            url: typeof item.html_url === "string" ? item.html_url : "",
          }))
          .filter((item: HoverCommit) => item.sha && item.message)
          .slice(0, 3),
      });
    } catch {
      // Non-critical UI affordance: fail silently.
    }
  }, [hoverRepo]);

  const handleMouseEnter = useCallback(() => {
    clearHoverTimer();
    clearPreviewTimer();
    hoverTimerRef.current = setTimeout(prefetchNow, HOVER_INTENT_DELAY_MS);
    if (hoverRepo) {
      previewTimerRef.current = setTimeout(() => {
        setOpen(true);
        void fetchHoverPreview();
      }, HOVER_PREVIEW_DELAY_MS);
    }
  }, [clearHoverTimer, clearPreviewTimer, fetchHoverPreview, hoverRepo, prefetchNow]);

  const handleMouseLeave = useCallback(() => {
    clearHoverTimer();
    clearPreviewTimer();
    setOpen(false);
  }, [clearHoverTimer, clearPreviewTimer]);

  useEffect(() => () => {
    clearHoverTimer();
    clearPreviewTimer();
    abortRef.current?.abort();
  }, [clearHoverTimer, clearPreviewTimer]);

  return (
    <span className="relative block">
      <Link
        href={href}
        prefetch={false}
        className={className}
        style={style}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={prefetchNow}
        onBlur={handleMouseLeave}
        onTouchStart={prefetchNow}
      >
        {children}
      </Link>
      {open && preview && preview.commits.length > 0 && (
        <div
          data-testid="repo-hover-preview"
          className="pointer-events-none absolute left-3 top-full z-30 mt-2 min-w-[280px] rounded-[8px] border border-border-primary bg-bg-card p-3 shadow-[var(--shadow-card)]"
        >
          <div className="mb-2 flex items-center gap-2">
            {preview.ownerAvatarUrl ? (
              <Image
                src={preview.ownerAvatarUrl}
                alt=""
                width={20}
                height={20}
                className="rounded-[4px]"
              />
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary">
              Latest commits
            </span>
          </div>
          <ul className="space-y-1.5">
            {preview.commits.map((commit) => (
              <li key={commit.sha} className="text-[11px] leading-snug text-text-secondary">
                <span className="mr-1 font-mono text-text-tertiary">{commit.sha}</span>
                <span className="text-text-primary">{commit.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
