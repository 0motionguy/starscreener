"use client";

// StarScreener — AlertConfig (watchlist page surface).
//
// Wires the alerts UI to the live pipeline API:
//
//   GET    /api/pipeline/alerts/rules   → list rules (userId from cookie)
//   POST   /api/pipeline/alerts/rules   → create rule
//   DELETE /api/pipeline/alerts/rules?id=<id>
//   GET    /api/pipeline/alerts         → recent fired events
//   POST   /api/pipeline/alerts         → mark event read
//
// Auth model (prod): an HMAC-signed `ss_user` cookie issued by
// POST /api/auth/session. Every fetch below runs with credentials:"include"
// so the cookie rides along. The server derives userId from the signed
// payload — `?userId=` and body `userId=` are ignored.
//
// Auth model (dev, no SESSION_SECRET): the session route returns
// { kind: "dev-fallback", userId: "local" } without setting a cookie, and
// verifyUserAuth falls back to userId="local" on the server.
//
// Rule enable/disable state is local-only for now — the backend route set
// doesn't expose a PUT /rules endpoint, so toggling a rule disables it
// client-side and persists through delete+recreate when the user flips it
// back. Keeping the toggle local avoids pretending to sync something we
// can't persist.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellRing,
  Medal,
  Plus,
  Rocket,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useWatchlistStore } from "@/lib/store";
import { cn, getRelativeTime } from "@/lib/utils";
import {
  toastAlertCreated,
  toastAlertDeleted,
  toastAlertError,
} from "@/lib/toast";
import { BrowserAlertToggle } from "@/components/watchlist/BrowserAlertToggle";
import type { Repo } from "@/lib/types";
import type {
  AlertEvent,
  AlertRule,
  AlertTriggerType,
} from "@/lib/pipeline/types";

/**
 * Compact per-id name map shape — we only need the full name for the
 * alert UI labels.
 */
