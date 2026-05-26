// ProfileFooter — repo-detail page footer ported from the standalone Profile
// HTML reference (ground-truth: C:/tmp/asset_e0686a47.js lines 1074-1112).
//
// 5-column grid (brand + 4 link columns) over a 1px divider; bottom row hosts
// copyright on the left and refresh status pair on the right ("next refresh in
// Nm Ns" + "updated Nm ago") derived from the page-level `fetchedAt` snapshot
// and the 60-minute cron interval.

import Image from "next/image";
import Link from "next/link";

import { Icon } from "@/components/icon/Icon";

interface ProfileFooterProps {
  /** ISO string from `getLastFetchedAt()` — anchors the "updated Xm ago" and
   * "next refresh in Xm Ys" copy. null when the data store has never refreshed
   * (cold worker or first-deploy bundled-JSON fallback). */
  fetchedAt: string | null;
}

/** Cron cadence (minutes) the worker honours for trending/profile refresh. */
const REFRESH_INTERVAL_MIN = 60;

interface RefreshStatus {
  updatedLabel: string;
  nextLabel: string;
}

function deriveRefreshStatus(fetchedAt: string | null, nowMs: number): RefreshStatus {
  if (!fetchedAt) {
    return { updatedLabel: "—", nextLabel: "—" };
  }
  const fetchedMs = Date.parse(fetchedAt);
  if (!Number.isFinite(fetchedMs)) {
    return { updatedLabel: "—", nextLabel: "—" };
  }

  const elapsedSec = Math.max(0, Math.floor((nowMs - fetchedMs) / 1000));
  const elapsedMin = Math.floor(elapsedSec / 60);

  const intervalSec = REFRESH_INTERVAL_MIN * 60;
  const remainingSec = Math.max(0, intervalSec - elapsedSec);
  const remMin = Math.floor(remainingSec / 60);
  const remSec = remainingSec % 60;

  return {
    updatedLabel:
      elapsedMin <= 0
        ? `${elapsedSec}s ago`
        : elapsedMin < 60
          ? `${elapsedMin}m ago`
          : `${Math.floor(elapsedMin / 60)}h ago`,
    nextLabel: `${remMin}m ${remSec.toString().padStart(2, "0")}s`,
  };
}

export function ProfileFooter({ fetchedAt }: ProfileFooterProps) {
  // Compute at render-time on the server. The page is `force-dynamic`, so each
  // request gets a fresh status; no client-side ticker (the value drifts at
  // most by request duration, which is acceptable for a footer chrome).
  const status = deriveRefreshStatus(fetchedAt, Date.now());

  return (
    <footer className="footer" aria-label="Profile footer">
      <div className="footer-inner">
        <div className="brand-block">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Image
              src="/brand/trendingrepo-mark.svg"
              alt=""
              width={24}
              height={24}
              aria-hidden
            />
            <div className="sidebar-name" style={{ fontSize: 14 }}>
              trending<span className="dot">.</span>repo
            </div>
          </div>
          <p className="brand-tag">
            Profile view · cross-source signals · narrative synthesis from{" "}
            <Link href="https://aiso.tools" style={{ color: "var(--info)" }}>
              aiso.tools
            </Link>
            .
          </p>
        </div>
        <nav aria-label="Profile" className="footer-nav">
          <h5>{"// PROFILE"}</h5>
          <Link href="#comments">Comments</Link>
          <Link href="/tools/watchlist">Watchlist</Link>
          <Link href="/tools/compare">Compare</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <nav aria-label="Partner" className="footer-nav">
          <h5>{"// PARTNER"}</h5>
          <Link
            href="https://aiso.tools"
            target="_blank"
            rel="noopener"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            aiso.tools <Icon name="arrow-up-right" size="xs" aria-hidden />
          </Link>
        </nav>
      </div>
      <div className="footer-bottom">
        <div>© 2026 trendingrepo · profile v1 · narrative by aiso.tools</div>
        <div style={{ display: "flex", gap: 18 }}>
          <span>
            next refresh in{" "}
            <span style={{ color: "var(--text)" }}>{status.nextLabel}</span>
          </span>
          <span>
            updated{" "}
            <span style={{ color: "var(--text)" }}>{status.updatedLabel}</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
