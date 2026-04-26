// V2 sidebar — Node/01 industrial rail. Static demo data so the design
// reads at a glance without depending on the runtime sidebar fetch.
//
// Sections are laid out as terminal blocks: each has a `// LABEL` header
// row, hairline divider, and rows with mono labels left + tabular-num
// counts right. The currently-active row gets bracket markers.

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMarkV2 } from "@/components/today-v2/primitives/LogoMarkV2";
import {
  TrendingUp,
  Rocket,
  Sparkles,
  Trophy,
  Bot,
  MessagesSquare,
  Newspaper,
  Hash,
  DollarSign,
  Coins,
  Calendar,
  Package,
  Lightbulb,
  Bookmark,
  Layers,
  Bell,
  Brain,
  Code2,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BarcodeTicker } from "@/components/today-v2/primitives/BarcodeTicker";
import { ThemePickerV2 } from "@/components/today-v2/ThemePickerV2";
import { cn } from "@/lib/utils";

interface SidebarRow {
  href: string;
  label: string;
  /** Right-aligned count or status. */
  meta?: string;
  /** Optional Lucide icon. */
  icon?: LucideIcon;
  /** Status tone for the meta value. */
  metaTone?: "default" | "accent" | "green";
}

interface SidebarSectionDef {
  /** Eyebrow label, rendered as `// LABEL` mono. */
  label: string;
  rows: SidebarRow[];
}

// Static demo data — counts hand-tuned to look believable on the screenshot.
// Real wiring would come from /api/pipeline/sidebar-data, but the V2 demo
// is design-only.
const SECTIONS: SidebarSectionDef[] = [
  {
    label: "REPOS · TERMINAL",
    rows: [
      { href: "/", label: "Trending", meta: "853", icon: TrendingUp, metaTone: "accent" },
      { href: "/breakouts", label: "Breakouts", meta: "3", icon: Rocket, metaTone: "accent" },
      { href: "/top", label: "Top 100", meta: "100", icon: Trophy },
      { href: "/agent-repos", label: "Agent Repos", meta: "242", icon: Bot },
      { href: "/compare", label: "Compare", meta: "—", icon: Layers, metaTone: "accent" },
    ],
  },
  {
    label: "NEWS · TERMINAL",
    rows: [
      { href: "/news", label: "Market Signals", meta: "all", icon: Layers, metaTone: "accent" },
      { href: "/hackernews/trending", label: "HackerNews", meta: "+12", icon: Newspaper, metaTone: "green" },
      { href: "/lobsters", label: "Lobsters", meta: "+2", icon: Newspaper, metaTone: "green" },
      { href: "/devto", label: "Dev.to", meta: "+3", icon: Newspaper, metaTone: "green" },
      { href: "/bluesky", label: "Bluesky", meta: "+8", icon: Hash, metaTone: "green" },
      { href: "/reddit", label: "Reddit", meta: "+24", icon: MessagesSquare, metaTone: "green" },
      { href: "/twitter", label: "X / Twitter", meta: "+71", icon: Hash, metaTone: "green" },
      { href: "/producthunt", label: "ProductHunt", meta: "+5", icon: Sparkles, metaTone: "green" },
    ],
  },
  {
    label: "AI · TOOLING",
    rows: [
      { href: "/v2/news/claude-code", label: "Claude Code", meta: "+5", icon: Brain, metaTone: "accent" },
      { href: "/v2/news/codex", label: "Codex", meta: "+3", icon: Code2, metaTone: "accent" },
      { href: "/v2/news/perplexity", label: "Perplexity", meta: "+2", icon: Search, metaTone: "accent" },
    ],
  },
  {
    label: "FUNDING · TERMINAL",
    rows: [
      { href: "/funding", label: "Funding Radar", meta: "12", icon: DollarSign, metaTone: "accent" },
      { href: "/revenue", label: "Revenue", meta: "47", icon: Coins },
      { href: "/hackathons", label: "Hackathons", meta: "soon", icon: Calendar, metaTone: "default" },
    ],
  },
  {
    label: "PACKAGES",
    rows: [
      { href: "/npm", label: "NPM Packages", meta: "1.2k", icon: Package },
    ],
  },
  {
    label: "LENSES",
    rows: [
      { href: "/cross-signal", label: "Cross-Signal Breakouts", meta: "5", icon: Layers },
      { href: "/watchlist", label: "Watchlist", meta: "—", icon: Bookmark },
      { href: "/ideas", label: "Ideas", meta: "0", icon: Lightbulb, metaTone: "accent" },
    ],
  },
];

