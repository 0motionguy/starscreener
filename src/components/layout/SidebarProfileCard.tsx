"use client";

/**
 * SidebarProfileCard — post-signup identity strip + 6-tile launcher.
 * Anonymous users get nothing (no Clerk → tree returns null). Signed-in
 * users get a beta-brand eyebrow, monogram avatar, handle, tier badge,
 * and a 3×2 grid linking to WATCH / ALERTS / DROPS / AGENT / CLI / MCP.
 *
 * Wiring:
 *   - Handle + avatar come from Clerk `useUser()`.
 *   - WATCH count → `useWatchlistStore` (already populated client-side).
 *   - ALERTS count → `useSidebarOverlayStore.unreadAlerts` (fetched by the
 *     existing SidebarUserOverlayBridge on layout mount — we piggyback
 *     instead of issuing a duplicate request).
 *   - DROPS count → 0 stub. `/api/me/submissions/count` does not exist
 *     yet; surfaces as a follow-up.
 *   - AGENT / CLI / MCP tiles are link-only (no counts).
 *
 * Mounted between the sidebar's `<CursorRail>` content and `<SidebarFooter>`,
 * so it sits just above the footer chrome on every page that shows the
 * sidebar.
 */
import { useUser } from "@clerk/nextjs";

import { useWatchlistStore } from "@/lib/store";
import { useSidebarOverlayStore } from "./SidebarUserOverlayBridge";
import { SidebarProfileTile } from "./SidebarProfileTile";

const CLERK_PUBLIC_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function avatarInitials(input: string): string {
  const cleaned = input.replace(/^user_/, "").trim();
  if (!cleaned) return "AC";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export function SidebarProfileCard() {
  if (!CLERK_PUBLIC_KEY) return null;
  return <SidebarProfileCardInner />;
}

function SidebarProfileCardInner() {
  const { isLoaded, isSignedIn, user } = useUser();
  const watchCount = useWatchlistStore((s) => s.repos.length);
  const unreadAlerts = useSidebarOverlayStore((s) => s.unreadAlerts);

  // First paint: render a skeleton so we don't flash the unauthenticated
  // empty state in front of an actually-signed-in user. Reads from Clerk
  // settle within a couple of frames in practice.
  if (!isLoaded) {
    return <SidebarProfileCardSkeleton />;
  }

  if (!isSignedIn || !user) {
    return null;
  }

  const handle =
    user.username ||
    user.firstName ||
    user.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "you";
  const initials = avatarInitials(user.fullName || handle);

  return (
    <div
      className="shrink-0 space-y-2 border-t px-3 py-3"
      style={{ borderColor: "var(--v4-line-100)" }}
    >
      <div
        className="font-mono text-[9px] uppercase tracking-[0.18em]"
        style={{ color: "var(--ink-400)" }}
      >
        TRENDINGREPO BETA{" "}
        <span style={{ color: "var(--v3-acc)" }}>/ // OPEN SOURCE · LIVE</span>
      </div>

      <div className="flex items-center gap-2">
        <div
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-sm text-[11px] font-semibold"
          style={{
            background: "var(--v4-acc-soft)",
            color: "var(--v3-acc)",
            border: "1px solid var(--v4-line-100)",
          }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[12px] font-medium"
            style={{ color: "var(--ink-100)" }}
            title={handle}
          >
            {handle}
          </div>
          <div
            className="font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: "var(--ink-400)" }}
          >
            PRO · LVL 12
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <SidebarProfileTile label="WATCH" href="/watchlist" count={watchCount} />
        <SidebarProfileTile
          label="ALERTS"
          href="/you/alerts"
          count={unreadAlerts}
        />
        <SidebarProfileTile label="DROPS" href="/submit" count={0} />
        <SidebarProfileTile label="AGENT" href="/agent-commerce" />
        <SidebarProfileTile label="CLI" href="/cli" />
        <SidebarProfileTile label="MCP" href="/mcp" />
      </div>
    </div>
  );
}

function SidebarProfileCardSkeleton() {
  return (
    <div
      aria-hidden
      className="shrink-0 space-y-2 border-t px-3 py-3"
      style={{ borderColor: "var(--v4-line-100)" }}
    >
      <div
        className="h-2 w-2/3 rounded-sm"
        style={{ background: "var(--v4-line-100)" }}
      />
      <div className="flex items-center gap-2">
        <div
          className="h-8 w-8 rounded-sm"
          style={{ background: "var(--v4-line-100)" }}
        />
        <div className="flex-1 space-y-1.5">
          <div
            className="h-2.5 w-1/2 rounded-sm"
            style={{ background: "var(--v4-line-100)" }}
          />
          <div
            className="h-2 w-1/3 rounded-sm"
            style={{ background: "var(--v4-line-100)" }}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-10 rounded-sm"
            style={{ background: "var(--v4-line-100)" }}
          />
        ))}
      </div>
    </div>
  );
}
