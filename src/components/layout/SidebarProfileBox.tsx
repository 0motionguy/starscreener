"use client";

/**
 * SidebarProfileBox — V2 industrial profile card for the desktop rail.
 *
 * Replaces the older `LaunchpadStrip` with a richer 3-section card:
 *   • Head row    — monogram avatar + handle + tier/level
 *   • Stats row   — watch / alerts / drops counts
 *   • Access tiles — AGENT / CLI / MCP deep-links
 *
 * Anonymous users render NOTHING (`return null`). The calling Sidebar
 * is expected to handle the un-authed fallback (e.g. a sign-in CTA).
 *
 * The display-only session check uses the shared client session source
 * so the rail and header do not duplicate `/api/auth/session` requests.
 *
 * Tier ("MEMBER · LVL 1") is hard-coded for now — the project does not
 * yet have a tier system. Wire to real data when it lands.
 */

import Link from "next/link";
import { useClientSession } from "@/components/layout/useClientSession";

interface SidebarProfileBoxProps {
  watchCount: number;
  alertCount: number;
  /** Reserved for future "drops" metric. Pass 0 until wired. */
  dropCount: number;
}

/** Public IDs look like `a_xxx` / `u_xxx`. Strip the prefix, lowercase, cap at 8. */
function shortHandle(userId: string): string {
  return userId.replace(/^[au]_/, "").slice(0, 8).toLowerCase();
}

/** Two-letter monogram from the handle. */
function monogram(handle: string): string {
  if (!handle) return "??";
  return handle.slice(0, 2).toUpperCase();
}

/** SVG icons for the access tile row — kept inline per design spec. */
function AgentIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x={3} y={4} width={10} height={8} rx={1} />
      <circle cx={6} cy={8} r={0.8} fill="currentColor" />
      <circle cx={10} cy={8} r={0.8} fill="currentColor" />
      <path d="M8 4 V2" strokeLinecap="round" />
    </svg>
  );
}

function CliIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 5 L6 8 L3 11" />
      <path d="M8 11 H13" />
    </svg>
  );
}

function McpIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12 L6 5 L8 9 L10 5 L13 12" />
    </svg>
  );
}

export function SidebarProfileBox({
  watchCount,
  alertCount,
  dropCount,
}: SidebarProfileBoxProps) {
  const { userId } = useClientSession();

  // Anonymous: render nothing — the parent decides the fallback UI.
  if (!userId) return null;

  const handle = shortHandle(userId);

  return (
    <div className="sb-profile" data-component="sidebar-profile">
      <div className="sb-prof-head">
        <div className="sb-prof-av" aria-hidden>
          {monogram(handle)}
        </div>
        <div className="sb-prof-who">
          <span className="sb-prof-name">{handle}</span>
          <span className="sb-prof-meta">
            <span className="pro">PRO</span> · LVL 12
          </span>
        </div>
      </div>

      <div className="sb-prof-stats" role="group" aria-label="Profile stats">
        <div>
          <div className="v">{watchCount}</div>
          <div className="l">watch</div>
        </div>
        <div>
          <div className="v">{alertCount}</div>
          <div className="l">alerts</div>
        </div>
        <div>
          <div className="v">{dropCount}</div>
          <div className="l">drops</div>
        </div>
      </div>

      <nav className="sb-access" aria-label="Quick access">
        <Link className="a" href="/portal/docs" title="Agent">
          <AgentIcon />
          AGENT
        </Link>
        <Link className="a" href="/cli" title="CLI">
          <CliIcon />
          CLI
        </Link>
        <Link className="a" href="/portal/docs" title="MCP">
          <McpIcon />
          MCP
        </Link>
      </nav>
    </div>
  );
}
