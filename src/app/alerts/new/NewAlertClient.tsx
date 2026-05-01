"use client";

// /alerts/new — V4 W10-B alert rule creation form (client leaf).
//
// Composes through ProfileTemplate (PageHead crumb + KpiBand context strip
// + 2-col body):
//
//   // 01 Rule     → form fields (repo, trigger, threshold, cooldown)
//   // 02 Preview  → live <AlertTriggerCard> using the in-flight rule
//
// Submit POSTs to /api/pipeline/alerts/rules — same endpoint AlertConfig +
// /watchlist use. Auth is identical (ss_user cookie via ensureSessionCookie
// bootstrap). On success we toast + redirect to /alerts so the user lands
// where their fresh rule + downstream events live.
//
// All chrome uses inline `var(--v4-*)` tokens to match the V4 templates.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import type { Repo } from "@/lib/types";
import type {
  AlertRule,
  AlertTriggerType,
} from "@/lib/pipeline/types";
import { useWatchlistStore } from "@/lib/store";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { AlertTriggerCard } from "@/components/alerts/AlertTriggerCard";
import {
  toastAlertCreated,
  toastAlertError,
} from "@/lib/toast";

// ---------------------------------------------------------------------------
// Trigger metadata — shared with /watchlist's AlertConfig form. Kept inline
// to keep the new route self-contained; the canonical type lives in
// src/lib/pipeline/types.ts.
// ---------------------------------------------------------------------------

interface TriggerOption {
  value: AlertTriggerType;
  label: string;
  defaultThreshold: number;
  needsThreshold: boolean;
  thresholdLabel: string;
  description: string;
}

const TRIGGER_OPTIONS: TriggerOption[] = [
  {
    value: "star_spike",
    label: "Star spike",
    defaultThreshold: 100,
    needsThreshold: true,
    thresholdLabel: "Minimum stars gained in 24h",
    description: "Fires when daily star delta exceeds the threshold.",
  },
  {
    value: "new_release",
    label: "New release",
    defaultThreshold: 0,
    needsThreshold: false,
    thresholdLabel: "",
    description: "Fires when the repo publishes a new release tag.",
  },
  {
    value: "breakout_detected",
    label: "Breakout",
    defaultThreshold: 0,
    needsThreshold: false,
    thresholdLabel: "",
    description: "Fires when the classifier flags the repo as a breakout.",
  },
  {
    value: "rank_jump",
    label: "Rank climb",
    defaultThreshold: 5,
    needsThreshold: true,
    thresholdLabel: "Rank positions changed",
    description: "Fires when the leaderboard rank improves by N places.",
  },
];

const TRIGGER_BY_VALUE = new Map(TRIGGER_OPTIONS.map((t) => [t.value, t]));

const DEFAULT_COOLDOWN_MINUTES = 60;

// Best-effort cookie bootstrap — same shape /watchlist uses. Swallow
// errors; the actual create call surfaces auth failures via toast.
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

// ---------------------------------------------------------------------------
// Inline chrome helpers — V4 token surfaces only.
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--v4-ink-300)",
  marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  minHeight: 40,
  background: "var(--v4-bg-025)",
  border: "1px solid var(--v4-line-200)",
  borderRadius: 2,
  color: "var(--v4-ink-100)",
  fontFamily: "inherit",
  fontSize: 13,
};

const monoFieldStyle: React.CSSProperties = {
  ...fieldStyle,
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 12,
  width: 160,
};

function pillStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    minHeight: 32,
    border: `1px solid ${active ? "var(--v4-acc)" : "var(--v4-line-200)"}`,
    background: active ? "var(--v4-acc-soft)" : "var(--v4-bg-050)",
    color: active ? "var(--v4-acc)" : "var(--v4-ink-200)",
    borderRadius: 2,
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: 11,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    cursor: "pointer",
    transition: "border-color 150ms ease, background 150ms ease",
  };
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