interface RepoNameMap {
  [id: string]: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Shared fetch options for per-user endpoints. credentials:"include" ensures
// the ss_user cookie rides along with same-origin requests; cache:"no-store"
// keeps the browser from serving stale alert feeds.
const USER_FETCH_INIT: RequestInit = {
  credentials: "include",
  cache: "no-store",
};

// Legacy value kept ONLY as a doc reference — all user identity now flows
// through the ss_user cookie. Do not send userId in request bodies or query
// strings; the server ignores them.
// const USER_ID = "local";

// Best-effort session bootstrap: POST /api/auth/session if no ss_user cookie
// exists yet. Safe to call more than once — the server treats a second POST
// with no email as a renewal rather than a fresh identity. Returns whether
// the server accepted the call; callers don't block on it (the alerts
// requests below will 401 if the bootstrap failed, and the component's
// error banner surfaces that).
async function ensureSessionCookie(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "include",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

const TRIGGER_OPTIONS: {
  value: AlertTriggerType;
  label: string;
  icon: typeof Zap;
  defaultThreshold: number;
  needsThreshold: boolean;
}[] = [
  {
    value: "star_spike",
    label: "Star Spike",
    icon: Zap,
    defaultThreshold: 100,
    needsThreshold: true,
  },
  {
    value: "new_release",
    label: "New Release",
    icon: Rocket,
    defaultThreshold: 0,
    needsThreshold: false,
  },
  {
    value: "breakout_detected",
    label: "Breakout",
    icon: TrendingUp,
    defaultThreshold: 0,
    needsThreshold: false,
  },
  {
    value: "rank_jump",
    label: "Rank Climb",
    icon: Medal,
    defaultThreshold: 5,
    needsThreshold: true,
  },
];

const TRIGGER_BY_VALUE = new Map(TRIGGER_OPTIONS.map((t) => [t.value, t]));

// ---------------------------------------------------------------------------
// Toggle switch — pure UI
// ---------------------------------------------------------------------------

function ToggleSwitch({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-[var(--radius-badge,999px)]",
        "transition-colors duration-200 ease-in-out",
        enabled ? "bg-accent-green" : "bg-border-primary",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm",
          "transform transition-transform duration-200 ease-in-out",
          "translate-y-0.5",
          enabled ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Trigger pills
// ---------------------------------------------------------------------------

function TypePills({
  selected,
  onSelect,
}: {
  selected: AlertTriggerType;
  onSelect: (t: AlertTriggerType) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TRIGGER_OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = selected === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-button)] text-xs font-medium",
              "border transition-colors duration-150 cursor-pointer min-h-[36px]",
              active
                ? "bg-accent-green/10 border-accent-green/40 text-accent-green"
                : "bg-bg-card border-border-primary text-text-secondary hover:border-text-tertiary",
            )}
          >
            <Icon size={12} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

function CreateAlertForm({
  onCreate,
  onCancel,
  submitting,
  repoNames,
}: {
  onCreate: (input: {
    trigger: AlertTriggerType;
    threshold: number;
    repoId: string | null;
  }) => Promise<boolean>;
  onCancel: () => void;
  submitting: boolean;
  repoNames: RepoNameMap;
}) {
  const watchlistRepos = useWatchlistStore((s) => s.repos);
  const [selectedRepoId, setSelectedRepoId] = useState<string>(
    watchlistRepos[0]?.repoId ?? "",
  );
  const [trigger, setTrigger] = useState<AlertTriggerType>("star_spike");
  const [threshold, setThreshold] = useState<number>(100);

  const cfg = TRIGGER_BY_VALUE.get(trigger);

  const handleTypeChange = (t: AlertTriggerType) => {
    setTrigger(t);
    setThreshold(TRIGGER_BY_VALUE.get(t)?.defaultThreshold ?? 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepoId) return;
    const ok = await onCreate({
      trigger,
      threshold,
      repoId: selectedRepoId,
    });
    if (ok) {
      // Parent will close the form after successful creation.
    }
  };

  if (watchlistRepos.length === 0) {
    return (
      <div className="bg-bg-card border border-border-primary rounded-[var(--radius-card)] p-4 text-sm text-text-tertiary">
        Add repos to your watchlist first to create alerts.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-bg-card border border-border-primary rounded-[var(--radius-card)] p-4 space-y-4 animate-[fade-in_0.2s_ease-out]"
    >
      {/* Repo selector */}
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Repository
        </label>
        <select
          value={selectedRepoId}
          onChange={(e) => setSelectedRepoId(e.target.value)}
          className={cn(
            "w-full px-3 py-2 rounded-[var(--radius-button)] text-sm min-h-[44px]",
            "bg-bg-primary border border-border-primary text-text-primary",
            "focus:outline-none focus:border-accent-green/50",
          )}
        >
          {watchlistRepos.map((item) => (
            <option key={item.repoId} value={item.repoId}>
              {repoNames[item.repoId] ?? item.repoId}
            </option>
          ))}
        </select>
      </div>

      {/* Alert type */}
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Alert Type
        </label>
        <TypePills selected={trigger} onSelect={handleTypeChange} />
      </div>

      {/* Threshold */}
      {cfg?.needsThreshold && (
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            {trigger === "star_spike"
              ? "Minimum stars gained"
              : "Rank positions changed"}
          </label>
          <input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className={cn(
              "w-32 px-3 py-2 rounded-[var(--radius-button)] text-sm font-mono min-h-[44px]",
              "bg-bg-primary border border-border-primary text-text-primary",
              "focus:outline-none focus:border-accent-green/50",
            )}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "px-4 py-2 rounded-[var(--radius-button)] text-sm font-medium min-h-[44px]",
            "bg-accent-green/10 text-accent-green",
            "hover:bg-accent-green/20 transition-colors duration-150 cursor-pointer",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          {submitting ? "Creating..." : "Create Alert"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className={cn(
            "px-4 py-2 rounded-[var(--radius-button)] text-sm font-medium min-h-[44px]",
            "text-text-secondary hover:text-text-primary",
            "transition-colors duration-150 cursor-pointer",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Rule row
// ---------------------------------------------------------------------------

function RuleRow({
  rule,
  locallyEnabled,
  onToggle,
  onDelete,
  repoNames,
}: {
  rule: AlertRule;
  locallyEnabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
  repoNames: RepoNameMap;
}) {
  const repoName = rule.repoId ? repoNames[rule.repoId] : null;
  const cfg = TRIGGER_BY_VALUE.get(rule.trigger);
  const Icon = cfg?.icon ?? Bell;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3",
        "bg-bg-card border border-border-primary rounded-[var(--radius-card)]",
        !locallyEnabled && "opacity-50",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-badge,999px)] text-[10px] font-medium uppercase tracking-wider",
            "bg-accent-green/10 text-accent-green",
          )}
        >
          <Icon size={10} />
          {cfg?.label ?? rule.trigger}
        </span>

        <span className="text-sm text-text-primary font-medium truncate">
          {repoName ?? rule.repoId ?? "All repos"}
        </span>

        {rule.threshold > 0 && (
          <span className="text-xs font-mono text-text-tertiary">
            &ge;{rule.threshold}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <ToggleSwitch enabled={locallyEnabled} onToggle={onToggle} />
        <button
          type="button"
          onClick={onDelete}
          className={cn(
            "inline-flex size-11 items-center justify-center rounded-[var(--radius-button)]",
            "text-text-tertiary hover:text-accent-red hover:bg-accent-red/10",
            "transition-colors duration-150 cursor-pointer",
          )}
          aria-label="Delete alert"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event row (recent fired alerts)
// ---------------------------------------------------------------------------

function EventRow({
  event,
  onMarkRead,
  repoNames,
}: {
  event: AlertEvent;
  onMarkRead: () => void;
  repoNames: RepoNameMap;
}) {
  const repoName = repoNames[event.repoId] ?? null;
  const unread = event.readAt === null;
  const cfg = TRIGGER_BY_VALUE.get(event.trigger);
  const Icon = cfg?.icon ?? BellRing;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3",
        "bg-bg-card border border-border-primary rounded-[var(--radius-card)]",
        unread && "border-accent-green/40",
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <Icon
          size={14}
          className={cn(
            "mt-0.5 shrink-0",
            unread ? "text-accent-green" : "text-text-tertiary",
          )}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-text-primary truncate">
              {repoName ?? event.repoId}
            </span>
            <span className="text-[10px] font-mono text-text-tertiary tabular-nums shrink-0">
              {getRelativeTime(event.firedAt)}
            </span>
          </div>
          <div className="text-xs text-text-secondary truncate">
            {event.title}
          </div>
          {event.body ? (
            <div className="text-[11px] text-text-tertiary line-clamp-1">
              {event.body}
            </div>
          ) : null}
        </div>
      </div>
      {unread ? (
        <button
          type="button"
          onClick={onMarkRead}
          className={cn(
            "shrink-0 px-2 py-1 rounded-[var(--radius-button)] text-[11px] font-medium",
            "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary",
            "transition-colors duration-150 min-h-[32px]",
          )}
        >
          Mark read
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AlertConfig() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Local enabled override so the toggle feels responsive even though the
  // API doesn't persist it. Key is rule.id → enabled boolean.
  const [localEnabled, setLocalEnabled] = useState<Record<string, boolean>>({});

  // Cache of repoId → fullName, populated lazily as we discover ids from
  // the watchlist, live rules, or fired events. Replaces the Phase 0
  // mock-data getRepoById lookups.
  const [repoNames, setRepoNames] = useState<RepoNameMap>({});
  const watchlistRepos = useWatchlistStore((s) => s.repos);

  // --------------------------- data fetchers ---------------------------

  const refreshRules = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/pipeline/alerts/rules",
        USER_FETCH_INIT,
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as {
        ok: boolean;
        rules?: AlertRule[];
        error?: string;
      };
      if (!data.ok || !data.rules) {
        throw new Error(data.error ?? "failed to load rules");
      }
      setRules(data.rules);
      setLocalEnabled((prev) => {
        const next = { ...prev };
        for (const r of data.rules ?? []) {
          if (next[r.id] === undefined) next[r.id] = r.enabled;
        }
        // Prune stale keys.
        const alive = new Set((data.rules ?? []).map((r) => r.id));
        for (const id of Object.keys(next)) {
          if (!alive.has(id)) delete next[id];
        }
        return next;
      });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return false;
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/pipeline/alerts",
        USER_FETCH_INIT,
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as {
        ok: boolean;
        events?: AlertEvent[];
        error?: string;
      };
      if (!data.ok || !data.events) {
        throw new Error(data.error ?? "failed to load events");
      }
      setEvents(data.events);
      return true;
    } catch (err) {
      // Events are non-critical; log but don't surface as a fatal error.
      console.error("[AlertConfig] refreshEvents failed", err);
      return false;
    }
  }, []);

  // Initial load — ensures the ss_user session cookie exists before hitting
  // the per-user endpoints. In dev with no SESSION_SECRET the bootstrap
  // returns { userId: "local", kind: "dev-fallback" } and the downstream
  // GETs succeed via the server's dev fallback path.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      await ensureSessionCookie();
      if (!active) return;
      const [rulesOk] = await Promise.all([refreshRules(), refreshEvents()]);
      if (!active) return;
      setLoading(false);
      if (!rulesOk) return; // error state already set
    })();
    return () => {
      active = false;
    };
  }, [refreshRules, refreshEvents]);

  // Hydrate repoId → fullName via /api/repos?ids= whenever the union of
  // ids we care about (watchlist + rules + events) grows beyond what we've
  // already resolved. Keeps the alerts UI label-accurate without loading
  // the full repo catalog on mount.
  useEffect(() => {
    const ids = new Set<string>();
    for (const w of watchlistRepos) ids.add(w.repoId);
    for (const r of rules) if (r.repoId) ids.add(r.repoId);
    for (const e of events) ids.add(e.repoId);
    const missing = Array.from(ids).filter((id) => !repoNames[id]);
    if (missing.length === 0) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/repos?ids=${encodeURIComponent(missing.join(","))}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { repos?: Repo[] };
        setRepoNames((prev) => {
          const next = { ...prev };
          for (const r of Array.isArray(data.repos) ? data.repos : []) {
            next[r.id] = r.fullName;
          }
          return next;
        });
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[AlertConfig] resolveRepoNames failed", err);
      }
    })();
    return () => controller.abort();
    // repoNames intentionally omitted — we derive `missing` from it inside
    // the effect, and including it would loop each time we set names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistRepos, rules, events]);

  // --------------------------- mutations ---------------------------

  const handleCreate = useCallback(
    async (input: {
      trigger: AlertTriggerType;
      threshold: number;
      repoId: string | null;
    }) => {
      setSubmitting(true);
      try {
        const res = await fetch("/api/pipeline/alerts/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            // userId is derived server-side from the ss_user cookie; we
            // intentionally do NOT send one (it would be ignored anyway).
            trigger: input.trigger,
            threshold: input.threshold,
            repoId: input.repoId,
            enabled: true,
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          rule?: AlertRule;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.rule) {
          const msg = data.error ?? `failed to create (${res.status})`;
          toastAlertError(msg);
          return false;
        }
        setRules((prev) => [...prev, data.rule!]);
        setLocalEnabled((prev) => ({ ...prev, [data.rule!.id]: true }));
        setShowForm(false);
        toastAlertCreated();
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toastAlertError(msg);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(
        `/api/pipeline/alerts/rules?id=${encodeURIComponent(id)}`,
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
      setRules((prev) => prev.filter((r) => r.id !== id));
      setLocalEnabled((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toastAlertDeleted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastAlertError(msg);
    }
  }, []);

  const handleToggleLocal = useCallback((id: string) => {
    setLocalEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleMarkRead = useCallback(async (eventId: string) => {
    try {
      const res = await fetch("/api/pipeline/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventId }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as {
        ok: boolean;
      };
      if (!res.ok || !data.ok) return;
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId ? { ...e, readAt: new Date().toISOString() } : e,
        ),
      );
    } catch (err) {
      console.error("[AlertConfig] markRead failed", err);
    }
  }, []);

  // --------------------------- render ---------------------------

  const unreadCount = useMemo(
    () => events.filter((e) => e.readAt === null).length,
    [events],
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-text-secondary" />
          <h2 className="text-lg font-semibold text-text-primary">Alerts</h2>
          {rules.length > 0 && (
            <span className="text-xs font-mono text-text-tertiary">
              ({rules.length})
            </span>
          )}
        </div>

        <div className="flex items-start gap-2">
          <BrowserAlertToggle />
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-button)] text-xs font-medium min-h-[36px]",
                "bg-accent-green/10 text-accent-green",
                "hover:bg-accent-green/20 transition-colors duration-150 cursor-pointer",
              )}
            >
              <Plus size={13} />
              Add Alert
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-xs text-accent-red">
          Failed to load alerts: {error}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="mb-4">
          <CreateAlertForm
            onCreate={handleCreate}
            onCancel={() => setShowForm(false)}
            submitting={submitting}
            repoNames={repoNames}
          />
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 rounded-[var(--radius-card)] bg-bg-card border border-border-primary animate-pulse"
            />
          ))}
        </div>
      ) : rules.length > 0 ? (
        <div className="flex flex-col gap-2">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              locallyEnabled={localEnabled[rule.id] ?? rule.enabled}
              onToggle={() => handleToggleLocal(rule.id)}
              onDelete={() => handleDelete(rule.id)}
              repoNames={repoNames}
            />
          ))}
        </div>
      ) : (
        !showForm && (
          <p className="text-sm text-text-tertiary py-4">
            No alerts configured
          </p>
        )
      )}

      {/* Recent events */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <BellRing size={16} className="text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
            Recent Alerts
          </h3>
          {unreadCount > 0 && (
            <span className="text-[10px] font-mono text-accent-green">
              {unreadCount} unread
            </span>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-16 rounded-[var(--radius-card)] bg-bg-card border border-border-primary animate-pulse"
              />
            ))}
          </div>
        ) : events.length > 0 ? (
          <div className="flex flex-col gap-2">
            {events.slice(0, 10).map((e) => (
              <EventRow
                key={e.id}
                event={e}
                onMarkRead={() => handleMarkRead(e.id)}
                repoNames={repoNames}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary py-4">
            No recent alerts fired yet
          </p>
        )}
      </div>
    </div>
  );
}
