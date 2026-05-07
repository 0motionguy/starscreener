"use client";

// AddAlertRuleDialog — modal-form for creating an alert rule.
//
// Native <dialog> (matching ConfirmDialog's pattern in this repo — no
// @radix-ui/react-dialog dep, simpler focus-management story). Form state
// is plain useState; we don't pull in react-hook-form for a 4-field form.
//
// Three logical steps shown in one scroll surface:
//   1. type picker — 4 chips, color-coded to match AlertRuleList
//   2. type-specific config — minimal Zod-mirroring inputs
//   3. cadence + optional webhook URL + optional per-rule quiet hours
//
// On a successful POST that included a webhook URL, the response carries
// `plaintextSecret = "whsec_..."`. We swap the dialog body to a one-time
// secret-reveal screen and refuse to close until the user has copied it.

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  toastAlertCreated,
  toastAlertError,
  toastWebhookSecretCopied,
} from "@/lib/toast";

import type {
  ApiErr,
  ApiOk,
  AlertRuleConfig,
  CreateAlertRuleBody,
  QuietHours,
  SerializedAlertRule,
} from "./types";
import type { AlertRuleType, AlertCadence } from "@/lib/db/schema/alerts";

interface AddAlertRuleDialogProps {
  existingRuleCount: number;
  defaultTimezone: string;
}

const RULE_TYPE_OPTIONS: Array<{
  value: AlertRuleType;
  label: string;
  description: string;
  badge: { borderColor: string; background: string; color: string };
}> = [
  {
    value: "breakout",
    label: "Breakout",
    description:
      "Repo hits multiple cross-source channels in 24h (default min score 0.6).",
    badge: {
      borderColor: "var(--v3-acc)",
      background: "color-mix(in srgb, var(--v3-acc) 12%, transparent)",
      color: "var(--v3-acc)",
    },
  },
  {
    value: "rank_threshold",
    label: "Rank threshold",
    description: "Repo enters or drops out of a top-N (global or category).",
    badge: {
      borderColor: "var(--v3-sig-amber)",
      background: "color-mix(in srgb, var(--v3-sig-amber) 12%, transparent)",
      color: "var(--v3-sig-amber)",
    },
  },
  {
    value: "release",
    label: "Release",
    description: "New GitHub release / npm version on a specific repo.",
    badge: {
      borderColor: "var(--v3-sig-green)",
      background: "color-mix(in srgb, var(--v3-sig-green) 12%, transparent)",
      color: "var(--v3-sig-green)",
    },
  },
  {
    value: "mention_spike",
    label: "Mention spike",
    description: "Mention count exceeds a multiplier-of-baseline over a window.",
    badge: {
      borderColor: "var(--v3-sig-red)",
      background: "color-mix(in srgb, var(--v3-sig-red) 12%, transparent)",
      color: "var(--v3-sig-red)",
    },
  },
];

type DialogPhase = "form" | "secret-reveal";

