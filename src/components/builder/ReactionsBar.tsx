"use client";

// TrendingRepo — Reactions bar.
//
// Four-button conviction primitive (use / build / buy / invest). Clicking a
// button opens a lightweight payload sheet (one input, submit). Skipping
// the payload still counts — it's just weighted 0.5x in ranking. Numbers
// are optimistically updated on submit; the server returns the authoritative
// tally which replaces local state.
//
// Used on:
//   - repo detail header (subjectType="repo", subjectId=fullName)
//   - idea feed card (subjectType="idea", subjectId=slug)
//   - compare page (optional, per-repo column)
//
// Accessibility: each button is a proper <button>, the input sheet is a
// <dialog> with focus-trap handled by the browser, and the tally is
// announced via aria-live.

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { Zap, Hammer, Wallet, TrendingUp } from "lucide-react";
import type { ReactionKind, ReactionTally } from "@/lib/builder/types";
import { formatNumber } from "@/lib/utils";

interface ReactionsBarProps {
  subjectType: "repo" | "idea";
  subjectId: string;
  /** Optional initial tally (SSR-rendered). */
  initialTally?: ReactionTally;
  compact?: boolean;
}

interface KindMeta {
  label: string;
  icon: typeof Zap;
  color: string;
  promptLabel: string;
  placeholder: string;
  payloadKey: "useCase" | "buildThesis" | "priceUsd" | "amountUsd";
  inputType: "text" | "number";
  maxLen?: number;
}

const KIND_META: Record<ReactionKind, KindMeta> = {
  use: {
    label: "Use it",
    icon: Zap,
    color: "text-accent-orange",
    promptLabel: "What would you use this for?",
    placeholder: "agent debugger for my team",
    payloadKey: "useCase",
    inputType: "text",
    maxLen: 80,
  },
  build: {
    label: "Build it",
    icon: Hammer,
    color: "text-accent-green",
    promptLabel: "What would you build with this?",
    placeholder: "Cursor for Figma, one-liner thesis",
    payloadKey: "buildThesis",
    inputType: "text",
    maxLen: 140,
  },
  buy: {
    label: "Buy it",
    icon: Wallet,
    color: "text-accent-blue",
    promptLabel: "What would you pay (optional)?",
    placeholder: "99",
    payloadKey: "priceUsd",
    inputType: "number",
  },
  invest: {
    label: "Invest",
    icon: TrendingUp,
    color: "text-accent-purple",
    promptLabel: "Ticket size in USD (stays private)",
    placeholder: "25000",
    payloadKey: "amountUsd",
    inputType: "number",
  },
};

export function ReactionsBar({
  subjectType,
  subjectId,
  initialTally,
  compact = false,
}: ReactionsBarProps) {
  const [tally, setTally] = useState<ReactionTally | null>(initialTally ?? null);
  const [openKind, setOpenKind] = useState<ReactionKind | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Lazily fetch the tally if we don't have one.
  useEffect(() => {
    if (tally) return;
    fetch(
      `/api/reactions?subjectType=${subjectType}&subjectId=${encodeURIComponent(subjectId)}`,
    )
      .then((r) => r.json())
      .then((d) => d.tally && setTally(d.tally))
      .catch(() => {
        // Silent — the bar still renders with zeros.
      });
  }, [subjectType, subjectId, tally]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (openKind && !dlg.open) dlg.showModal();
    if (!openKind && dlg.open) dlg.close();
  }, [openKind]);

  const submitReaction = useCallback(
    (kind: ReactionKind, rawValue: string) => {
      const meta = KIND_META[kind];
      const payload: Record<string, string | number> = {};
      const trimmed = rawValue.trim();
      if (trimmed.length > 0) {
        if (meta.inputType === "number") {
          const n = Number(trimmed);
          if (Number.isFinite(n) && n >= 0) payload[meta.payloadKey] = Math.floor(n);
        } else {
          payload[meta.payloadKey] = trimmed;
        }
      }

      startTransition(async () => {
        try {
          const res = await fetch("/api/reactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              kind,
              subjectType,
              subjectId,
              payload,
              publicInvest: false,
            }),
          });
          if (!res.ok) return;
          const data = (await res.json()) as { tally: ReactionTally };
          setTally(data.tally);
          setOpenKind(null);
        } catch {
          setOpenKind(null);
        }
      });
    },
    [subjectType, subjectId],
  );

  const counts: Record<ReactionKind, number> = {
    use: tally?.use ?? 0,
    build: tally?.build ?? 0,
    buy: tally?.buy ?? 0,
    invest: tally?.invest ?? 0,
  };
  const kinds: ReactionKind[] = ["use", "build", "buy", "invest"];

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      aria-live="polite"
    >
      {kinds.map((k) => {
        const meta = KIND_META[k];
        const Icon = meta.icon;
        const count = counts[k];
        return (
          <button
            key={k}
            type="button"
            disabled={pending}
            onClick={() => setOpenKind(k)}
            className={`inline-flex items-center gap-1.5 rounded-badge border border-border-primary bg-bg-secondary px-2.5 py-1 font-mono text-xs hover:border-border-accent hover:bg-bg-card transition-colors ${meta.color} ${compact ? "text-[11px] px-2" : ""}`}
            aria-label={`${meta.label} — ${count} total`}
          >
            <Icon size={compact ? 12 : 14} strokeWidth={2} />
            <span className="text-text-secondary">{meta.label}</span>
            <span className="font-bold">{formatNumber(count)}</span>
          </button>
        );
      })}

      {tally && tally.uniqueBuilders > 0 && !compact && (
        <span className="ml-1 font-mono text-[11px] text-text-tertiary">
          conviction{" "}
          <strong className="text-text-secondary">
            {tally.conviction.toFixed(2)}
          </strong>
        </span>
      )}

      <ReactionDialog
        ref={dialogRef}
        openKind={openKind}
        pending={pending}
        onClose={() => setOpenKind(null)}
        onSubmit={submitReaction}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

interface ReactionDialogProps {
  ref: React.Ref<HTMLDialogElement>;
  openKind: ReactionKind | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (kind: ReactionKind, value: string) => void;
}

function ReactionDialog({
  ref,
  openKind,
  pending,
  onClose,
  onSubmit,
}: ReactionDialogProps) {
  const meta = openKind ? KIND_META[openKind] : null;
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!openKind) setValue("");
  }, [openKind]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Click outside the card closes.
        if (e.target === e.currentTarget) onClose();
      }}
      className="backdrop:bg-black/40 rounded-card border border-border-primary bg-bg-card p-0 max-w-md w-[min(92vw,28rem)] shadow-card"
    >
      {meta && openKind && (
        <form
          className="p-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(openKind, value);
          }}
        >
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 font-mono text-sm ${meta.color}`}>
              <meta.icon size={16} strokeWidth={2} />
              {meta.label}
            </span>
          </div>
          <label className="text-xs text-text-secondary">
            {meta.promptLabel}
          </label>
          <input
            autoFocus
            type={meta.inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={meta.placeholder}
            maxLength={meta.maxLen}
            className="font-mono text-sm rounded-card border border-border-primary bg-bg-secondary px-3 py-2 text-text-primary outline-none focus:border-border-accent"
          />
          <p className="text-[11px] text-text-tertiary">
            Skip and submit to count as a quiet reaction (weighted 0.5x in ranking).
          </p>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-badge px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-badge bg-accent-green/15 border border-accent-green/40 px-3 py-1.5 text-xs font-mono text-accent-green hover:bg-accent-green/25 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Submit"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
