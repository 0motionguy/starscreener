"use client";

/**
 * DropRepoStepStrip — 4-card funnel row showing the lifecycle a submission
 * runs through after the form is submitted. Operator-attached mockup
 * (2026-05-15): SUBMIT 30s → AUTO-SCAN 2min → REVIEW 14min → LISTED.
 *
 * Pure presentational — no props. Numbers + copy come from the typical
 * historical funnel (operator-reviewed). If/when we surface live medians
 * we can promote those values to props.
 */

import type { ReactNode } from "react";
import { Clock, Search, Send, Sparkles } from "lucide-react";

interface StepCardProps {
  num: string;
  label: string;
  duration: string;
  icon: ReactNode;
  active?: boolean;
}

function StepCard({ num, label, duration, icon, active = false }: StepCardProps) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-1 rounded-card border px-3 py-2.5"
      style={{
        borderColor: active ? "var(--v4-acc)" : "var(--v4-line-200)",
        background: active ? "var(--v4-acc-wash)" : "var(--v4-bg-025)",
      }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {num}
        </span>
        <span
          className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: active ? "var(--v4-acc)" : "var(--v4-ink-200)" }}
        >
          {label}
        </span>
        <span
          className="ml-auto shrink-0"
          style={{ color: active ? "var(--v4-acc)" : "var(--v4-ink-300)" }}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <div
        className="truncate font-mono text-[11px]"
        style={{ color: active ? "var(--v4-ink-100)" : "var(--v4-ink-200)" }}
      >
        ~{duration}
      </div>
    </div>
  );
}

export function DropRepoStepStrip() {
  return (
    <div
      role="list"
      aria-label="Submission funnel"
      className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      <StepCard
        num="// 01"
        label="Submit"
        duration="30s"
        icon={<Send className="h-3.5 w-3.5" />}
        active
      />
      <StepCard
        num="// 02"
        label="Auto-scan"
        duration="2 min"
        icon={<Search className="h-3.5 w-3.5" />}
      />
      <StepCard
        num="// 03"
        label="Review"
        duration="14 min"
        icon={<Clock className="h-3.5 w-3.5" />}
      />
      <StepCard
        num="// 04"
        label="Listed"
        duration="ranked"
        icon={<Sparkles className="h-3.5 w-3.5" />}
      />
    </div>
  );
}
