"use client";

// /watchlist — V4 W9 user-surfaces migration.
//
// Composes through ProfileTemplate (PageHead + KpiBand + VerdictRibbon +
// 2-col body) using V4 primitives. Tracked repos render as
// <RelatedRepoCard> tiles; alert rules use <AlertTriggerCard>; recent
// fired events use <AlertEventRow> in the right rail.
//
// Auth model is unchanged: the page itself is *not* server-side
// auth-gated — the local Zustand watchlist persists per browser. Alert
// CRUD endpoints derive userId from the ss_user cookie (best-effort
// bootstrapped via /api/auth/session). In dev with no SESSION_SECRET
// the server falls back to userId="local" so rules + events still load.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { Repo } from "@/lib/types";
import type {
  AlertEvent,
  AlertRule,
} from "@/lib/pipeline/types";
import { useWatchlistStore } from "@/lib/store";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import {
  toastAlertDeleted,
  toastAlertError,
} from "@/lib/toast";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { RelatedRepoCard } from "@/components/repo-detail/RelatedRepoCard";
import { AlertTriggerCard } from "@/components/alerts/AlertTriggerCard";
import { AlertEventRow } from "@/components/alerts/AlertEventRow";
import { BrowserAlertToggle } from "@/components/watchlist/BrowserAlertToggle";

// Shared fetch options for per-user endpoints — same shape as AlertConfig.
const USER_FETCH_INIT: RequestInit = {
  credentials: "include",
  cache: "no-store",
};

// Best-effort cookie bootstrap so first-time visitors can read alert state.
async function ensureSessionCookie(): Promise<void> {
  try {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    /* non-fatal — downstream calls will surface their own errors */
  }
}

