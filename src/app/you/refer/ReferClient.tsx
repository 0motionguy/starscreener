"use client";

// /you/refer — interactive surface (Chunk G).
//
// Hero + live counts + share box + recent referrals + leaderboard opt-in.
// Initial state is hydrated server-side via /you/refer/page.tsx; we only
// re-fetch when the user toggles the leaderboard preference (so the live
// numbers stay accurate on a single tab without a polling timer).
//
// v3 design tokens — mirrors the look of `/admin` (AdminDashboard.tsx).

import Link from "next/link";
import { useCallback, useState } from "react";

import { defaultShareText } from "@/lib/referrals/share-text";
import { toast } from "@/lib/toast";

interface Counts {
  clicks: number;
  signups: number;
  qualified: number;
}

interface RecentReferral {
  id: string;
  handle: string | null;
  status: "qualified" | "signed_up" | "clicked";
  timestamp: string;
}

interface ReferClientProps {
  handle: string;
  code: string;
  counts: Counts;
  recentReferrals: RecentReferral[];
  publicLeaderboardOptin: boolean;
  referralCredits: number;
}

const REFER_BASE_URL = "https://trendingrepo.com";

function buildReferralUrl(code: string): string {
  return `${REFER_BASE_URL}?ref=${encodeURIComponent(code)}`;
}

