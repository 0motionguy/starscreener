"use client";

// AlertRuleList — cards-per-rule list for /you/alerts.
//
// Optimistic UI: toggling `active` and deleting rows updates local state
// immediately, then reverts on API failure. We use the cookie-based Clerk
// session so every fetch goes out with `credentials: "include"`.
//
// Each card shows:
//   - rule name + active toggle
//   - rule-type badge (4 distinct colors per ALERT_RULE_TYPES)
//   - cadence chip (realtime/daily/weekly)
//   - delivery hint (email vs webhook URL host)
//   - last-fired + total-fires counters
//   - delete button (gated through ConfirmDialog)
//
// Empty state matches the v3 dashed-border pattern used elsewhere
// (see AdminDashboard's "no submissions" tile).

import { useCallback, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Trash2,
  Webhook,
} from "lucide-react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  toastAlertDeleted,
  toastAlertError,
  toastRuleSaved,
} from "@/lib/toast";

import type { ApiErr, ApiOk, SerializedAlertRule } from "./types";

// 4 distinct colors per ALERT_RULE_TYPES — matches the picker in
// AddAlertRuleDialog so users see the same color end-to-end.
const RULE_TYPE_BADGE: Record<
  string,
  { borderColor: string; background: string; color: string; label: string }
> = {
  breakout: {
    borderColor: "var(--v3-acc)",
    background: "color-mix(in srgb, var(--v3-acc) 12%, transparent)",
    color: "var(--v3-acc)",
    label: "BREAKOUT",
  },
  rank_threshold: {
    borderColor: "var(--v3-sig-amber)",
    background: "color-mix(in srgb, var(--v3-sig-amber) 12%, transparent)",
    color: "var(--v3-sig-amber)",
    label: "RANK",
  },
  release: {
    borderColor: "var(--v3-sig-green)",
    background: "color-mix(in srgb, var(--v3-sig-green) 12%, transparent)",
    color: "var(--v3-sig-green)",
    label: "RELEASE",
  },
  mention_spike: {
    borderColor: "var(--v3-sig-red)",
    background: "color-mix(in srgb, var(--v3-sig-red) 12%, transparent)",
    color: "var(--v3-sig-red)",
    label: "MENTIONS",
  },
};

function fmtCadence(c: string): string {
  if (c === "realtime") return "REALTIME";
  if (c === "daily") return "DAILY";
  if (c === "weekly") return "WEEKLY";
  return c.toUpperCase();
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
}

function summarizeRule(r: SerializedAlertRule): string {
  const cfg = r.ruleConfig as Record<string, unknown>;
  switch (r.ruleType) {
    case "breakout": {
      const repo = typeof cfg.fullName === "string" ? cfg.fullName : null;
      const min = typeof cfg.minScore === "number" ? cfg.minScore : null;
      if (repo) return `${repo}${min !== null ? ` (≥ ${min})` : ""}`;
      return min !== null ? `Any watched repo (≥ ${min})` : "Any watched repo";
    }
    case "rank_threshold": {
      const scope = cfg.scope === "category" ? "category" : "global";
      const dir = cfg.direction === "outof" ? "drops out of" : "enters";
      const max = typeof cfg.maxRank === "number" ? cfg.maxRank : "?";
      return `${dir} ${scope} top ${max}`;
    }
    case "release": {
      const repo = typeof cfg.fullName === "string" ? cfg.fullName : "?";
      const pre = cfg.includePrerelease === true ? " (incl. pre-release)" : "";
      return `New release on ${repo}${pre}`;
    }
    case "mention_spike": {
      const mult =
        typeof cfg.multiplier === "number" ? cfg.multiplier : "?";
      const win = cfg.window === "7d" ? "7d" : "24h";
      const repo = typeof cfg.fullName === "string" ? cfg.fullName : "any";
      return `${repo} mentions ≥ ${mult}× over ${win}`;
    }
    default:
      return "";
  }
}

function webhookHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

interface AlertRuleListProps {
  initialRules: SerializedAlertRule[];
}