export default function WatchlistPage() {
  useEffect(() => {
    document.title = "Watchlist — TrendingRepo";
  }, []);

  const watchlist = useWatchlistStore((s) => s.repos);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [reposById, setReposById] = useState<Record<string, Repo>>({});
  const [reposLoading, setReposLoading] = useState(false);

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // Hydrate watched repos via /api/repos?ids=… — same pattern as
  // WatchlistManager. Stable join key avoids refetch loops.
  const repoIdKey = useMemo(
    () => watchlist.map((w) => w.repoId).sort().join(","),
    [watchlist],
  );

  useEffect(() => {
    if (!hasHydrated) return;
    if (repoIdKey === "") {
      setReposById({});
      setReposLoading(false);
      return;
    }
    const controller = new AbortController();
    setReposLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/repos?ids=${encodeURIComponent(repoIdKey)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { repos?: Repo[] };
        const next: Record<string, Repo> = {};
        for (const r of Array.isArray(data.repos) ? data.repos : []) {
          next[r.id] = r;
        }
        setReposById(next);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[watchlist] repos fetch failed", err);
      } finally {
        setReposLoading(false);
      }
    })();
    return () => controller.abort();
  }, [repoIdKey, hasHydrated]);

  // Hoist alert rules + events into the page so KpiBand / rail can read
  // them. Same endpoints AlertConfig used; we keep this minimal because
  // create/edit flow stays inside CRUD-capable surfaces.
  const refreshRules = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/pipeline/alerts/rules",
        USER_FETCH_INIT,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok: boolean;
        rules?: AlertRule[];
      };
      if (data.ok && data.rules) setRules(data.rules);
    } catch (err) {
      console.error("[watchlist] rules fetch failed", err);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/alerts", USER_FETCH_INIT);
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok: boolean;
        events?: AlertEvent[];
      };
      if (data.ok && data.events) setEvents(data.events);
    } catch (err) {
      console.error("[watchlist] events fetch failed", err);
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    let active = true;
    (async () => {
      setAlertsLoading(true);
      await ensureSessionCookie();
      if (!active) return;
      await Promise.all([refreshRules(), refreshEvents()]);
      if (!active) return;
      setAlertsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [hasHydrated, refreshRules, refreshEvents]);

  const handleToggleRule = useCallback(
    (rule: AlertRule, next: boolean) => {
      // The rules API doesn't expose a PUT; mirror AlertConfig and keep
      // the toggle local for now. Surfacing it on the V4 card still
      // gives users the visual affordance.
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: next } : r)),
      );
    },
    [],
  );

  const handleDeleteRule = useCallback(async (rule: AlertRule) => {
    try {
      const res = await fetch(
        `/api/pipeline/alerts/rules?id=${encodeURIComponent(rule.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = (await res.json().catch(() => ({ ok: false }))) as {
        ok: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toastAlertError(data.error ?? "failed to delete alert");
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      toastAlertDeleted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastAlertError(msg);
    }
  }, []);

  const handleMarkRead = useCallback(async (event: AlertEvent) => {
    try {
      const res = await fetch("/api/pipeline/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventId: event.id }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as {
        ok: boolean;
      };
      if (!res.ok || !data.ok) return;
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id
            ? { ...e, readAt: new Date().toISOString() }
            : e,
        ),
      );
    } catch (err) {
      console.error("[watchlist] markRead failed", err);
    }
  }, []);

  // Pair watched items with hydrated repos in original add-order. Drop
  // entries we couldn't resolve (the repo may have left the catalog).
  const watchedRepos = useMemo(() => {
    return watchlist
      .map((item) => {
        const repo = reposById[item.repoId];
        return repo ? { item, repo } : null;
      })
      .filter(
        (entry): entry is { item: (typeof watchlist)[number]; repo: Repo } =>
          entry !== null,
      );
  }, [watchlist, reposById]);

  // Fast lookup id → fullName for alert primitives.
  const repoNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of Object.values(reposById)) map[r.id] = r.fullName;
    return map;
  }, [reposById]);

  // KpiBand metrics.
  const tracked = watchedRepos.length;
  const activeRules = rules.filter((r) => r.enabled).length;
  const reposFiringThisWeek = useMemo(() => {
    const weekMs = 7 * 86_400_000;
    const cutoff = Date.now() - weekMs;
    const repos = new Set<string>();
    for (const e of events) {
      const t = Date.parse(e.firedAt);
      if (Number.isFinite(t) && t >= cutoff) repos.add(e.repoId);
    }
    return repos.size;
  }, [events]);
  const newMentions24h = useMemo(() => {
    const dayMs = 86_400_000;
    const cutoff = Date.now() - dayMs;
    let n = 0;
    for (const e of events) {
      const t = Date.parse(e.firedAt);
      if (Number.isFinite(t) && t >= cutoff) n += 1;
    }
    return n;
  }, [events]);

  // "Most active" repo = highest-stars repo in watchlist (proxy for the
  // most actively tracked one). Falls back gracefully when empty.
  const mostActive = useMemo(() => {
    if (watchedRepos.length === 0) return null;
    return [...watchedRepos].sort((a, b) => b.repo.stars - a.repo.stars)[0]
      .repo;
  }, [watchedRepos]);

  const verdictTone = tracked === 0 ? "amber" : "acc";

  return (
    <main className="home-surface watchlist-page">
      <ProfileTemplate
        crumb={
          <>
            <b>WATCHLIST</b> · TERMINAL · /WATCHLIST
          </>
        }
        identity={
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <h1
              className="v4-page-head__h1"
              style={{ marginTop: 0, marginBottom: 4 }}
            >
              Your watchlist.
            </h1>
            <p
              className="v4-page-head__lede"
              style={{ marginTop: 0, marginBottom: 0 }}
            >
              Tracked repos, movement alerts, and recent fires — all on one
              terminal.
            </p>
          </div>
        }
        clock={
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              color: "var(--v4-ink-300)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {tracked} tracked · {activeRules} alerts on
          </span>
        }
        verdict={
          <VerdictRibbon
            tone={verdictTone}
            stamp={{
              eyebrow: "// VERDICT",
              headline:
                tracked === 0 ? "Empty watchlist" : `${tracked} TRACKED`,
              sub:
                activeRules > 0
                  ? `${activeRules} active rule${activeRules === 1 ? "" : "s"}`
                  : "no alerts configured",
            }}
            text={
              tracked === 0 ? (
                <>
                  No repos tracked yet. Click the eye icon on any repo to
                  drop it into your private terminal.
                </>
              ) : (
                <>
                  Tracking <b>{tracked}</b> repo{tracked === 1 ? "" : "s"}
                  {mostActive ? (
                    <>
                      {" "}
                      led by{" "}
                      <span style={{ color: "var(--v4-acc)" }}>
                        {mostActive.fullName}
                      </span>{" "}
                      ({formatNumber(mostActive.stars)} ★)
                    </>
                  ) : null}
                  {reposFiringThisWeek > 0 ? (
                    <>
                      {" — "}
                      <span style={{ color: "var(--v4-money)" }}>
                        {reposFiringThisWeek} firing this week
                      </span>
                    </>
                  ) : null}
                  .
                </>
              )
            }
            actionHref="/"
            actionLabel="ADD REPOS →"
          />
        }
        kpiBand={
          <KpiBand
            cells={[
              {
                label: "Tracked repos",
                value: String(tracked),
                sub: reposLoading ? "syncing…" : "all-time",
                tone: tracked > 0 ? "default" : "amber",
              },
              {
                label: "Alerts active",
                value: String(activeRules),
                sub:
                  rules.length > activeRules
                    ? `${rules.length - activeRules} off`
                    : "all enabled",
                tone: activeRules > 0 ? "money" : "default",
              },
              {
                label: "Repos firing",
                value: String(reposFiringThisWeek),
                sub: "7d window",
                tone: reposFiringThisWeek > 0 ? "acc" : "default",
              },
              {
                label: "New events",
                value: String(newMentions24h),
                sub: "24h",
                tone: newMentions24h > 0 ? "money" : "default",
              },
            ]}
          />
        }
        mainPanels={
          <>
            <SectionHead
              num="// 01"
              title="Tracked repos"
              meta={`${tracked} REPO${tracked === 1 ? "" : "S"}`}
            />
            {!hasHydrated || reposLoading ? (
              <div
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  color: "var(--v4-ink-300)",
                  padding: "24px 0",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                // LOADING WATCHLIST…
              </div>
            ) : watchedRepos.length === 0 ? (
              <EmptyTrackedState />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 12,
                }}
              >
                {watchedRepos.map(({ item, repo }) => (
                  <RelatedRepoCard
                    key={item.repoId}
                    fullName={repo.fullName}
                    description={repo.description ?? undefined}
                    language={
                      repo.language
                        ? repo.language.toUpperCase()
                        : undefined
                    }
                    stars={formatNumber(repo.stars)}
                    similarity={
                      repo.starsDelta24h !== 0
                        ? `${repo.starsDelta24h > 0 ? "+" : ""}${formatNumber(
                            repo.starsDelta24h,
                          )} 24H`
                        : "STABLE"
                    }
                    href={`/repo/${repo.owner}/${repo.name}`}
                  />
                ))}
              </div>
            )}

            <SectionHead
              num="// 02"
              title="Alert rules"
              meta={
                <>
                  {rules.length} RULE{rules.length === 1 ? "" : "S"} ·{" "}
                  <b>{activeRules} ON</b>
                </>
              }
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: 8,
              }}
            >
              <BrowserAlertToggle />
            </div>
            {alertsLoading ? (
              <div
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  color: "var(--v4-ink-300)",
                  padding: "16px 0",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                // LOADING ALERT RULES…
              </div>
            ) : rules.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--v4-ink-300)",
                  padding: "8px 0",
                }}
              >
                No alert rules configured.{" "}
                <Link
                  href="/alerts"
                  style={{
                    color: "var(--v4-acc)",
                    textDecoration: "none",
                  }}
                >
                  Create one →
                </Link>
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {rules.map((rule) => (
                  <AlertTriggerCard
                    key={rule.id}
                    rule={rule}
                    repoLabel={
                      rule.repoId
                        ? repoNamesById[rule.repoId] ?? rule.repoId
                        : undefined
                    }
                    lastFiredLabel={
                      rule.lastFiredAt
                        ? getRelativeTime(rule.lastFiredAt)
                        : undefined
                    }
                    onToggle={handleToggleRule}
                    onDelete={handleDeleteRule}
                  />
                ))}
              </div>
            )}
          </>
        }
        rightRail={
          <>
            <SectionHead
              num="// 03"
              title="Recent alerts"
              meta={`${events.length} EVENT${events.length === 1 ? "" : "S"}`}
            />
            {alertsLoading ? (
              <div
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  color: "var(--v4-ink-300)",
                  padding: "16px 0",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                // LOADING…
              </div>
            ) : events.length === 0 ? (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--v4-ink-300)",
                  padding: "8px 0",
                }}
              >
                No alerts fired yet. Toggle a rule above to start.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {events.slice(0, 12).map((event) => (
                  <AlertEventRow
                    key={event.id}
                    event={event}
                    ago={getRelativeTime(event.firedAt)}
                    repoLabel={
                      repoNamesById[event.repoId] ?? event.repoId
                    }
                    onMarkRead={handleMarkRead}
                  />
                ))}
              </div>
            )}
          </>
        }
      />
    </main>
  );
}

function EmptyTrackedState() {
  return (
    <div
      style={{
        border: "1px dashed var(--v4-line-200)",
        borderRadius: 4,
        padding: "32px 24px",
        textAlign: "center",
        background: "var(--v4-bg-050)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          color: "var(--v4-ink-300)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: 0,
          marginBottom: 8,
        }}
      >
        // WATCHLIST IS EMPTY
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--v4-ink-200)",
          maxWidth: 360,
          margin: "0 auto 16px",
        }}
      >
        Click the eye icon on any repo to add it here. Your tracked
        projects appear in this terminal.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          padding: "6px 12px",
          border: "1px solid var(--v4-line-300)",
          borderRadius: 2,
          color: "var(--v4-ink-100)",
          background: "var(--v4-bg-050)",
          textDecoration: "none",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Browse trending repos →
      </Link>
    </div>
  );
}
