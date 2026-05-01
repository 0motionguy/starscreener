"use client";

// /alerts — V4 W10-A alerts inbox.
//
// ProfileTemplate consumer composing AlertInbox / AlertEventRow /
// AlertTriggerCard primitives. Data is per-user (cookie-derived userId),
// so the surface is client-rendered behind a best-effort
// /api/auth/session cookie bootstrap — same approach as /watchlist
// (the V4 W9 user-surface reference). Pure presentation; CRUD + mark-read
// hit the existing /api/pipeline/alerts(/rules) endpoints.
//
// Empty states cover both "no rules" and "no events".

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { Repo } from "@/lib/types";
import type { AlertEvent, AlertRule } from "@/lib/pipeline/types";
import { getRelativeTime } from "@/lib/utils";
import { toastAlertDeleted, toastAlertError } from "@/lib/toast";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { AlertInbox } from "@/components/alerts/AlertInbox";
import { AlertTriggerCard } from "@/components/alerts/AlertTriggerCard";

const USER_FETCH_INIT: RequestInit = {
  credentials: "include",
  cache: "no-store",
};

// Best-effort cookie bootstrap so first-time visitors can read their feed.
// Mirrors the /watchlist pattern — the alerts API derives userId from the
// ss_user cookie via verifyUserAuth.
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
    /* non-fatal */
  }
}

const DAY_MS = 86_400_000;

