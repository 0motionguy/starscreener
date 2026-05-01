"use client";

// StarScreener — /you client shell (V4 W9 — ProfileTemplate consumer).
//
// Broken out of page.tsx because Next 15 disallows `export const metadata`
// from a "use client" module. The interactive surface lives here so we
// can hydrate localStorage-backed zustand stores (watchlist / compare /
// filter) without leaking client-only APIs into the server module.
//
// Layout:
//   ProfileTemplate
//     identity   → anonymous local-storage user (no account)
//     verdict    → optional welcome ribbon when there's something tracked
//     kpiBand    → 4 cells (Repos watched, Compare slots, Min momentum, Languages)
//     mainPanels →
//       // 01  Recent activity   — watchlist + compare lists
//       // 02  Account           — storage / "no account" panel
//       // 03  Preferences       — saved filter summary + reset
//     rightRail
//       // 04  Quick links       — Terminal / Watchlist / Compare / Filters

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  useCompareStore,
  useFilterStore,
  useWatchlistStore,
} from "@/lib/store";
import { idToSlug } from "@/lib/utils";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand, type KpiCell } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";

export default function YouClient() {
  // Hydration gate — zustand/persist loads from localStorage post-mount,
  // so render a stable placeholder until client state is truly live.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const watchlist = useWatchlistStore((s) => s.repos);
  const removeWatched = useWatchlistStore((s) => s.removeRepo);
  const compareIds = useCompareStore((s) => s.repos);
  const removeCompare = useCompareStore((s) => s.removeRepo);
  const clearCompare = useCompareStore((s) => s.clearAll);

  const timeRange = useFilterStore((s) => s.timeRange);
  const sortBy = useFilterStore((s) => s.sortBy);
  const category = useFilterStore((s) => s.category);
  const languages = useFilterStore((s) => s.languages);
  const onlyWatched = useFilterStore((s) => s.onlyWatched);
  const excludeArchived = useFilterStore((s) => s.excludeArchived);
  const minMomentum = useFilterStore((s) => s.minMomentum);
  const resetFilters = useFilterStore((s) => s.resetFilters);

  const watchCount = hydrated ? watchlist.length : 0;
  const compareCount = hydrated ? compareIds.length : 0;
  const langCount = hydrated ? languages.length : 0;

  // Derive earliest watch date for the welcome ribbon — only relevant when
  // there's something to talk about. Cheap on the client (≤ a few dozen
  // entries persisted to localStorage).
  const earliestWatch = watchlist.reduce<string | null>((acc, item) => {
    if (!acc) return item.addedAt;
    return item.addedAt < acc ? item.addedAt : acc;
  }, null);
  const earliestWatchYear = earliestWatch
    ? new Date(earliestWatch).getFullYear()
    : null;

  const kpiCells: KpiCell[] = [
    {
      label: "Repos watched",
      value: String(watchCount),
      sub: watchCount === 0 ? "none yet" : "local-only",
      tone: watchCount > 0 ? "money" : "default",
    },
    {
      label: "Compare slots",
      value: `${compareCount} / 5`,
      sub: compareCount === 0 ? "empty" : "shortlisted",
      tone: compareCount > 0 ? "acc" : "default",
    },
    {
      label: "Min momentum",
      value: String(minMomentum),
      sub: "filter floor",
    },
    {
      label: "Languages",
      value: langCount === 0 ? "any" : String(langCount),
      sub: langCount === 0 ? "no filter" : "active filter",
      tone: langCount > 0 ? "acc" : "default",
    },
  ];

  return (
    <main className="home-surface">
      <ProfileTemplate
        crumb={
          <>
            <b>YOU</b> · TERMINAL · /YOU
          </>
        }
        identity={<YouIdentity watchCount={watchCount} hydrated={hydrated} />}
        verdict={
          hydrated && watchCount > 0 ? (
            <VerdictRibbon
              tone="acc"
              stamp={{
                eyebrow: "// WELCOME BACK",
                headline: `${watchCount} REPO${watchCount === 1 ? "" : "S"} TRACKED`,
                sub:
                  earliestWatchYear !== null
                    ? `since ${earliestWatchYear}`
                    : "local-only",
              }}
              text={
                <>
                  You&apos;re watching <b>{watchCount}</b> repo
                  {watchCount === 1 ? "" : "s"}
                  {compareCount > 0 ? (
                    <>
                      {" "}
                      and have <b>{compareCount}</b> staged for compare
                    </>
                  ) : null}
                  . Everything stays in your browser — portable when you&apos;re
                  ready, invisible when you&apos;re not.
                </>
              }
              actionHref="/"
              actionLabel="OPEN TERMINAL →"
            />
          ) : undefined
        }
        kpiBand={<KpiBand cells={kpiCells} />}
        mainPanels={
          <>
            <SectionHead
              num="// 01"
              title="Recent activity"
              meta={
                hydrated ? (
                  <>
                    <b>{watchCount}</b> watched · <b>{compareCount}</b>{" "}
                    compared
                  </>
                ) : undefined
              }
            />
            <ActivityPanel
              hydrated={hydrated}
              watchlist={watchlist}
              compareIds={compareIds}
              onRemoveWatched={removeWatched}
              onRemoveCompare={removeCompare}
              onClearCompare={clearCompare}
            />

            <SectionHead num="// 02" title="Account" meta="LOCAL ONLY" />
            <AccountPanel hydrated={hydrated} watchCount={watchCount} />

            <SectionHead num="// 03" title="Preferences" />
            <PreferencesPanel
              timeRange={timeRange}
              sortBy={sortBy}
              category={category}
              languages={languages}
              minMomentum={minMomentum}
              onlyWatched={onlyWatched}
              excludeArchived={excludeArchived}
              onReset={resetFilters}
            />
          </>
        }
        rightRail={
          <>
            <SectionHead num="// 04" title="Quick links" />
            <QuickLinks watchCount={watchCount} compareCount={compareCount} />
          </>
        }
      />
    </main>
  );
}