export function AlertRuleList({ initialRules }: AlertRuleListProps) {
  const [rules, setRules] = useState<SerializedAlertRule[]>(initialRules);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<SerializedAlertRule | null>(null);

  const onToggle = useCallback(
    async (rule: SerializedAlertRule, next: boolean) => {
      setBusyId(rule.id);
      // Optimistic flip.
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, active: next } : r)),
      );
      try {
        const res = await fetch(`/api/me/alert-rules/${rule.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: next }),
        });
        const data = (await res.json()) as
          | ApiOk<{ rule: SerializedAlertRule }>
          | ApiErr;
        if (!res.ok || data.ok === false) {
          throw new Error(
            (data as ApiErr).message ||
              (data as ApiErr).error ||
              `HTTP ${res.status}`,
          );
        }
        // Reconcile with server truth (also captures any updatedAt drift).
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, ...data.rule } : r)),
        );
        toastRuleSaved();
      } catch (err) {
        // Revert.
        setRules((prev) =>
          prev.map((r) =>
            r.id === rule.id ? { ...r, active: !next } : r,
          ),
        );
        toastAlertError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const onDelete = useCallback(async (rule: SerializedAlertRule) => {
    setBusyId(rule.id);
    // Optimistically remove; if it fails we'll re-insert at original index.
    const prevRules = rules;
    const idx = prevRules.findIndex((r) => r.id === rule.id);
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    try {
      const res = await fetch(`/api/me/alert-rules/${rule.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as ApiOk<unknown> | ApiErr;
      if (!res.ok || data.ok === false) {
        throw new Error(
          (data as ApiErr).message ||
            (data as ApiErr).error ||
            `HTTP ${res.status}`,
        );
      }
      toastAlertDeleted();
    } catch (err) {
      // Revert.
      setRules((prev) => {
        const next = [...prev];
        next.splice(idx, 0, rule);
        return next;
      });
      toastAlertError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
    // intentionally read-only deps — `rules` snapshot is captured locally
    // for the revert path; we don't want toggling rules to invalidate the
    // delete callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rules.length === 0) {
    return (
      <div
        className="rounded-[2px] px-4 py-8 text-center"
        style={{
          border: "1px dashed var(--v3-line-200)",
          background: "var(--v3-bg-025)",
        }}
      >
        <p
          className="font-mono text-[11px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v3-ink-300)" }}
        >
          {"// NO ALERT RULES YET"}
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--v3-ink-300)" }}
        >
          Add one to get notified about your watched repos.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {rules.map((rule) => {
          const badge = RULE_TYPE_BADGE[rule.ruleType] ?? RULE_TYPE_BADGE.breakout;
          const host = webhookHost(rule.webhookUrl);
          const busy = busyId === rule.id;
          return (
            <article
              key={rule.id}
              className="rounded-[2px] p-4"
              style={{
                background: rule.active
                  ? "var(--v3-bg-050)"
                  : "var(--v3-bg-025)",
                border: "1px solid var(--v3-line-200)",
                opacity: rule.active ? 1 : 0.7,
              }}
            >
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                      style={{
                        borderColor: badge.borderColor,
                        background: badge.background,
                        color: badge.color,
                        fontWeight: 500,
                      }}
                    >
                      {badge.label}
                    </span>
                    <span
                      className="rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                      style={{
                        borderColor: "var(--v3-line-200)",
                        background: "var(--v3-bg-100)",
                        color: "var(--v3-ink-200)",
                      }}
                    >
                      {fmtCadence(rule.cadence)}
                    </span>
                    {host ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                        style={{
                          borderColor: "var(--v3-line-200)",
                          background: "var(--v3-bg-100)",
                          color: "var(--v3-ink-200)",
                        }}
                        title={rule.webhookUrl ?? undefined}
                      >
                        <Webhook className="size-3" aria-hidden />
                        {host}
                      </span>
                    ) : null}
                  </div>
                  <h3
                    className="mt-2 truncate font-mono text-sm"
                    style={{ color: "var(--v3-ink-100)", fontWeight: 500 }}
                  >
                    {rule.name}
                  </h3>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--v3-ink-300)" }}
                  >
                    {summarizeRule(rule)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* Active toggle */}
                  <button
                    type="button"
                    onClick={() => void onToggle(rule, !rule.active)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={
                      rule.active
                        ? {
                            borderColor: "var(--v3-sig-green)",
                            background:
                              "color-mix(in srgb, var(--v3-sig-green) 10%, transparent)",
                            color: "var(--v3-sig-green)",
                            fontWeight: 500,
                          }
                        : {
                            borderColor: "var(--v3-line-200)",
                            background: "var(--v3-bg-100)",
                            color: "var(--v3-ink-300)",
                            fontWeight: 500,
                          }
                    }
                    aria-pressed={rule.active}
                  >
                    {busy ? (
                      <LoaderCircle className="size-3 animate-spin" aria-hidden />
                    ) : rule.active ? (
                      <CheckCircle2 className="size-3" aria-hidden />
                    ) : (
                      <AlertCircle className="size-3" aria-hidden />
                    )}
                    {rule.active ? "ACTIVE" : "PAUSED"}
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => setPendingDelete(rule)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-[2px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      borderColor: "var(--v3-line-200)",
                      background: "var(--v3-bg-100)",
                      color: "var(--v3-ink-300)",
                    }}
                    aria-label={`Delete rule ${rule.name}`}
                  >
                    <Trash2 className="size-3" aria-hidden />
                    Delete
                  </button>
                </div>
              </header>

              <footer
                className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3"
                style={{ borderTop: "1px solid var(--v3-line-100)" }}
              >
                <div
                  className="font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{ color: "var(--v3-ink-400)" }}
                >
                  LAST FIRED · {fmtWhen(rule.lastFiredAt)} · TOTAL{" "}
                  {rule.fireCountTotal} · TODAY {rule.fireCountToday}
                </div>
                <a
                  href={`/api/me/alert-events?ruleId=${encodeURIComponent(rule.id)}&limit=50`}
                  className="font-mono text-[10px] uppercase tracking-[0.16em] underline"
                  style={{ color: "var(--v3-ink-300)" }}
                >
                  View events →
                </a>
              </footer>
            </article>
          );
        })}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete alert rule?"
        description={
          pendingDelete ? (
            <span>
              Delete <strong>{pendingDelete.name}</strong>? You&apos;ll stop
              receiving notifications for this rule. This cannot be undone.
            </span>
          ) : null
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        busy={pendingDelete ? busyId === pendingDelete.id : false}
        onConfirm={() => {
          if (!pendingDelete) return;
          const target = pendingDelete;
          setPendingDelete(null);
          void onDelete(target);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

export default AlertRuleList;