export function AddAlertRuleDialog({
  existingRuleCount,
  defaultTimezone: _defaultTimezone,
}: AddAlertRuleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<DialogPhase>("form");
  const [submitting, setSubmitting] = useState(false);

  // Form state — defaults are intentionally minimal so the user can save
  // a useful "all my watched repos breakout" rule with one click.
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState<AlertRuleType>("breakout");
  const [cadence, setCadence] = useState<AlertCadence>("realtime");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [useQuietHours, setUseQuietHours] = useState(false);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");

  // Type-specific config state.
  const [breakoutFullName, setBreakoutFullName] = useState("");
  const [breakoutMinScore, setBreakoutMinScore] = useState("0.6");
  const [rankScope, setRankScope] = useState<"global" | "category">("global");
  const [rankCategoryId, setRankCategoryId] = useState("");
  const [rankMaxRank, setRankMaxRank] = useState("100");
  const [rankDirection, setRankDirection] = useState<"into" | "outof">("into");
  const [releaseFullName, setReleaseFullName] = useState("");
  const [releaseIncludePre, setReleaseIncludePre] = useState(false);
  const [mentionFullName, setMentionFullName] = useState("");
  const [mentionMultiplier, setMentionMultiplier] = useState("3");
  const [mentionWindow, setMentionWindow] = useState<"24h" | "7d">("24h");

  // Result of a successful POST that included a webhook URL.
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const capExceeded = existingRuleCount >= 25;

  const reset = useCallback(() => {
    setPhase("form");
    setSubmitting(false);
    setName("");
    setRuleType("breakout");
    setCadence("realtime");
    setWebhookUrl("");
    setUseQuietHours(false);
    setQuietStart("22:00");
    setQuietEnd("07:00");
    setBreakoutFullName("");
    setBreakoutMinScore("0.6");
    setRankScope("global");
    setRankCategoryId("");
    setRankMaxRank("100");
    setRankDirection("into");
    setReleaseFullName("");
    setReleaseIncludePre(false);
    setMentionFullName("");
    setMentionMultiplier("3");
    setMentionWindow("24h");
    setRevealedSecret(null);
  }, []);

  // Open / close the underlying <dialog> alongside our `open` state.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // ESC + backdrop click → close, but only when not submitting AND not
  // sitting on the secret-reveal screen (we want the user to actively
  // confirm they've copied the secret).
  const closeAttempt = useCallback(() => {
    if (submitting) return;
    if (phase === "secret-reveal") return;
    setOpen(false);
    reset();
  }, [phase, submitting, reset]);

  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      closeAttempt();
    },
    [closeAttempt],
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === dialogRef.current) closeAttempt();
    },
    [closeAttempt],
  );

  // Build the discriminated config payload from the form state.
  function buildConfig(): AlertRuleConfig | { error: string } {
    if (ruleType === "breakout") {
      const min = breakoutMinScore.trim();
      const minNum = min === "" ? undefined : Number(min);
      if (minNum !== undefined && (Number.isNaN(minNum) || minNum < 0 || minNum > 1)) {
        return { error: "Min score must be 0..1" };
      }
      const fullName = breakoutFullName.trim() || undefined;
      return { minScore: minNum, fullName };
    }
    if (ruleType === "rank_threshold") {
      const max = Number(rankMaxRank);
      if (!Number.isFinite(max) || max < 1) {
        return { error: "Max rank must be ≥ 1" };
      }
      return {
        scope: rankScope,
        categoryId:
          rankScope === "category" ? rankCategoryId.trim() || undefined : undefined,
        maxRank: max,
        direction: rankDirection,
      };
    }
    if (ruleType === "release") {
      const fullName = releaseFullName.trim();
      if (!fullName.includes("/")) {
        return { error: "Repo must be in 'owner/name' form" };
      }
      return { fullName, includePrerelease: releaseIncludePre || undefined };
    }
    if (ruleType === "mention_spike") {
      const mult = Number(mentionMultiplier);
      if (!Number.isFinite(mult) || mult < 1) {
        return { error: "Multiplier must be ≥ 1" };
      }
      return {
        fullName: mentionFullName.trim() || undefined,
        multiplier: mult,
        window: mentionWindow,
      };
    }
    return { error: "Unknown rule type" };
  }

  function buildQuietHours(): QuietHours | null | { error: string } {
    if (!useQuietHours) return null;
    const startMin = parseHHMM(quietStart);
    const endMin = parseHHMM(quietEnd);
    if (startMin === null || endMin === null) {
      return { error: "Quiet hours must be HH:MM" };
    }
    return { startMin, endMin };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const cfg = buildConfig();
    if ("error" in cfg) {
      toastAlertError(cfg.error);
      return;
    }
    const qh = buildQuietHours();
    if (qh && "error" in qh) {
      toastAlertError(qh.error);
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      toastAlertError("Name your rule so you can recognise it later.");
      return;
    }
    const wh = webhookUrl.trim();
    if (wh && !wh.startsWith("https://")) {
      toastAlertError("Webhook URL must start with https://");
      return;
    }

    const body: CreateAlertRuleBody = {
      name: trimmedName,
      ruleType,
      ruleConfig: cfg,
      cadence,
      ...(wh ? { webhookUrl: wh } : {}),
      ...(qh ? { quietHours: qh } : {}),
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/me/alert-rules", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as
        | ApiOk<{ rule: SerializedAlertRule; plaintextSecret?: string }>
        | ApiErr;
      if (!res.ok || data.ok === false) {
        const err = data as ApiErr;
        if (err.error === "rule_cap_exceeded") {
          throw new Error("You have hit the 25-rule limit. Delete one first.");
        }
        throw new Error(err.message || err.error || `HTTP ${res.status}`);
      }
      toastAlertCreated();
      // If a webhook URL was set, the server returned the plaintext secret
      // exactly once. Switch to the reveal phase and force the user to copy
      // it before continuing.
      if (data.plaintextSecret) {
        setRevealedSecret(data.plaintextSecret);
        setPhase("secret-reveal");
      } else {
        setOpen(false);
        reset();
        // The list refreshes on next page load; for now we trigger a soft
        // navigation refresh so the new rule appears.
        window.location.reload();
      }
    } catch (err) {
      toastAlertError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function copySecret() {
    if (!revealedSecret) return;
    try {
      await navigator.clipboard.writeText(revealedSecret);
      toastWebhookSecretCopied();
    } catch {
      toastAlertError("Could not copy. Select the text and copy manually.");
    }
  }

  function finishSecretReveal() {
    setOpen(false);
    reset();
    window.location.reload();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (capExceeded) {
            toastAlertError("You have hit the 25-rule limit. Delete one first.");
            return;
          }
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: "var(--v3-acc-soft)",
          border: "1px solid var(--v3-acc-dim)",
          color: "var(--v3-acc)",
          fontWeight: 500,
        }}
      >
        <Plus className="size-3.5" aria-hidden />
        Add alert rule
      </button>

      <dialog
        ref={dialogRef}
        onCancel={handleCancel}
        onClick={handleBackdropClick}
        aria-labelledby="add-alert-rule-title"
        className={cn(
          "rounded-card border border-border-primary bg-bg-card text-text-primary shadow-xl",
          "p-0 m-auto max-w-2xl w-[min(94vw,40rem)]",
          "backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        )}
      >
        {phase === "form" ? (
          <form onSubmit={handleSubmit} className="px-5 py-4">
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="add-alert-rule-title"
                  className="font-mono text-sm font-semibold uppercase tracking-wider"
                  style={{ color: "var(--v3-ink-100)" }}
                >
                  New alert rule
                </h2>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--v3-ink-300)" }}
                >
                  Choose a type, scope, and cadence. Optionally pipe via webhook.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAttempt}
                className="rounded-[2px] p-1"
                aria-label="Close"
                style={{ color: "var(--v3-ink-400)" }}
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            {/* Step 1 — type picker */}
            <fieldset className="mb-4">
              <legend
                className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                {"// 01 · TYPE"}
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {RULE_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="cursor-pointer rounded-[2px] border p-3 transition-colors"
                    style={
                      ruleType === opt.value
                        ? {
                            borderColor: opt.badge.borderColor,
                            background: opt.badge.background,
                          }
                        : {
                            borderColor: "var(--v3-line-200)",
                            background: "var(--v3-bg-050)",
                          }
                    }
                  >
                    <input
                      type="radio"
                      name="ruleType"
                      value={opt.value}
                      checked={ruleType === opt.value}
                      onChange={() => setRuleType(opt.value)}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="font-mono text-[11px] uppercase tracking-[0.14em]"
                        style={{
                          color:
                            ruleType === opt.value
                              ? opt.badge.color
                              : "var(--v3-ink-200)",
                          fontWeight: 500,
                        }}
                      >
                        {opt.label}
                      </span>
                    </div>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--v3-ink-300)" }}
                    >
                      {opt.description}
                    </p>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Name */}
            <fieldset className="mb-4">
              <legend
                className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                {"// 02 · NAME"}
              </legend>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Next.js breakouts"
                className="w-full rounded-[2px] border px-3 py-2 font-mono text-sm"
                style={{
                  borderColor: "var(--v3-line-200)",
                  background: "var(--v3-bg-050)",
                  color: "var(--v3-ink-100)",
                }}
              />
            </fieldset>

            {/* Step 2 — type-specific config */}
            <fieldset className="mb-4">
              <legend
                className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                {"// 03 · CONFIG"}
              </legend>
              {ruleType === "breakout" ? (
                <BreakoutConfigInputs
                  fullName={breakoutFullName}
                  setFullName={setBreakoutFullName}
                  minScore={breakoutMinScore}
                  setMinScore={setBreakoutMinScore}
                />
              ) : null}
              {ruleType === "rank_threshold" ? (
                <RankThresholdConfigInputs
                  scope={rankScope}
                  setScope={setRankScope}
                  categoryId={rankCategoryId}
                  setCategoryId={setRankCategoryId}
                  maxRank={rankMaxRank}
                  setMaxRank={setRankMaxRank}
                  direction={rankDirection}
                  setDirection={setRankDirection}
                />
              ) : null}
              {ruleType === "release" ? (
                <ReleaseConfigInputs
                  fullName={releaseFullName}
                  setFullName={setReleaseFullName}
                  includePre={releaseIncludePre}
                  setIncludePre={setReleaseIncludePre}
                />
              ) : null}
              {ruleType === "mention_spike" ? (
                <MentionSpikeConfigInputs
                  fullName={mentionFullName}
                  setFullName={setMentionFullName}
                  multiplier={mentionMultiplier}
                  setMultiplier={setMentionMultiplier}
                  window={mentionWindow}
                  setWindow={setMentionWindow}
                />
              ) : null}
            </fieldset>

            {/* Step 3 — cadence + webhook + quiet hours */}
            <fieldset className="mb-4">
              <legend
                className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                {"// 04 · DELIVERY"}
              </legend>

              <div
                className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: "var(--v3-ink-300)" }}
              >
                Cadence
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {(["realtime", "daily", "weekly"] as AlertCadence[]).map(
                  (c) => (
                    <label
                      key={c}
                      className="cursor-pointer rounded-[2px] border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                      style={
                        cadence === c
                          ? {
                              borderColor: "var(--v3-acc)",
                              background: "var(--v3-acc-soft)",
                              color: "var(--v3-acc)",
                              fontWeight: 500,
                            }
                          : {
                              borderColor: "var(--v3-line-200)",
                              background: "var(--v3-bg-050)",
                              color: "var(--v3-ink-300)",
                            }
                      }
                    >
                      <input
                        type="radio"
                        name="cadence"
                        value={c}
                        checked={cadence === c}
                        onChange={() => setCadence(c)}
                        className="sr-only"
                      />
                      {c}
                    </label>
                  ),
                )}
              </div>

              <label
                className="block font-mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: "var(--v3-ink-300)" }}
              >
                Webhook URL (optional, https only)
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://example.com/hooks/trendingrepo"
                className="mt-1 w-full rounded-[2px] border px-3 py-2 font-mono text-sm"
                style={{
                  borderColor: "var(--v3-line-200)",
                  background: "var(--v3-bg-050)",
                  color: "var(--v3-ink-100)",
                }}
              />
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--v3-ink-400)" }}
              >
                You&apos;ll get a signing secret to verify deliveries — shown once.
              </p>

              <label
                className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: "var(--v3-ink-300)" }}
              >
                <input
                  type="checkbox"
                  checked={useQuietHours}
                  onChange={(e) => setUseQuietHours(e.target.checked)}
                />
                Per-rule quiet hours (overrides profile default)
              </label>
              {useQuietHours ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span style={{ color: "var(--v3-ink-300)" }}>
                    From
                  </span>
                  <input
                    type="time"
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                    className="rounded-[2px] border px-2 py-1 font-mono text-xs"
                    style={{
                      borderColor: "var(--v3-line-200)",
                      background: "var(--v3-bg-050)",
                      color: "var(--v3-ink-100)",
                    }}
                  />
                  <span style={{ color: "var(--v3-ink-300)" }}>to</span>
                  <input
                    type="time"
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                    className="rounded-[2px] border px-2 py-1 font-mono text-xs"
                    style={{
                      borderColor: "var(--v3-line-200)",
                      background: "var(--v3-bg-050)",
                      color: "var(--v3-ink-100)",
                    }}
                  />
                </div>
              ) : null}
            </fieldset>

            <footer className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeAttempt}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] disabled:opacity-50"
                style={{
                  borderColor: "var(--v3-line-200)",
                  background: "var(--v3-bg-100)",
                  color: "var(--v3-ink-200)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "var(--v3-acc-soft)",
                  border: "1px solid var(--v3-acc-dim)",
                  color: "var(--v3-acc)",
                  fontWeight: 500,
                }}
              >
                {submitting ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                ) : null}
                Save rule
              </button>
            </footer>
          </form>
        ) : (
          <SecretRevealPanel
            secret={revealedSecret ?? ""}
            onCopy={copySecret}
            onDone={finishSecretReveal}
          />
        )}
      </dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Type-specific config inputs.
