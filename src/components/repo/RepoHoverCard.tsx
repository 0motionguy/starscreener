"use client";

/**
 * RepoHoverCard — the floating preview that appears next to a repo link
 * on hover. Renders into a portal at document.body so the card escapes
 * any overflow:hidden ancestor (tables, sidebars, cards).
 *
 * Data:
 *   - Slim summary fetched from /api/repos/<owner>/<name>/hover (~500B).
 *   - Cached aggressively at the edge; hovering 20 different repos in a
 *     row is cheap and quiet.
 *
 * Positioning:
 *   - Anchored to a DOMRect supplied by the caller (the link's bounding
 *     rect). Card prefers `below` placement; if it would overflow the
 *     viewport, flips to `above` automatically.
 *   - 14px gap between anchor and card, viewport-clamped 8px from both
 *     edges so cards never bleed off-screen.
 *
 * A11y:
 *   - Decorative — the card mirrors data already accessible by clicking
 *     through. Marked aria-hidden on the portal root.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoDisplayLogoUrl } from "@/lib/logos";
import { cn, formatNumber } from "@/lib/utils";

export interface RepoHoverCardAnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RepoHoverCardData {
  fullName: string;
  owner: string;
  name: string;
  ownerAvatarUrl: string;
  description: string;
  language: string | null;
  stars: number;
  starsDelta7d: number;
  trendScore7d: number | null;
  categoryId: string;
}

export interface RepoHoverCardProps {
  anchorRect: RepoHoverCardAnchorRect;
  data: RepoHoverCardData | null;
  loading: boolean;
  error: boolean;
  /** Width of the card. Default 280. */
  width?: number;
}

const CARD_WIDTH_DEFAULT = 280;
const CARD_GAP = 14;
const VIEWPORT_MARGIN = 8;

interface Position {
  left: number;
  top: number;
}

function computePosition(
  anchor: RepoHoverCardAnchorRect,
  cardWidth: number,
  cardHeight: number,
  viewport: { width: number; height: number },
): Position {
  const anchorCenter = anchor.left + anchor.width / 2;
  let left = anchorCenter - cardWidth / 2;
  left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(left, viewport.width - cardWidth - VIEWPORT_MARGIN),
  );

  const below = anchor.top + anchor.height + CARD_GAP;
  const above = anchor.top - cardHeight - CARD_GAP;
  const wouldOverflowBottom = below + cardHeight > viewport.height - VIEWPORT_MARGIN;
  const top = wouldOverflowBottom && above >= VIEWPORT_MARGIN ? above : below;

  return { left, top };
}

export function RepoHoverCard({
  anchorRect,
  data,
  loading,
  error,
  width = CARD_WIDTH_DEFAULT,
}: RepoHoverCardProps) {
  const [mounted, setMounted] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [cardHeight, setCardHeight] = useState(120);

  useEffect(() => {
    setMounted(true);
    function refresh() {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }
    refresh();
    window.addEventListener("resize", refresh);
    return () => window.removeEventListener("resize", refresh);
  }, []);

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setCardHeight(node.offsetHeight);
  }, []);

  const position = useMemo(() => {
    if (!viewport.width || !viewport.height) {
      return { left: anchorRect.left, top: anchorRect.top + anchorRect.height + CARD_GAP };
    }
    return computePosition(anchorRect, width, cardHeight, viewport);
  }, [anchorRect, cardHeight, viewport, width]);

  if (!mounted) return null;

  return createPortal(
    <motion.div
      ref={measureRef}
      aria-hidden
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        width,
        zIndex: 9999,
        pointerEvents: "none",
      }}
      className={cn(
        "rounded-sm border shadow-popover",
      )}
    >
      <div
        style={{
          background: "var(--v4-bg-050, var(--bg-card, #0c0c10))",
          border: "1px solid var(--v4-line-200, var(--border-primary, #2a2a30))",
          padding: 12,
          borderRadius: 2,
        }}
      >
        {loading || !data ? (
          <RepoHoverCardSkeleton />
        ) : error ? (
          <RepoHoverCardError />
        ) : (
          <RepoHoverCardBody data={data} />
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

function RepoHoverCardBody({ data }: { data: RepoHoverCardData }) {
  const delta = data.starsDelta7d;
  const deltaColor =
    delta > 0
      ? "var(--v4-money, #22c55e)"
      : delta < 0
        ? "var(--v4-red, #ef4444)"
        : "var(--v4-ink-400, #6b7280)";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <EntityLogo
          src={repoDisplayLogoUrl(data.fullName, data.ownerAvatarUrl, 28)}
          name={data.fullName}
          size={28}
          shape="square"
          alt=""
        />
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[13px] font-semibold"
            style={{ color: "var(--ink-100, #f3f4f6)" }}
            title={data.fullName}
          >
            {data.fullName}
          </div>
          {data.language ? (
            <div
              className="font-mono text-[10px] uppercase tracking-[0.12em]"
              style={{ color: "var(--ink-400, #6b7280)" }}
            >
              {data.language}
            </div>
          ) : null}
        </div>
      </div>

      {data.description ? (
        <p
          className="line-clamp-2 text-[11.5px] leading-snug"
          style={{ color: "var(--ink-300, #9ca3af)" }}
        >
          {data.description}
        </p>
      ) : null}

      <div
        className="flex items-center gap-3 border-t pt-2 font-mono text-[10px] uppercase tracking-[0.14em]"
        style={{ borderColor: "var(--v4-line-100, #1e1e22)" }}
      >
        <span style={{ color: "var(--ink-300, #9ca3af)" }}>
          ★ {formatNumber(data.stars)}
        </span>
        <span style={{ color: deltaColor }}>
          {delta > 0 ? "+" : ""}
          {formatNumber(delta)} / 7d
        </span>
        {data.trendScore7d !== null ? (
          <span style={{ color: "var(--v3-acc, #fb923c)" }} className="ml-auto">
            T7 {data.trendScore7d.toFixed(0)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RepoHoverCardSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="flex items-center gap-2">
        <div
          className="h-7 w-7 rounded-sm"
          style={{ background: "var(--v4-line-100, #1e1e22)" }}
        />
        <div className="flex-1 space-y-1.5">
          <div
            className="h-2.5 w-2/3 rounded-sm"
            style={{ background: "var(--v4-line-100, #1e1e22)" }}
          />
          <div
            className="h-2 w-1/3 rounded-sm"
            style={{ background: "var(--v4-line-100, #1e1e22)" }}
          />
        </div>
      </div>
      <div
        className="h-7 rounded-sm"
        style={{ background: "var(--v4-line-100, #1e1e22)" }}
      />
    </div>
  );
}

function RepoHoverCardError() {
  return (
    <div
      className="font-mono text-[10px] uppercase tracking-[0.14em]"
      style={{ color: "var(--ink-400, #6b7280)" }}
    >
      Preview unavailable
    </div>
  );
}

/**
 * Ergonomic wrapper that pairs RepoHoverCard with AnimatePresence so the
 * exit animation runs when the parent unmounts the card.
 */
export function RepoHoverCardPresence(
  props: RepoHoverCardProps & { open: boolean },
) {
  const { open, ...rest } = props;
  return (
    <AnimatePresence>
      {open ? <RepoHoverCard key="rhc" {...rest} /> : null}
    </AnimatePresence>
  );
}

// Test seam — pure function exposed so positioning logic can be unit-tested
// without rendering the card.
export const __test = { computePosition };
