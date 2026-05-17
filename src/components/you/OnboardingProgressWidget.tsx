// <OnboardingProgressWidget /> — S3.F "next step" card on /you.
//
// Server component. Three checkpoints derived in
// src/lib/onboarding/progress.ts (alerts, digest, referral share).
// Shown only when at least one checkpoint is incomplete; once all
// three are true the page skips rendering this widget entirely so it
// doesn't linger as visual clutter.
//
// Visual chrome mirrors the surrounding /you panels (v4 tokens) so it
// reads as part of the page, not a callout. Each todo row links to the
// surface where the user can complete it.

import Link from "next/link";

import type { OnboardingProgress } from "@/lib/onboarding/progress";

interface OnboardingProgressWidgetProps {
  progress: OnboardingProgress;
}

interface ChecklistRow {
  key: keyof Pick<
    OnboardingProgress,
    "hasAlert" | "hasDigest" | "hasReferralShared"
  >;
  label: string;
  cta: string;
  href: string;
}

const ROWS: readonly ChecklistRow[] = [
  {
    key: "hasAlert",
    label: "Create your first alert rule",
    cta: "Open alerts",
    href: "/you/alerts",
  },
  {
    key: "hasDigest",
    label: "Subscribe to a daily or weekly digest",
    cta: "Choose cadence",
    href: "/you/alerts",
  },
  {
    key: "hasReferralShared",
    label: "Share your referral code",
    cta: "Open referrals",
    href: "/you/refer",
  },
];

export function OnboardingProgressWidget({
  progress,
}: OnboardingProgressWidgetProps) {
  // Caller already early-returns when allDone is true, but defensive
  // gate keeps the widget honest even if a future caller forgets.
  if (progress.allDone) return null;

  const completedCount = ROWS.filter((row) => progress[row.key]).length;

  return (
    <div
      style={{
        border: "1px solid var(--v4-line-200)",
        borderRadius: 4,
        background: "var(--v4-bg-050)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--v4-ink-200)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          // 00 Next steps
        </span>
        <span
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 10,
            color: "var(--v4-ink-400)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {completedCount} / {ROWS.length} done
        </span>
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {ROWS.map((row) => {
          const done = Boolean(progress[row.key]);
          return (
            <li
              key={row.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                border: "1px solid var(--v4-line-100)",
                borderRadius: 3,
                background: done ? "var(--v4-bg-075)" : "transparent",
              }}
            >
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  width: 16,
                  height: 16,
                  borderRadius: 2,
                  border: "1px solid var(--v4-line-200)",
                  background: done ? "var(--v4-acc)" : "transparent",
                  color: "var(--v4-bg-050)",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {done ? "✓" : ""}
              </span>
              <span
                style={{
                  flex: 1,
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  color: done ? "var(--v4-ink-300)" : "var(--v4-ink-100)",
                  textDecoration: done ? "line-through" : "none",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.label}
              </span>
              {!done ? (
                <Link
                  href={row.href}
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 10,
                    color: "var(--v4-acc)",
                    textDecoration: "none",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    flexShrink: 0,
                  }}
                >
                  {row.cta} →
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default OnboardingProgressWidget;
