"use client";

// AlertPresets — quick-start templates for the alert-rule create dialog.
//
// Each preset is a single-click way to populate the most common rule
// shapes a watcher will set up:
//
//   - Breakout (any repo)
//   - Daily digest (rank threshold drops in top-100)
//   - New release (specific repo)
//   - Mention spike (any repo, 3x baseline / 24h)
//
// Each preset's `applyTo(setters)` writes onto the form state held in
// AddAlertRuleDialog. We pass the setters individually (not a single
// state object) so this stays compatible with the dialog's existing
// useState shape without needing a reducer refactor.
//
// Visual: row of cards above the form fields. Active preset highlighted
// when the current form state matches it.

import { Activity, BellRing, GitBranch, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { AlertRuleType, AlertCadence } from "@/lib/db/schema/alerts";

// The subset of dialog setters each preset can write to.
// Kept as a flat record (not the form-state object) so AddAlertRuleDialog
// doesn't need to change its useState topology.
export interface PresetSetters {
  setName: (v: string) => void;
  setRuleType: (v: AlertRuleType) => void;
  setCadence: (v: AlertCadence) => void;
  setBreakoutFullName: (v: string) => void;
  setBreakoutMinScore: (v: string) => void;
  setRankScope: (v: "global" | "category") => void;
  setRankMaxRank: (v: string) => void;
  setRankDirection: (v: "into" | "outof") => void;
  setReleaseFullName: (v: string) => void;
  setReleaseIncludePre: (v: boolean) => void;
  setMentionFullName: (v: string) => void;
  setMentionMultiplier: (v: string) => void;
  setMentionWindow: (v: "24h" | "7d") => void;
}

export interface AlertPreset {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  // Color tokens lifted from the four signal categories used elsewhere
  // (matches AddAlertRuleDialog's RULE_TYPE_OPTIONS palette).
  accentVar: string;
  // Identity probe — used to highlight the active card when current form
  // state matches this preset.
  matches: (form: PresetSnapshot) => boolean;
  applyTo: (s: PresetSetters) => void;
}

// Form-state snapshot the picker uses for `matches`. Mirrors only the
// fields presets care about — full snapshot would be noisy.
export interface PresetSnapshot {
  ruleType: AlertRuleType;
  cadence: AlertCadence;
  rankScope: "global" | "category";
  rankMaxRank: string;
  rankDirection: "into" | "outof";
  mentionMultiplier: string;
  mentionWindow: "24h" | "7d";
}

export const ALERT_PRESETS: AlertPreset[] = [
  {
    id: "breakout-any",
    label: "Breakout",
    description: "Cross-source spike on any watched repo.",
    icon: TrendingUp,
    accentVar: "--v3-acc",
    matches: (f) => f.ruleType === "breakout" && f.cadence === "realtime",
    applyTo: (s) => {
      s.setName("Breakouts on my watchlist");
      s.setRuleType("breakout");
      s.setCadence("realtime");
      s.setBreakoutFullName("");
      s.setBreakoutMinScore("0.6");
    },
  },
  {
    id: "daily-digest",
    label: "Daily digest",
    description: "Daily summary of top-100 movers.",
    icon: BellRing,
    accentVar: "--v3-sig-amber",
    matches: (f) =>
      f.ruleType === "rank_threshold" &&
      f.cadence === "daily" &&
      f.rankScope === "global" &&
      f.rankMaxRank === "100" &&
      f.rankDirection === "into",
    applyTo: (s) => {
      s.setName("Daily top-100 movers");
      s.setRuleType("rank_threshold");
      s.setCadence("daily");
      s.setRankScope("global");
      s.setRankMaxRank("100");
      s.setRankDirection("into");
    },
  },
  {
    id: "new-release",
    label: "New release",
    description: "Notify when a specific repo ships a release.",
    icon: GitBranch,
    accentVar: "--v3-sig-green",
    matches: (f) => f.ruleType === "release" && f.cadence === "realtime",
    applyTo: (s) => {
      s.setName("New release");
      s.setRuleType("release");
      s.setCadence("realtime");
      s.setReleaseFullName("vercel/next.js");
      s.setReleaseIncludePre(false);
    },
  },
  {
    id: "mention-spike",
    label: "Mention spike",
    description: "3x baseline mentions over 24 hours.",
    icon: Activity,
    accentVar: "--v3-sig-red",
    matches: (f) =>
      f.ruleType === "mention_spike" &&
      f.mentionMultiplier === "3" &&
      f.mentionWindow === "24h",
    applyTo: (s) => {
      s.setName("Mention spike (3x / 24h)");
      s.setRuleType("mention_spike");
      s.setCadence("realtime");
      s.setMentionFullName("");
      s.setMentionMultiplier("3");
      s.setMentionWindow("24h");
    },
  },
];

interface AlertPresetsProps {
  snapshot: PresetSnapshot;
  setters: PresetSetters;
}

export function AlertPresets({ snapshot, setters }: AlertPresetsProps) {
  return (
    <div className="mb-4">
      <p
        className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: "var(--v3-ink-400)" }}
      >
        {"// QUICK-START TEMPLATES"}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ALERT_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const active = preset.matches(snapshot);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => preset.applyTo(setters)}
              className="group rounded-[2px] border p-2.5 text-left transition-colors focus:outline-none focus-visible:ring-1"
              style={
                active
                  ? {
                      borderColor: `var(${preset.accentVar})`,
                      background: `color-mix(in srgb, var(${preset.accentVar}) 12%, transparent)`,
                    }
                  : {
                      borderColor: "var(--v3-line-200)",
                      background: "var(--v3-bg-050)",
                    }
              }
              aria-pressed={active}
              aria-label={`Use preset: ${preset.label}`}
            >
              <div className="flex items-center gap-1.5">
                <Icon
                  className="size-3.5"
                  style={{
                    color: active
                      ? `var(${preset.accentVar})`
                      : "var(--v3-ink-300)",
                  }}
                  aria-hidden
                />
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{
                    color: active
                      ? `var(${preset.accentVar})`
                      : "var(--v3-ink-200)",
                    fontWeight: 500,
                  }}
                >
                  {preset.label}
                </span>
              </div>
              <p
                className="mt-1 text-[11px] leading-snug"
                style={{ color: "var(--v3-ink-300)" }}
              >
                {preset.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default AlertPresets;