export default function AlertsPage() {
  useEffect(() => {
    document.title = "Alerts — TrendingRepo";
  }, []);

  const [hasHydrated, setHasHydrated] = useState(false);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [reposById, setReposById] = useState<Record<string, Repo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

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
      console.error("[alerts] rules fetch failed", err);
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
      console.error("[alerts] events fetch failed", err);
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    let active = true;
    (async () => {
      setLoading(true);
      await ensureSessionCookie();
      if (!active) return;
      await Promise.all([refreshRules(), refreshEvents()]);
      if (!active) return;
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [hasHydrated, refreshRules, refreshEvents]);

  // Hydrate repo display names from the catalog. We collect every repoId
  // referenced by rules + events, then resolve via /api/repos?ids=… so the
  // primitives can render "anthropic/claude-code" instead of opaque ids.
  const repoIdKey = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rules) {
      if (r.repoId) ids.add(r.repoId);
    }
    for (const e of events) {
      if (e.repoId) ids.add(e.repoId);
    }
    return Array.from(ids).sort().join(",");
  }, [rules, events]);

  useEffect(() => {
    if (!hasHydrated || repoIdKey === "") {
      setReposById({});
      return;
    }
    const controller = new AbortController();
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
        console.error("[alerts] repo names fetch failed", err);
      }
    })();
    return () => controller.abort();
  }, [repoIdKey, hasHydrated]);

  const repoNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of Object.values(reposById)) map[r.id] = r.fullName;
    return map;
  }, [reposById]);

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const handleToggleRule = useCallback(
    (rule: AlertRule, next: boolean) => {
      // Rules API doesn't expose PUT today; mirror /watchlist and keep the
      // toggle local for visual affordance only.
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
      console.error("[alerts] markRead failed", err);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Derived metrics
  // -------------------------------------------------------------------------

  const activeRulesCount = rules.filter((r) => r.enabled).length;
  const unreadCount = events.filter((e) => e.readAt === null).length;

  const firedToday = useMemo(() => {
    const cutoff = Date.now() - DAY_MS;
    return events.filter((e) => {
      const t = Date.parse(e.firedAt);
      return Number.isFinite(t) && t >= cutoff;
    }).length;
  }, [events]);

  const fired7d = useMemo(() => {
    const cutoff = Date.now() - DAY_MS * 7;
    return events.filter((e) => {
      const t = Date.parse(e.firedAt);
      return Number.isFinite(t) && t >= cutoff;
    }).length;
  }, [events]);

  // Most recent fired event (events arrive newest-first from the store, but
  // we sort defensively so verdict copy is always anchored to the latest).
  const latestEvent = useMemo(() => {
    let best: AlertEvent | null = null;
    let bestT = -Infinity;
    for (const e of events) {
      const t = Date.parse(e.firedAt);
      if (Number.isFinite(t) && t > bestT) {
        bestT = t;
        best = e;
      }
    }
    return best;
  }, [events]);

  // Cooldowns — rules whose lastFiredAt is recent enough that the next fire
  // is still gated by the rule's cooldownMinutes window.
  const cooldownRules = useMemo(() => {
    const now = Date.now();
    return rules
      .filter((r) => {
        if (!r.lastFiredAt) return false;
        const t = Date.parse(r.lastFiredAt);
        if (!Number.isFinite(t)) return false;
        return now - t < r.cooldownMinutes * 60_000;
      })
      .map((r) => {
        const t = Date.parse(r.lastFiredAt as string);
        const elapsedMin = Math.max(0, (now - t) / 60_000);
        const remainingMin = Math.max(
          0,
          Math.round(r.cooldownMinutes - elapsedMin),
        );
        return { rule: r, remainingMin };
      });
  }, [rules]);

  const verdictTone =
    activeRulesCount === 0 ? "amber" : firedToday > 0 ? "money" : "acc";

  return (
    <main className="home-surface alerts-page">
      <ProfileTemplate
        crumb={
          <>
            <b>ALERTS</b> · TERMINAL · /ALERTS
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
              Alerts inbox.
            </h1>
            <p
              className="v4-page-head__lede"
              style={{ marginTop: 0, marginBottom: 0 }}
            >
              Movement triggers fire when your watched repos cross the
              thresholds you set. Manage rules, mark events read, work the
              tape.
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
            {activeRulesCount} active · {unreadCount} unread
          </span>
        }
        verdict={
          <VerdictRibbon
            tone={verdictTone}
            stamp={{
              eyebrow: "// VERDICT",
              headline:
                latestEvent && Number.isFinite(Date.parse(latestEvent.firedAt))
                  ? `LAST FIRE · ${getRelativeTime(latestEvent.firedAt).toUpperCase()}`
                  : activeRulesCount === 0
                    ? "NO RULES"
                    : "NO RECENT FIRES",
              sub:
                rules.length > 0
                  ? `${activeRulesCount} of ${rules.length} rule${rules.length === 1 ? "" : "s"} active`
                  : "no rules configured",
            }}
            text={
              activeRulesCount === 0 ? (
                <>
                  No alert rules configured yet. Head to{" "}
                  <Link
                    href="/watchlist"
                    style={{ color: "var(--v4-acc)", textDecoration: "none" }}
                  >
                    /watchlist
                  </Link>{" "}
                  to track repos and configure triggers.
                </>
              ) : latestEvent ? (
                <>
                  Last fire on{" "}
                  <span style={{ color: "var(--v4-acc)" }}>
                    {repoNamesById[latestEvent.repoId] ?? latestEvent.repoId}
                  </span>{" "}
                  — {latestEvent.title}.{" "}
                  {firedToday > 0 ? (
                    <>
                      <b>{firedToday}</b> fire{firedToday === 1 ? "" : "s"}{" "}
                      today, <b>{fired7d}</b> over 7d.
                    </>
                  ) : (
                    <>{fired7d} fires over the last 7d.</>
                  )}
                </>
              ) : (
                <>
                  All <b>{activeRulesCount}</b> rule
                  {activeRulesCount === 1 ? "" : "s"} armed. No events fired
                  yet — your thresholds may not have been crossed.
                </>
              )
            }
            actionHref="/watchlist"
            actionLabel="MANAGE RULES →"
          />
        }
        kpiBand={
          <KpiBand
            cells={[
              {
                label: "Active rules",
                value: String(activeRulesCount),
                sub:
                  rules.length > activeRulesCount
                    ? `${rules.length - activeRulesCount} off`
                    : "all enabled",
                tone: activeRulesCount > 0 ? "money" : "default",
              },
              {
                label: "Fired today",
                value: String(firedToday),
                sub: "24h window",
                tone: firedToday > 0 ? "acc" : "default",
              },
              {
                label: "Fired · 7d",
                value: String(fired7d),
                sub: "rolling week",
                tone: fired7d > 0 ? "money" : "default",
              },
              {
                label: "Unread",
                value: String(unreadCount),
                sub: unreadCount > 0 ? "needs attention" : "all read",
                tone: unreadCount > 0 ? "amber" : "default",
              },
            ]}
          />
        }
        mainPanels={
          <>
            <SectionHead
              num="// 01"
              title="Recent events"
              meta={
                <>
                  {events.length} EVENT{events.length === 1 ? "" : "S"} ·{" "}
                  <b>{unreadCount} UNREAD</b>
                </>
              }
            />
            {!hasHydrated || loading ? (
              <LoadingLine label="// LOADING ALERT EVENTS…" />
            ) : (
              <AlertInbox
                events={events}
                repoLabel={(e) => repoNamesById[e.repoId] ?? e.repoId}
                formatAge={(e) => getRelativeTime(e.firedAt)}
                onMarkRead={handleMarkRead}
                emptyLabel={
                  rules.length === 0
                    ? "No alerts fired yet — configure a rule on /watchlist to start receiving events."
                    : "No alerts fired yet. Your rules are armed; events will appear here once thresholds are crossed."
                }
              />
            )}

            <SectionHead
              num="// 02"
              title="Active rules"
              meta={
                <>
                  {rules.length} RULE{rules.length === 1 ? "" : "S"} ·{" "}
                  <b>{activeRulesCount} ON</b>
                </>
              }
            />
            {loading ? (
              <LoadingLine label="// LOADING RULES…" />
            ) : rules.length === 0 ? (
              <EmptyRulesState />
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
            <SectionHead num="// 03" title="Quick add" />
            <QuickAddCallout />

            <SectionHead
              num="// 04"
              title="Cooldowns"
              meta={
                cooldownRules.length > 0
                  ? `${cooldownRules.length} GATED`
                  : undefined
              }
            />
            {cooldownRules.length === 0 ? (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--v4-ink-300)",
                  padding: "8px 0",
                  margin: 0,
                }}
              >
                No rules in cooldown. Rules re-arm immediately after firing
                unless they crossed the threshold within the last cooldown
                window.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {cooldownRules.map(({ rule, remainingMin }) => (
                  <CooldownRow
                    key={rule.id}
                    label={
                      rule.repoId
                        ? repoNamesById[rule.repoId] ?? rule.repoId
                        : "all repos"
                    }
                    trigger={rule.trigger}
                    remainingMin={remainingMin}
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

// -----------------------------------------------------------------------------
// Local presentation helpers
// -----------------------------------------------------------------------------

function LoadingLine({ label }: { label: string }) {
  return (
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
      {label}
    </div>
  );
}

function EmptyRulesState() {
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
        {"// NO ALERT RULES"}
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--v4-ink-200)",
          maxWidth: 360,
          margin: "0 auto 16px",
        }}
      >
        Track a repo on /watchlist, then configure a star-spike, release, or
        rank-jump trigger. Rules fire as soon as their thresholds are
        crossed.
      </p>
      <Link
        href="/watchlist"
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
        Configure on /watchlist →
      </Link>
    </div>
  );
}

function QuickAddCallout() {
  return (
    <div
      style={{
        border: "1px solid var(--v4-line-200)",
        borderRadius: 4,
        padding: "12px 14px",
        background: "var(--v4-bg-050)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          color: "var(--v4-ink-300)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {"// NEW RULE"}
      </div>
      <p
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          color: "var(--v4-ink-200)",
          margin: 0,
        }}
      >
        Rule creation lives next to each tracked repo. Toggle alerts on a
        watchlist row to mint a default rule, then tune the threshold from
        the trigger card.
      </p>
      <Link
        href="/watchlist"
        style={{
          display: "inline-block",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          padding: "6px 10px",
          border: "1px solid var(--v4-line-300)",
          borderRadius: 2,
          color: "var(--v4-ink-100)",
          textDecoration: "none",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          alignSelf: "flex-start",
        }}
      >
        Open /watchlist →
      </Link>
    </div>
  );
}

function CooldownRow({
  label,
  trigger,
  remainingMin,
}: {
  label: string;
  trigger: string;
  remainingMin: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        border: "1px solid var(--v4-line-200)",
        borderRadius: 4,
        background: "var(--v4-bg-050)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 9,
          color: "var(--v4-amber)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {trigger.replace(/_/g, " ")}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: "var(--v4-ink-100)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          color: "var(--v4-ink-300)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {remainingMin}m left
      </span>
    </div>
  );
}