export function SidebarV2() {
  const pathname = usePathname() ?? "/v2";

  return (
    <aside
      className="hidden md:flex md:flex-col w-[280px] sticky top-14 border-r"
      style={{
        height: "calc(100vh - 56px)",
        borderColor: "var(--v2-line-200)",
        // Match the header chrome — gray-blue, slightly raised off the page.
        background: "rgba(22, 26, 31, 0.92)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Top status block — system identity */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "var(--v2-line-100)" }}
      >
        <span
          className="v2-mono inline-flex items-center gap-2"
          style={{ color: "var(--v2-ink-300)" }}
        >
          <LogoMarkV2 size={12} />
          {"// TRENDINGREPO"}
        </span>
        <span
          className="v2-mono"
          style={{ color: "var(--v2-ink-400)", fontSize: 10 }}
        >
          v0.1.0
        </span>
      </div>

      {/* Scrolling section list */}
      <CursorFollowNav>
        {SECTIONS.map((section) => (
          <SidebarSection
            key={section.label}
            section={section}
            pathname={pathname}
          />
        ))}

        {/* Alerts row — single button, accent tone */}
        <div className="pt-4 border-t" style={{ borderColor: "var(--v2-line-100)" }}>
          <Link
            href="/alerts"
            className="v2-card v2-card-hover flex items-center gap-2 px-3 py-2.5"
          >
            <Bell
              className="size-3.5 shrink-0"
              style={{ color: "var(--v2-acc)" }}
              aria-hidden
            />
            <span
              className="v2-mono flex-1"
              style={{ color: "var(--v2-ink-200)" }}
            >
              ALERTS
            </span>
            <span
              className="v2-mono tabular-nums"
              style={{ color: "var(--v2-acc)" }}
            >
              3
            </span>
          </Link>
        </div>
      </CursorFollowNav>

      {/* Theme picker — 5 accent swatches. Sits above the barcode so it's
          the last thing the user sees before the system signature. */}
      <div
        className="px-3 py-3 border-t"
        style={{ borderColor: "var(--v2-line-100)" }}
      >
        <ThemePickerV2 />
      </div>

      {/* Footer — barcode ticker as system signature */}
      <div
        className="px-3 py-3 border-t"
        style={{ borderColor: "var(--v2-line-100)" }}
      >
        <BarcodeTicker
          left="// LIVE"
          middle="EU-1"
          right="853/2.2k"
          bars={18}
        />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// CursorFollowNav — wraps the scrolling section list and renders a glowing
// pill that tracks the cursor's Y position. Theme-colored when in motion,
// dimmed white when settled (hover briefly stationary).
//
// The highlight is rendered as a 36px-tall absolutely-positioned div that
// follows mouseY with a CSS transition, so the motion feels smooth without
// rAF. Fades to opacity 0 when the mouse leaves the nav.
// ---------------------------------------------------------------------------

function CursorFollowNav({ children }: { children: React.ReactNode }) {
  const navRef = useRef<HTMLElement | null>(null);
  const [highlight, setHighlight] = useState<{
    y: number;
    visible: boolean;
    moving: boolean;
  }>({ y: 0, visible: false, moving: false });
  const movingTimer = useRef<number | null>(null);

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = navRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top + (navRef.current?.scrollTop ?? 0);
    setHighlight((h) => ({ ...h, y, visible: true, moving: true }));
    // Reset the "moving" flag after a short pause so the highlight
    // shifts from theme-colored (in motion) to white-tinted (settled).
    if (movingTimer.current) window.clearTimeout(movingTimer.current);
    movingTimer.current = window.setTimeout(() => {
      setHighlight((h) => ({ ...h, moving: false }));
    }, 180);
  };

  const onLeave = () => {
    setHighlight((h) => ({ ...h, visible: false, moving: false }));
    if (movingTimer.current) {
      window.clearTimeout(movingTimer.current);
      movingTimer.current = null;
    }
  };

  return (
    <nav
      ref={navRef}
      aria-label="Sidebar"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="relative flex-1 overflow-y-auto px-3 py-3 space-y-5 scrollbar-hide"
    >
      {/* Cursor-following highlight pill — purely decorative, doesn't
          intercept clicks. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-3 right-3"
        style={{
          top: highlight.y - 18, // center on cursor (36px tall / 2)
          height: 36,
          background: highlight.moving
            ? "var(--v2-acc-soft)"
            : "rgba(255, 255, 255, 0.05)",
          border: highlight.moving
            ? "1px solid var(--v2-acc)"
            : "1px solid rgba(255, 255, 255, 0.10)",
          boxShadow: highlight.moving
            ? "0 0 16px var(--v2-acc-glow)"
            : "none",
          borderRadius: 1,
          opacity: highlight.visible ? 1 : 0,
          transition:
            "top 120ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms ease-out, background-color 180ms ease-out, border-color 180ms ease-out, box-shadow 180ms ease-out",
          zIndex: 0,
        }}
      />
      {/* Children sit above the highlight so it doesn't cover the text. */}
      <div className="relative" style={{ zIndex: 1 }}>
        {children}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Section block — eyebrow label + rows. Active row gets bracket markers.
// ---------------------------------------------------------------------------

function SidebarSection({
  section,
  pathname,
}: {
  section: SidebarSectionDef;
  pathname: string;
}) {
  return (
    <div>
      <div
        className="flex items-center justify-between px-2 mb-2"
        style={{ borderBottom: "1px dashed var(--v2-line-200)", paddingBottom: 4 }}
      >
        <span
          className="v2-mono"
          style={{ color: "var(--v2-ink-400)", fontSize: 9 }}
        >
          {`// ${section.label}`}
        </span>
        <span
          aria-hidden
          className="v2-mono tabular-nums"
          style={{ color: "var(--v2-ink-500)", fontSize: 9 }}
        >
          {String(section.rows.length).padStart(2, "0")}
        </span>
      </div>

      <ul className="space-y-0.5">
        {section.rows.map((row) => {
          const active = pathname === row.href;
          return (
            <li key={row.href}>
              <SidebarItem row={row} active={Boolean(active)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SidebarItem({ row, active }: { row: SidebarRow; active: boolean }) {
  const Icon = row.icon;
  const metaColor =
    row.metaTone === "accent"
      ? "var(--v2-acc)"
      : row.metaTone === "green"
        ? "var(--v2-sig-green)"
        : "var(--v2-ink-400)";

  return (
    <Link
      href={row.href}
      className={cn(
        "relative flex items-center gap-2.5 px-2 py-1.5 group",
        active && "v2-bracket",
      )}
      style={{
        background: active ? "var(--v2-bg-100)" : "transparent",
        border: active
          ? "1px solid var(--v2-line-200)"
          : "1px solid transparent",
        borderRadius: 1,
        transition: "background-color 120ms ease-out, border-color 120ms ease-out",
      }}
    >
      {active ? (
        <>
          <span aria-hidden className="v2-br1" />
          <span aria-hidden className="v2-br2" />
        </>
      ) : null}

      {Icon ? (
        <Icon
          className="size-3.5 shrink-0"
          style={{
            color: active ? "var(--v2-acc)" : "var(--v2-ink-400)",
          }}
          aria-hidden
        />
      ) : null}

      <span
        className="flex-1 truncate"
        style={{
          fontFamily: "var(--font-geist), Inter, sans-serif",
          fontWeight: active ? 510 : 400,
          fontSize: 13,
          letterSpacing: "-0.005em",
          color: active ? "var(--v2-ink-000)" : "var(--v2-ink-200)",
        }}
      >
        {row.label}
      </span>

      {row.meta ? (
        <span
          className="v2-mono tabular-nums shrink-0"
          style={{ color: metaColor, fontSize: 10 }}
        >
          {row.meta}
        </span>
      ) : null}
    </Link>
  );
}