// --- Composition helpers --------------------------------------------------

function YouIdentity({
  watchCount,
  hydrated,
}: {
  watchCount: number;
  hydrated: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        marginTop: 8,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: 4,
          background: "var(--v4-bg-100)",
          border: "1px solid var(--v4-line-200)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 24,
          color: "var(--v4-ink-200)",
          flexShrink: 0,
        }}
      >
        u
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          className="v4-page-head__h1"
          style={{ marginTop: 0, marginBottom: 4 }}
        >
          Your signal{" "}
          <span style={{ color: "var(--v4-ink-300)", fontSize: "0.6em" }}>
            @local
          </span>
        </h1>
        <p
          className="v4-page-head__lede"
          style={{ marginTop: 0, marginBottom: 10 }}
        >
          No account, no tracking. StarScreener keeps your watchlist,
          compare shortlist, and filter preferences in your browser.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--v4-ink-300)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          <span>local-only</span>
          <span>
            ●{" "}
            <b style={{ color: "var(--v4-money)" }}>
              {hydrated ? "ready" : "syncing…"}
            </b>
          </span>
          <span>
            tracking <b style={{ color: "var(--v4-ink-100)" }}>{watchCount}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

function ActivityPanel({
  hydrated,
  watchlist,
  compareIds,
  onRemoveWatched,
  onRemoveCompare,
  onClearCompare,
}: {
  hydrated: boolean;
  watchlist: { repoId: string; addedAt: string; starsAtAdd: number }[];
  compareIds: string[];
  onRemoveWatched: (repoId: string) => void;
  onRemoveCompare: (repoId: string) => void;
  onClearCompare: () => void;
}) {
  if (!hydrated) {
    return <PanelEmpty label="Loading…" />;
  }

  if (watchlist.length === 0 && compareIds.length === 0) {
    return (
      <PanelEmpty
        label="Nothing tracked yet."
        cta="/"
        ctaLabel="Open the terminal"
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <SubHead
        title={`Watchlist · ${watchlist.length}`}
        action={
          watchlist.length > 0 ? (
            <Link
              href="/watchlist"
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 10,
                color: "var(--v4-acc)",
                textDecoration: "none",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              open watchlist →
            </Link>
          ) : null
        }
      />
      {watchlist.length === 0 ? (
        <PanelEmpty label="No repos watched yet." cta="/" ctaLabel="Browse" />
      ) : (
        <ul style={listStyle}>
          {watchlist.map((item) => {
            const slug = idToSlug(item.repoId);
            return (
              <li key={item.repoId} style={listRowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link
                    href={`/repo/${slug}`}
                    style={{
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 12,
                      color: "var(--v4-ink-100)",
                      textDecoration: "none",
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {slug}
                  </Link>
                  <span style={metaStyle}>
                    added {new Date(item.addedAt).toLocaleDateString()} · @{" "}
                    {item.starsAtAdd.toLocaleString("en-US")} stars
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveWatched(item.repoId)}
                  aria-label={`Remove ${slug} from watchlist`}
                  style={iconBtnStyle}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <SubHead
        title={`Compare · ${compareIds.length} / 5`}
        action={
          compareIds.length > 0 ? (
            <span style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={onClearCompare}
                style={textBtnStyle}
              >
                clear
              </button>
              <Link
                href="/compare"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 10,
                  color: "var(--v4-acc)",
                  textDecoration: "none",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                open compare →
              </Link>
            </span>
          ) : null
        }
      />
      {compareIds.length === 0 ? (
        <PanelEmpty
          label="Nothing staged for comparison."
          cta="/"
          ctaLabel="Pick up to five"
        />
      ) : (
        <ul style={listStyle}>
          {compareIds.map((id) => {
            const slug = idToSlug(id);
            return (
              <li key={id} style={listRowStyle}>
                <Link
                  href={`/repo/${slug}`}
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 12,
                    color: "var(--v4-ink-100)",
                    textDecoration: "none",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {slug}
                </Link>
                <button
                  type="button"
                  onClick={() => onRemoveCompare(id)}
                  aria-label={`Remove ${slug} from compare`}
                  style={iconBtnStyle}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AccountPanel({
  hydrated,
  watchCount,
}: {
  hydrated: boolean;
  watchCount: number;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--v4-line-200)",
        borderRadius: 4,
        padding: 16,
        background: "var(--v4-bg-050)",
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 12,
      }}
    >
      <div style={kvRowStyle}>
        <span style={kvLabelStyle}>Plan</span>
        <span style={kvValueStyle}>Local · free forever</span>
      </div>
      <div style={kvRowStyle}>
        <span style={kvLabelStyle}>Storage</span>
        <span style={kvValueStyle}>browser localStorage</span>
      </div>
      <div style={kvRowStyle}>
        <span style={kvLabelStyle}>Sync</span>
        <span style={kvValueStyle}>off · per-device</span>
      </div>
      <div style={kvRowStyle}>
        <span style={kvLabelStyle}>State</span>
        <span style={kvValueStyle}>
          {hydrated
            ? `${watchCount} watched repo${watchCount === 1 ? "" : "s"}`
            : "syncing…"}
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          color: "var(--v4-ink-400)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          lineHeight: 1.6,
        }}
      >
        StarScreener does not store accounts. Your data lives in this browser
        until you clear site data.
      </p>
    </div>
  );
}

function PreferencesPanel({
  timeRange,
  sortBy,
  category,
  languages,
  minMomentum,
  onlyWatched,
  excludeArchived,
  onReset,
}: {
  timeRange: string;
  sortBy: string;
  category: string | null;
  languages: string[];
  minMomentum: number;
  onlyWatched: boolean;
  excludeArchived: boolean;
  onReset: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--v4-line-200)",
        borderRadius: 4,
        padding: 16,
        background: "var(--v4-bg-050)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "8px 24px",
        }}
      >
        <FilterRow k="Window" v={timeRange} />
        <FilterRow k="Sort" v={sortBy} />
        <FilterRow k="Category" v={category ?? "all"} />
        <FilterRow
          k="Languages"
          v={languages.length === 0 ? "any" : languages.join(", ")}
        />
        <FilterRow k="Min momentum" v={String(minMomentum)} />
        <FilterRow k="Only watched" v={onlyWatched ? "on" : "off"} />
        <FilterRow
          k="Exclude archived"
          v={excludeArchived ? "on" : "off"}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingTop: 8,
          borderTop: "1px solid var(--v4-line-100)",
        }}
      >
        <button type="button" onClick={onReset} style={resetBtnStyle}>
          Reset filters
        </button>
      </div>
    </div>
  );
}

function QuickLinks({
  watchCount,
  compareCount,
}: {
  watchCount: number;
  compareCount: number;
}) {
  const links: { href: string; label: string; meta: string }[] = [
    { href: "/", label: "Terminal", meta: "browse trending" },
    {
      href: "/watchlist",
      label: "Watchlist",
      meta:
        watchCount > 0
          ? `${watchCount} repo${watchCount === 1 ? "" : "s"}`
          : "empty",
    },
    {
      href: "/compare",
      label: "Compare",
      meta: compareCount > 0 ? `${compareCount} staged` : "empty",
    },
    { href: "/signals", label: "Signals", meta: "newsroom" },
  ];
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        border: "1px solid var(--v4-line-200)",
        borderRadius: 4,
        overflow: "hidden",
        background: "var(--v4-bg-050)",
      }}
    >
      {links.map((l, i) => (
        <li
          key={l.href}
          style={{
            borderTop: i === 0 ? "none" : "1px solid var(--v4-line-100)",
          }}
        >
          <Link
            href={l.href}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 8,
              padding: "10px 14px",
              textDecoration: "none",
              color: "var(--v4-ink-100)",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 12,
            }}
          >
            <span>{l.label}</span>
            <span
              style={{
                fontSize: 10,
                color: "var(--v4-ink-400)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {l.meta} →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// --- Small primitives ---

function SubHead({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          color: "var(--v4-ink-200)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </span>
      {action}
    </div>
  );
}

function PanelEmpty({
  label,
  cta,
  ctaLabel,
}: {
  label: string;
  cta?: string;
  ctaLabel?: string;
}) {
  return (
    <div
      style={{
        border: "1px dashed var(--v4-line-200)",
        borderRadius: 4,
        padding: "12px 14px",
        background: "var(--v4-bg-050)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 11,
        color: "var(--v4-ink-300)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      <span>{label}</span>
      {cta && ctaLabel ? (
        <Link
          href={cta}
          style={{
            color: "var(--v4-acc)",
            textDecoration: "none",
            letterSpacing: "0.08em",
          }}
        >
          {ctaLabel} →
        </Link>
      ) : null}
    </div>
  );
}

function FilterRow({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 8,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          color: "var(--v4-ink-400)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          flexShrink: 0,
        }}
      >
        {k}
      </span>
      <span
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 12,
          color: "var(--v4-ink-100)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {v}
      </span>
    </div>
  );
}

// --- Inline style tokens ---
// Kept inline (not in v4.css) so the page stays self-contained — these are
// page-local micro-styles that don't deserve a global utility class.

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  border: "1px solid var(--v4-line-200)",
  borderRadius: 4,
  overflow: "hidden",
  background: "var(--v4-bg-050)",
};

const listRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderBottom: "1px solid var(--v4-line-100)",
};

const metaStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 10,
  color: "var(--v4-ink-400)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginTop: 2,
};

const iconBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  border: "1px solid var(--v4-line-200)",
  borderRadius: 2,
  background: "transparent",
  color: "var(--v4-ink-400)",
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 11,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const textBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--v4-ink-400)",
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  cursor: "pointer",
  padding: 0,
};

const resetBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 11,
  padding: "6px 12px",
  border: "1px solid var(--v4-line-300)",
  borderRadius: 2,
  color: "var(--v4-ink-100)",
  background: "var(--v4-bg-050)",
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const kvRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
};

const kvLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 10,
  color: "var(--v4-ink-400)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const kvValueStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 12,
  color: "var(--v4-ink-100)",
};
