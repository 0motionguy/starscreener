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
        borderColor: active
          ? "var(--v3-acc, var(--border-primary, #2a2a30))"
          : "var(--border-primary, #2a2a30)",
        background: "var(--bg-secondary, #0c0c10)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.16em]"
          style={{ color: "var(--text-muted, #6b7280)" }}
        >
          {num}
        </span>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: active ? "var(--v3-acc, #fb923c)" : "var(--text-secondary, #9ca3af)" }}
        >
          {label}
        </span>
        <span className="ml-auto" style={{ color: active ? "var(--v3-acc, #fb923c)" : "var(--text-muted, #6b7280)" }}>
          {icon}
        </span>
      </div>
      <div
        className="font-mono text-[11px]"
        style={{ color: "var(--text-secondary, #9ca3af)" }}
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
