// V2 header — Node/01 brandmark, mono nav, live status pill, primary
// V2 CTA. Replaces the global <Header> on /v2 routes only. Static demo
// — no search wiring, no theme toggle, no auth state.

"use client";

import Link from "next/link";
import { Send, Search } from "lucide-react";
import { LogoMarkV2 } from "@/components/today-v2/primitives/LogoMarkV2";

interface HeaderV2Props {
  /** Optional live-status text shown in the right-hand pill. */
  status?: string;
  /** Optional latency badge (e.g. "14ms"). */
  latency?: string;
}

export function HeaderV2({
  status = "LIVE · EU-CENTRAL-1",
  latency = "14ms",
}: HeaderV2Props) {
  return (
    <header
      className="sticky top-0 z-40 w-full h-14 border-b backdrop-blur"
      style={{
        // One luminance step above the page canvas — gray-blue chrome
        // that reads as a distinct frame without going pure black.
        background: "rgba(22, 26, 31, 0.92)",
        borderColor: "var(--v2-line-200)",
      }}
    >
      <div className="v2-frame h-full flex items-center gap-6">
        {/* BRANDMARK — lime square logo + mono wordmark */}
        <Link
          href="/v2"
          className="flex items-center gap-2.5 group shrink-0"
          aria-label="TrendingRepo home"
        >
          {/* TrendingRepo brand mark — ascending-bars square. Wrapped in
              a subtle glow so it pops against the chrome bg without
              losing its sharp edges. */}
          <span
            aria-hidden
            className="relative inline-flex"
            style={{
              boxShadow: "0 0 12px var(--v2-acc-glow)",
            }}
          >
            <LogoMarkV2 size={20} />
          </span>

          <span className="flex flex-col leading-none">
            <span
              className="inline-flex items-center gap-2 leading-none"
              style={{
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, monospace",
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--v2-ink-100)",
              }}
            >
              <span>
                TRENDING<span style={{ color: "var(--v2-acc)" }}>REPO</span>
              </span>
              <span
                className="px-1.5 py-0.5"
                style={{
                  fontFamily:
                    "var(--font-geist-mono), ui-monospace, monospace",
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  border: "1px solid rgba(245, 110, 15, 0.4)",
                  color: "var(--v2-acc)",
                  background: "var(--v2-acc-soft)",
                  borderRadius: 1,
                }}
              >
                V2
              </span>
            </span>
            <span
              aria-hidden
              className="leading-none mt-0.5 hidden sm:inline"
              style={{
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, monospace",
                fontSize: 9,
                letterSpacing: "0.20em",
                textTransform: "uppercase",
                color: "var(--v2-ink-400)",
              }}
            >
              {"// NODE/01 · TREND MAP FOR OPEN SOURCE"}
            </span>
          </span>
        </Link>

        {/* CENTER NAV — mono uppercase links, hidden on small screens */}
        <nav
          aria-label="Primary"
          className="hidden lg:flex items-center gap-6"
        >
          {[
            { href: "/v2", label: "TODAY" },
            { href: "/top", label: "TOP" },
            { href: "/breakouts", label: "BREAKOUTS" },
            { href: "/ideas", label: "IDEAS" },
            { href: "/funding", label: "FUNDING" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="v2-mono"
              style={{
                color: "var(--v2-ink-300)",
                transition: "color 150ms ease-out",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--v2-ink-100)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--v2-ink-300)")
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* SEARCH — center-stretching, mono placeholder */}
        <div className="hidden md:flex flex-1 max-w-md mx-2">
          <div
            className="flex items-center gap-2 w-full px-3 h-9"
            style={{
              background: "var(--v2-bg-100)",
              border: "1px solid var(--v2-line-200)",
              borderRadius: 2,
            }}
          >
            <Search
              className="size-3.5 shrink-0"
              style={{ color: "var(--v2-ink-400)" }}
              aria-hidden
            />
            <span
              className="flex-1"
              style={{
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, monospace",
                fontSize: 12,
                letterSpacing: "0.04em",
                color: "var(--v2-ink-400)",
              }}
            >
              search repos...
            </span>
            <span
              aria-hidden
              className="px-1.5 py-0.5"
              style={{
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.16em",
                color: "var(--v2-ink-400)",
                border: "1px solid var(--v2-line-200)",
                borderRadius: 2,
              }}
            >
              ⌘K
            </span>
          </div>
        </div>

        {/* RIGHT — live status pill + Drop repo CTA */}
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          {/* Live status — three-dot indicator + region + latency */}
          <div
            className="hidden md:flex items-center gap-2 px-2.5 h-7"
            style={{
              background: "var(--v2-bg-050)",
              border: "1px solid var(--v2-line-100)",
              borderRadius: 2,
            }}
          >
            <span className="v2-dots" aria-hidden>
              <i
                className="live"
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  background: "var(--v2-acc)",
                  borderRadius: 1,
                  boxShadow: "0 0 8px var(--v2-acc-glow)",
                }}
              />
            </span>
            <span
              style={{
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--v2-ink-300)",
              }}
            >
              {status}
            </span>
            <span
              aria-hidden
              style={{ color: "var(--v2-line-300)", fontSize: 10 }}
            >
              ·
            </span>
            <span
              style={{
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.06em",
                color: "var(--v2-ink-100)",
              }}
            >
              {latency}
            </span>
          </div>

          <Link
            href="/submit"
            className="v2-btn v2-btn-primary"
            style={{ height: 36, padding: "0 14px" }}
            aria-label="Drop your repo"
          >
            <Send className="size-3.5" aria-hidden />
            <span className="hidden md:inline">Drop repo</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