// ---------------------------------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block font-mono text-[10px] uppercase tracking-[0.14em]"
      style={{ color: "var(--v3-ink-300)" }}
    >
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  borderColor: "var(--v3-line-200)",
  background: "var(--v3-bg-050)",
  color: "var(--v3-ink-100)",
};

function BreakoutConfigInputs(props: {
  fullName: string;
  setFullName: (v: string) => void;
  minScore: string;
  setMinScore: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Repo (owner/name) — optional, blank = all watched</FieldLabel>
        <input
          type="text"
          value={props.fullName}
          onChange={(e) => props.setFullName(e.target.value)}
          placeholder="vercel/next.js"
          className="mt-1 w-full rounded-[2px] border px-3 py-2 font-mono text-sm"
          style={inputStyle}
        />
      </div>
      <div>
        <FieldLabel>Min breakout score (0–1, default 0.6)</FieldLabel>
        <input
          type="number"
          step="0.05"
          min="0"
          max="1"
          value={props.minScore}
          onChange={(e) => props.setMinScore(e.target.value)}
          className="mt-1 w-32 rounded-[2px] border px-3 py-2 font-mono text-sm"
          style={inputStyle}
        />
      </div>
    </div>
  );
}

function RankThresholdConfigInputs(props: {
  scope: "global" | "category";
  setScope: (v: "global" | "category") => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  maxRank: string;
  setMaxRank: (v: string) => void;
  direction: "into" | "outof";
  setDirection: (v: "into" | "outof") => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Scope</FieldLabel>
        <div className="mt-1 flex gap-2">
          {(["global", "category"] as const).map((s) => (
            <label
              key={s}
              className="cursor-pointer rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]"
              style={
                props.scope === s
                  ? {
                      borderColor: "var(--v3-acc)",
                      background: "var(--v3-acc-soft)",
                      color: "var(--v3-acc)",
                    }
                  : {
                      borderColor: "var(--v3-line-200)",
                      background: "var(--v3-bg-050)",
                      color: "var(--v3-ink-300)",
                    }
              }
            >
              <input
                type="radio"
                name="rankScope"
                checked={props.scope === s}
                onChange={() => props.setScope(s)}
                className="sr-only"
              />
              {s}
            </label>
          ))}
        </div>
      </div>
      {props.scope === "category" ? (
        <div>
          <FieldLabel>Category id (slug)</FieldLabel>
          <input
            type="text"
            value={props.categoryId}
            onChange={(e) => props.setCategoryId(e.target.value)}
            placeholder="ai-agents"
            className="mt-1 w-full rounded-[2px] border px-3 py-2 font-mono text-sm"
            style={inputStyle}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <FieldLabel>Top N</FieldLabel>
          <input
            type="number"
            min="1"
            value={props.maxRank}
            onChange={(e) => props.setMaxRank(e.target.value)}
            className="mt-1 w-28 rounded-[2px] border px-3 py-2 font-mono text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Direction</FieldLabel>
          <div className="mt-1 flex gap-2">
            {(["into", "outof"] as const).map((d) => (
              <label
                key={d}
                className="cursor-pointer rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]"
                style={
                  props.direction === d
                    ? {
                        borderColor: "var(--v3-acc)",
                        background: "var(--v3-acc-soft)",
                        color: "var(--v3-acc)",
                      }
                    : {
                        borderColor: "var(--v3-line-200)",
                        background: "var(--v3-bg-050)",
                        color: "var(--v3-ink-300)",
                      }
                }
              >
                <input
                  type="radio"
                  name="rankDirection"
                  checked={props.direction === d}
                  onChange={() => props.setDirection(d)}
                  className="sr-only"
                />
                {d === "into" ? "ENTERS" : "DROPS OUT"}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReleaseConfigInputs(props: {
  fullName: string;
  setFullName: (v: string) => void;
  includePre: boolean;
  setIncludePre: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Repo (owner/name) — required</FieldLabel>
        <input
          type="text"
          required
          value={props.fullName}
          onChange={(e) => props.setFullName(e.target.value)}
          placeholder="vercel/next.js"
          className="mt-1 w-full rounded-[2px] border px-3 py-2 font-mono text-sm"
          style={inputStyle}
        />
      </div>
      <label
        className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]"
        style={{ color: "var(--v3-ink-300)" }}
      >
        <input
          type="checkbox"
          checked={props.includePre}
          onChange={(e) => props.setIncludePre(e.target.checked)}
        />
        Include pre-releases (rc / beta / alpha)
      </label>
    </div>
  );
}

function MentionSpikeConfigInputs(props: {
  fullName: string;
  setFullName: (v: string) => void;
  multiplier: string;
  setMultiplier: (v: string) => void;
  window: "24h" | "7d";
  setWindow: (v: "24h" | "7d") => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Repo (owner/name) — optional, blank = all watched</FieldLabel>
        <input
          type="text"
          value={props.fullName}
          onChange={(e) => props.setFullName(e.target.value)}
          placeholder="microsoft/typescript"
          className="mt-1 w-full rounded-[2px] border px-3 py-2 font-mono text-sm"
          style={inputStyle}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <FieldLabel>Multiplier (×baseline)</FieldLabel>
          <input
            type="number"
            min="1"
            step="0.5"
            value={props.multiplier}
            onChange={(e) => props.setMultiplier(e.target.value)}
            className="mt-1 w-28 rounded-[2px] border px-3 py-2 font-mono text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Window</FieldLabel>
          <div className="mt-1 flex gap-2">
            {(["24h", "7d"] as const).map((w) => (
              <label
                key={w}
                className="cursor-pointer rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]"
                style={
                  props.window === w
                    ? {
                        borderColor: "var(--v3-acc)",
                        background: "var(--v3-acc-soft)",
                        color: "var(--v3-acc)",
                      }
                    : {
                        borderColor: "var(--v3-line-200)",
                        background: "var(--v3-bg-050)",
                        color: "var(--v3-ink-300)",
                      }
                }
              >
                <input
                  type="radio"
                  name="mentionWindow"
                  checked={props.window === w}
                  onChange={() => props.setWindow(w)}
                  className="sr-only"
                />
                {w}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Secret reveal panel — shown ONCE after a successful POST that included a
// webhook URL. The user must copy the secret before continuing; we make it
// visible (no masking — they need to copy it) with a prominent warning.
// ---------------------------------------------------------------------------

function SecretRevealPanel({
  secret,
  onCopy,
  onDone,
}: {
  secret: string;
  onCopy: () => Promise<void>;
  onDone: () => void;
}) {
  return (
    <div className="px-5 py-4">
      <header className="mb-3">
        <h2
          className="font-mono text-sm font-semibold uppercase tracking-wider"
          style={{ color: "var(--v3-sig-amber)" }}
        >
          Webhook secret — shown once
        </h2>
        <p className="mt-1 text-xs" style={{ color: "var(--v3-ink-300)" }}>
          Copy this now — it will not be shown again. Use it to verify
          {" "}<code style={{ color: "var(--v3-ink-200)" }}>X-TrendingRepo-Signature</code>{" "}
          on incoming requests.
        </p>
      </header>

      <div
        className="mb-3 break-all rounded-[2px] border p-3 font-mono text-xs"
        style={{
          borderColor: "var(--v3-sig-amber)",
          background: "color-mix(in oklab, var(--v3-sig-amber) 6%, transparent)",
          color: "var(--v3-ink-100)",
        }}
      >
        {secret}
      </div>

      <p
        className="mb-4 rounded-[2px] border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em]"
        style={{
          borderColor: "var(--v3-sig-amber)",
          background: "color-mix(in oklab, var(--v3-sig-amber) 8%, transparent)",
          color: "var(--v3-sig-amber)",
        }}
      >
        {"// SAVE THIS — IT WON'T BE SHOWN AGAIN"}
      </p>

      <footer className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => void onCopy()}
          className="inline-flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em]"
          style={{
            background: "var(--v3-acc-soft)",
            border: "1px solid var(--v3-acc-dim)",
            color: "var(--v3-acc)",
            fontWeight: 500,
          }}
        >
          Copy secret
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em]"
          style={{
            borderColor: "var(--v3-line-200)",
            background: "var(--v3-bg-100)",
            color: "var(--v3-ink-200)",
          }}
        >
          I&apos;ve saved it — close
        </button>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export default AddAlertRuleDialog;