export default function NewAlertClient() {
  const router = useRouter();

  // Hydration gate — zustand-persist reads localStorage post-mount.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    document.title = "New alert — TrendingRepo";
  }, []);

  const watchlistRepos = useWatchlistStore((s) => s.repos);

  const [reposById, setReposById] = useState<Record<string, Repo>>({});

  const [trigger, setTrigger] = useState<AlertTriggerType>("star_spike");
  const [threshold, setThreshold] = useState<number>(100);
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(
    DEFAULT_COOLDOWN_MINUTES,
  );
  const [repoId, setRepoId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate watchlist repo display names so the selector shows fullName
  // instead of opaque internal ids — same /api/repos pattern AlertConfig
  // uses on /watchlist.
  const repoIdKey = useMemo(
    () => watchlistRepos.map((r) => r.repoId).sort().join(","),
    [watchlistRepos],
  );

  useEffect(() => {
    if (!hydrated) return;
    if (repoIdKey === "") {
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
        console.error("[alerts/new] repos fetch failed", err);
      }
    })();
    return () => controller.abort();
  }, [repoIdKey, hydrated]);

  // Default to first watched repo once hydrated.
  useEffect(() => {
    if (!hydrated) return;
    if (repoId !== "") return;
    const first = watchlistRepos[0]?.repoId;
    if (first) setRepoId(first);
  }, [hydrated, watchlistRepos, repoId]);

  const cfg = TRIGGER_BY_VALUE.get(trigger) ?? TRIGGER_OPTIONS[0];

  const handleTriggerChange = useCallback((next: AlertTriggerType) => {
    setTrigger(next);
    setThreshold(TRIGGER_BY_VALUE.get(next)?.defaultThreshold ?? 0);
  }, []);

  // Build a synthetic AlertRule purely for the live preview. id/createdAt
  // are placeholders; the real id is assigned server-side after create.
  const previewRule: AlertRule = useMemo(
    () => ({
      id: "preview",
      userId: "preview",
      repoId: repoId || null,
      categoryId: null,
      trigger,
      threshold: cfg.needsThreshold ? threshold : 0,
      cooldownMinutes,
      enabled: true,
      createdAt: new Date().toISOString(),
      lastFiredAt: null,
    }),
    [repoId, trigger, threshold, cooldownMinutes, cfg.needsThreshold],
  );

  const previewRepoLabel = repoId
    ? reposById[repoId]?.fullName ?? repoId
    : "all repos";

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (cfg.needsThreshold && (!Number.isFinite(threshold) || threshold < 0)) {
        setError("Threshold must be a non-negative number.");
        return;
      }
      if (!Number.isFinite(cooldownMinutes) || cooldownMinutes < 0) {
        setError("Cooldown must be a non-negative number of minutes.");
        return;
      }

      setSubmitting(true);
      try {
        await ensureSessionCookie();
        const res = await fetch("/api/pipeline/alerts/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            trigger,
            threshold: cfg.needsThreshold ? threshold : 0,
            repoId: repoId || null,
            cooldownMinutes,
            enabled: true,
          }),
        });
        const data = (await res.json().catch(() => ({ ok: false }))) as {
          ok: boolean;
          rule?: AlertRule;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.rule) {
          const msg = data.error ?? `failed to create (${res.status})`;
          setError(msg);
          toastAlertError(msg);
          return;
        }
        toastAlertCreated();
        router.push("/alerts");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        toastAlertError(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [cfg.needsThreshold, threshold, cooldownMinutes, trigger, repoId, router],
  );

  const watchCount = hydrated ? watchlistRepos.length : 0;

  return (
    <main className="home-surface alerts-new-page">
      <ProfileTemplate
        crumb={
          <>
            <b>NEW ALERT</b> · TERMINAL · /ALERTS/NEW
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
              Wire up a new alert.
            </h1>
            <p
              className="v4-page-head__lede"
              style={{ marginTop: 0, marginBottom: 0 }}
            >
              Pick a tracked repo, choose a trigger, set the threshold —
              we&rsquo;ll fire a browser notification the moment the condition
              hits.
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
            {watchCount} tracked repo{watchCount === 1 ? "" : "s"}
          </span>
        }
        kpiBand={
          <KpiBand
            cells={[
              {
                label: "Trigger",
                value: cfg.label.toUpperCase(),
                sub: cfg.needsThreshold ? `≥${threshold}` : "binary",
                tone: "acc",
              },
              {
                label: "Cooldown",
                value: `${cooldownMinutes}m`,
                sub: "between fires",
                tone: "default",
              },
              {
                label: "Target",
                value: repoId ? "1 repo" : "ALL",
                sub: previewRepoLabel,
                tone: repoId ? "default" : "amber",
              },
              {
                label: "Watchlist",
                value: String(watchCount),
                sub: watchCount === 0 ? "add repos first" : "available",
                tone: watchCount > 0 ? "money" : "amber",
              },
            ]}
          />
        }
        mainPanels={
          <>
            <SectionHead num="// 01" title="Rule" meta="DEFINITION" />
            {hydrated && watchlistRepos.length === 0 ? (
              <EmptyWatchlistState />
            ) : (
              <form
                onSubmit={handleSubmit}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  border: "1px solid var(--v4-line-200)",
                  background: "var(--v4-bg-025)",
                  borderRadius: 2,
                  padding: 16,
                }}
              >
                {/* Repo selector */}
                <div>
                  <label htmlFor="alert-repo" style={labelStyle}>
                    Repository
                  </label>
                  <select
                    id="alert-repo"
                    value={repoId}
                    onChange={(e) => setRepoId(e.target.value)}
                    style={fieldStyle}
                    disabled={!hydrated}
                  >
                    {watchlistRepos.map((item) => (
                      <option key={item.repoId} value={item.repoId}>
                        {reposById[item.repoId]?.fullName ?? item.repoId}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Trigger pills */}
                <div>
                  <label style={labelStyle}>Trigger</label>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    {TRIGGER_OPTIONS.map((option) => {
                      const active = option.value === trigger;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleTriggerChange(option.value)}
                          style={pillStyle(active)}
                          aria-pressed={active}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: 12,
                      color: "var(--v4-ink-300)",
                    }}
                  >
                    {cfg.description}
                  </p>
                </div>

                {/* Threshold (conditional) */}
                {cfg.needsThreshold ? (
                  <div>
                    <label htmlFor="alert-threshold" style={labelStyle}>
                      {cfg.thresholdLabel}
                    </label>
                    <input
                      id="alert-threshold"
                      type="number"
                      min={0}
                      value={threshold}
                      onChange={(e) =>
                        setThreshold(Number(e.target.value))
                      }
                      style={monoFieldStyle}
                    />
                  </div>
                ) : null}

                {/* Cooldown */}
                <div>
                  <label htmlFor="alert-cooldown" style={labelStyle}>
                    Cooldown (minutes between fires)
                  </label>
                  <input
                    id="alert-cooldown"
                    type="number"
                    min={0}
                    value={cooldownMinutes}
                    onChange={(e) =>
                      setCooldownMinutes(Number(e.target.value))
                    }
                    style={monoFieldStyle}
                  />
                </div>

                {/* Error banner */}
                {error ? (
                  <div
                    style={{
                      padding: "8px 12px",
                      border: "1px solid var(--v4-red)",
                      background: "var(--v4-red-soft)",
                      color: "var(--v4-red)",
                      borderRadius: 2,
                      fontSize: 12,
                    }}
                  >
                    {error}
                  </div>
                ) : null}

                {/* Actions */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    paddingTop: 4,
                  }}
                >
                  <button
                    type="submit"
                    disabled={submitting || !hydrated || !repoId}
                    style={{
                      padding: "8px 16px",
                      minHeight: 36,
                      border: "1px solid var(--v4-acc)",
                      background: "var(--v4-acc-soft)",
                      color: "var(--v4-acc)",
                      borderRadius: 2,
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      cursor:
                        submitting || !hydrated || !repoId
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        submitting || !hydrated || !repoId ? 0.6 : 1,
                    }}
                  >
                    {submitting ? "Creating…" : "Create alert →"}
                  </button>
                  <Link
                    href="/alerts"
                    style={{
                      padding: "8px 16px",
                      minHeight: 36,
                      display: "inline-flex",
                      alignItems: "center",
                      border: "1px solid var(--v4-line-200)",
                      background: "var(--v4-bg-050)",
                      color: "var(--v4-ink-200)",
                      borderRadius: 2,
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 11,
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      textDecoration: "none",
                    }}
                  >
                    Cancel
                  </Link>
                </div>
              </form>
            )}
          </>
        }
        rightRail={
          <>
            <SectionHead num="// 02" title="Preview" meta="LIVE" />
            <p
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 10,
                color: "var(--v4-ink-300)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: "0 0 8px",
              }}
            >
              {"// HOW THE RULE WILL APPEAR ON /WATCHLIST"}
            </p>
            <AlertTriggerCard
              rule={previewRule}
              repoLabel={previewRepoLabel}
            />
            <p
              style={{
                marginTop: 12,
                fontSize: 12,
                color: "var(--v4-ink-300)",
                lineHeight: 1.5,
              }}
            >
              The rule will appear on your <b>/watchlist</b> next to the
              browser-alerts toggle. Toggle it off any time without losing the
              definition.
            </p>
          </>
        }
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Empty watchlist short-circuit
// ---------------------------------------------------------------------------

function EmptyWatchlistState() {
  return (
    <div
      style={{
        border: "1px dashed var(--v4-line-200)",
        borderRadius: 2,
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
        {"// WATCHLIST IS EMPTY"}
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--v4-ink-200)",
          maxWidth: 360,
          margin: "0 auto 16px",
        }}
      >
        Add at least one repo to your watchlist before creating an alert.
        Click the eye icon on any repo card to track it.
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