function buildXShareUrl(handle: string, code: string): string {
  const text = defaultShareText(handle, code);
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

function buildEmbedSnippet(code: string): string {
  const url = buildReferralUrl(code);
  return `<a href="${url}">Try TrendingRepo</a>`;
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

function statusLabel(s: RecentReferral["status"]): {
  label: string;
  color: string;
} {
  if (s === "qualified") {
    return { label: "QUALIFIED", color: "var(--v3-sig-green)" };
  }
  if (s === "signed_up") {
    return { label: "SIGNED UP", color: "var(--v3-acc)" };
  }
  return { label: "CLICKED", color: "var(--v3-ink-300)" };
}

export default function ReferClient(props: ReferClientProps) {
  const {
    handle,
    code,
    counts: initialCounts,
    recentReferrals,
    publicLeaderboardOptin: initialOptin,
    referralCredits,
  } = props;

  const [counts] = useState(initialCounts);
  const [optin, setOptin] = useState(initialOptin);
  const [optinBusy, setOptinBusy] = useState(false);

  const referralUrl = buildReferralUrl(code);
  const xShareUrl = buildXShareUrl(handle, code);
  const embedSnippet = buildEmbedSnippet(code);

  const copy = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed — select and copy manually");
    }
  }, []);

  const togglePublicLeaderboard = useCallback(
    async (next: boolean) => {
      setOptin(next);
      setOptinBusy(true);
      try {
        const res = await fetch("/api/referrals/me", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicLeaderboardOptin: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success(
          next
            ? "Showing on public leaderboard"
            : "Hidden from public leaderboard",
        );
      } catch (err) {
        // Roll back optimistic flip.
        setOptin((prev) => !prev);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Update failed: ${msg}`);
      } finally {
        setOptinBusy(false);
      }
    },
    [],
  );

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[960px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <header
          className="mb-6 pb-4 space-y-3"
          style={{ borderBottom: "1px solid var(--v2-line-std)" }}
        >
          <div
            className="flex items-center justify-between gap-3 pb-1"
            style={{ borderBottom: "1px solid var(--v2-line-std)" }}
          >
            <span
              className="v2-mono"
              style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
            >
              {"// 02 · YOU · REFER · BADGES + EARLY ACCESS"}
            </span>
            <span
              className="v2-mono v2-stat tabular-nums"
              style={{ fontSize: 10, color: "var(--v2-ink-300)" }}
            >
              <span className="v2-live-dot mr-2 inline-block" aria-hidden />
              CREDITS {String(referralCredits).padStart(2, "0")}
            </span>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1
                style={{
                  fontFamily: "var(--font-geist), Inter, sans-serif",
                  fontSize: "clamp(24px, 3vw, 32px)",
                  fontWeight: 510,
                  letterSpacing: "-0.022em",
                  color: "var(--v2-ink-000)",
                  lineHeight: 1.1,
                }}
              >
                Invite friends, earn badges + early access
              </h1>
              <p
                className="mt-2 max-w-[640px] leading-relaxed"
                style={{ fontSize: 14, color: "var(--v2-ink-200)" }}
              >
                Build status badges by inviting friends; rewards come from
                recognition + early access, not cash.
              </p>
            </div>
          </div>
        </header>

        {/* Live counts */}
        <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CountTile label="Clicks" value={counts.clicks} kind="ink" />
          <CountTile label="Signups" value={counts.signups} kind="acc" />
          <CountTile
            label="Qualified"
            value={counts.qualified}
            kind="green"
            note="≥24h after signup"
          />
        </section>

        {/* Share box */}
        <section
          className="mb-4 rounded-[2px]"
          style={{
            background: "var(--v3-bg-050)",
            border: "1px solid var(--v3-line-200)",
          }}
        >
          <div
            className="flex items-center justify-between gap-3 px-3 py-2"
            style={{
              background: "var(--v3-bg-025)",
              borderBottom: "1px solid var(--v3-line-100)",
            }}
          >
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
              <span
                aria-hidden
                className="inline-block"
                style={{
                  width: 6,
                  height: 6,
                  background: "var(--v3-acc)",
                  borderRadius: 1,
                }}
              />
              <span style={{ color: "var(--v3-ink-300)" }}>
                {"// SHARE LINK"}
              </span>
            </span>
            <span
              className="font-mono text-[10px] tracking-[0.14em]"
              style={{ color: "var(--v3-ink-400)" }}
            >
              CODE {code.toUpperCase()}
            </span>
          </div>

          <div className="p-4 space-y-3">
            <ShareLineRow
              label="URL"
              value={referralUrl}
              onCopy={() => copy("URL", referralUrl)}
            />
            <ShareLineRow
              label="EMBED"
              value={embedSnippet}
              onCopy={() => copy("Embed", embedSnippet)}
              monospace
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void copy("URL", referralUrl)}
                className="inline-flex items-center rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors"
                style={{
                  background: "var(--v3-acc-soft)",
                  border: "1px solid var(--v3-acc-dim)",
                  color: "var(--v3-acc)",
                  fontWeight: 500,
                }}
              >
                COPY LINK
              </button>
              <a
                href={xShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors"
                style={{
                  background: "var(--v3-bg-025)",
                  border: "1px solid var(--v3-line-200)",
                  color: "var(--v3-ink-100)",
                  fontWeight: 500,
                }}
              >
                SHARE ON X →
              </a>
              <Link
                href="/refer/leaderboard"
                className="inline-flex items-center rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors"
                style={{
                  background: "transparent",
                  border: "1px solid var(--v3-line-200)",
                  color: "var(--v3-ink-300)",
                }}
              >
                VIEW LEADERBOARD →
              </Link>
            </div>
          </div>
        </section>

        {/* Recent referrals */}
        <section
          className="mb-4 rounded-[2px]"
          style={{
            background: "var(--v3-bg-050)",
            border: "1px solid var(--v3-line-200)",
          }}
        >
          <div
            className="flex items-center justify-between gap-3 px-3 py-2"
            style={{
              background: "var(--v3-bg-025)",
              borderBottom: "1px solid var(--v3-line-100)",
            }}
          >
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
              <span
                aria-hidden
                className="inline-block"
                style={{
                  width: 6,
                  height: 6,
                  background:
                    recentReferrals.length === 0
                      ? "var(--v3-line-200)"
                      : "var(--v3-sig-green)",
                  borderRadius: 1,
                }}
              />
              <span style={{ color: "var(--v3-ink-300)" }}>
                {"// RECENT REFERRALS"}
              </span>
            </span>
            <span
              className="font-mono text-[10px] tabular-nums tracking-[0.14em]"
              style={{ color: "var(--v3-ink-400)" }}
            >
              SHOWING {recentReferrals.length} OF LAST 10
            </span>
          </div>

          <div className="p-4">
            {recentReferrals.length === 0 ? (
              <p
                className="font-mono text-[11px] uppercase tracking-[0.16em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                {"// NO REFERRALS YET — SHARE YOUR LINK ABOVE"}
              </p>
            ) : (
              <ul className="space-y-2">
                {recentReferrals.map((r) => {
                  const status = statusLabel(r.status);
                  return (
                    <li
                      key={r.id}
                      className="rounded-[2px] px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                      style={{
                        background: "var(--v3-bg-025)",
                        border: "1px solid var(--v3-line-100)",
                      }}
                    >
                      <span
                        className="font-mono text-xs"
                        style={{ color: "var(--v3-ink-100)" }}
                      >
                        {r.handle ? `@${r.handle}` : "anonymous visitor"}
                      </span>
                      <span className="flex items-center gap-3">
                        <span
                          className="rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                          style={{
                            borderColor: status.color,
                            color: status.color,
                            background: "transparent",
                          }}
                        >
                          {status.label}
                        </span>
                        <span
                          className="font-mono text-[10px] tabular-nums tracking-[0.14em]"
                          style={{ color: "var(--v3-ink-400)" }}
                        >
                          {formatRelative(r.timestamp)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Public leaderboard opt-in */}
        <section
          className="mb-6 rounded-[2px]"
          style={{
            background: "var(--v3-bg-050)",
            border: "1px solid var(--v3-line-200)",
          }}
        >
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 max-w-[560px]">
              <div
                className="font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--v3-ink-300)" }}
              >
                {"// LEADERBOARD VISIBILITY"}
              </div>
              <p
                className="mt-1 text-sm leading-snug"
                style={{ color: "var(--v3-ink-200)" }}
              >
                Show me on the public leaderboard so other builders can see
                my qualified-referral count next to my handle.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void togglePublicLeaderboard(!optin)}
              disabled={optinBusy}
              aria-pressed={optin}
              className="inline-flex items-center rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
              style={
                optin
                  ? {
                      background:
                        "color-mix(in srgb, var(--v3-sig-green) 12%, transparent)",
                      border: "1px solid var(--v3-sig-green)",
                      color: "var(--v3-sig-green)",
                      fontWeight: 500,
                    }
                  : {
                      background: "var(--v3-bg-025)",
                      border: "1px solid var(--v3-line-200)",
                      color: "var(--v3-ink-200)",
                    }
              }
            >
              {optinBusy ? "…" : optin ? "VISIBLE · ON" : "HIDDEN · OFF"}
            </button>
          </div>
        </section>

        {/* Footnote */}
        <p
          className="text-[11px] leading-relaxed"
          style={{ color: "var(--v3-ink-400)" }}
        >
          A referral qualifies once the friend you invited returns 24h+ after
          signing up. Self-invites, same-Clerk-user duplicates, and
          recently-flagged accounts don&apos;t count toward badges.
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CountTile({
  label,
  value,
  kind,
  note,
}: {
  label: string;
  value: number;
  kind: "ink" | "acc" | "green";
  note?: string;
}) {
  const accent =
    kind === "green"
      ? "var(--v3-sig-green)"
      : kind === "acc"
        ? "var(--v3-acc)"
        : "var(--v3-ink-100)";
  return (
    <div
      className="rounded-[2px] p-4"
      style={{
        background: "var(--v3-bg-050)",
        border: "1px solid var(--v3-line-200)",
      }}
    >
      <div
        className="font-mono text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "var(--v3-ink-400)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 tabular-nums"
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: accent,
          letterSpacing: "-0.02em",
        }}
      >
        {value.toLocaleString("en-US")}
      </div>
      {note ? (
        <div
          className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}

function ShareLineRow({
  label,
  value,
  onCopy,
  monospace,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  monospace?: boolean;
}) {
  return (
    <div
      className="rounded-[2px] flex flex-wrap items-stretch overflow-hidden"
      style={{
        background: "var(--v3-bg-025)",
        border: "1px solid var(--v3-line-100)",
      }}
    >
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-2 flex items-center"
        style={{
          color: "var(--v3-ink-400)",
          background: "var(--v3-bg-050)",
          borderRight: "1px solid var(--v3-line-100)",
        }}
      >
        {label}
      </span>
      <span
        className="flex-1 px-3 py-2 text-xs truncate"
        style={{
          color: "var(--v3-ink-100)",
          fontFamily: monospace
            ? "var(--font-geist-mono), var(--font-jetbrains-mono), monospace"
            : undefined,
        }}
        title={value}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center font-mono text-[10px] uppercase tracking-[0.16em] px-3 py-2 transition-colors"
        style={{
          background: "var(--v3-bg-050)",
          color: "var(--v3-acc)",
          borderLeft: "1px solid var(--v3-line-100)",
        }}
      >
        COPY
      </button>
    </div>
  );
}
