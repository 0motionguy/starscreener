import type { JSX } from "react";
import {
  AlertCircle,
  BadgeCheck,
  ExternalLink,
  Link2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { RevenueOverlay } from "@/lib/types";
import { classifyFreshness } from "@/lib/revenue-overlays";
import { formatNumber, getRelativeTime } from "@/lib/utils";

interface RepoRevenuePanelProps {
  verified: RevenueOverlay | null;
  selfReported: RevenueOverlay | null;
  trustmrrClaim?: RevenueOverlay | null;
}

function formatUsd(cents: number | null): string | null {
  if (cents === null || !Number.isFinite(cents)) return null;
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${formatNumber(Math.round(dollars))}`;
}

function formatGrowth(pct: number | null): {
  label: string;
  tone: "up" | "down" | "default";
} {
  if (pct === null || !Number.isFinite(pct)) {
    return { label: "-", tone: "default" };
  }
  const rounded = Math.round(pct * 10) / 10;
  if (rounded > 0) return { label: `+${rounded}%`, tone: "up" };
  if (rounded < 0) return { label: `${rounded}%`, tone: "down" };
  return { label: "0%", tone: "default" };
}

function providerLabel(provider: string | null): string {
  if (!provider) return "payment provider";
  const map: Record<string, string> = {
    stripe: "Stripe",
    lemonsqueezy: "LemonSqueezy",
    polar: "Polar",
    paddle: "Paddle",
    dodopayment: "DodoPayments",
    revenuecat: "RevenueCat",
    superwall: "Superwall",
    creem: "Creem",
    other: "payment provider",
  };
  return map[provider.toLowerCase()] ?? provider;
}

export function RepoRevenuePanel({
  verified,
  selfReported,
  trustmrrClaim = null,
}: RepoRevenuePanelProps): JSX.Element | null {
  // Guard against a claim being passed where a verified overlay is expected.
  // VerifiedRevenueCard renders "Verified revenue" chrome — a claim-only
  // overlay there would be the exact UX bug we are fixing.
  const renderVerified =
    verified && verified.tier === "verified_trustmrr" ? verified : null;
  // Don't double-render the claim when a real verified overlay already exists
  // for this repo — the caller ensures this, but belt-and-braces.
  const renderClaim =
    !renderVerified && trustmrrClaim && trustmrrClaim.tier === "trustmrr_claim"
      ? trustmrrClaim
      : null;
  if (!renderVerified && !renderClaim && !selfReported) return null;
  return (
    <section className="space-y-3" aria-label="Revenue signals">
      {renderVerified ? <VerifiedRevenueCard overlay={renderVerified} /> : null}
      {renderClaim ? <TrustmrrClaimCard overlay={renderClaim} /> : null}
      {selfReported ? <SelfReportedRevenueCard overlay={selfReported} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// VerifiedRevenueCard — revenue verified through direct read-only sync with
// the product's payment provider. No outbound attribution link; the provider
// name is the only source credit we show ("verified via Stripe").
// ---------------------------------------------------------------------------

function VerifiedRevenueCard({
  overlay,
}: {
  overlay: RevenueOverlay;
}): JSX.Element | null {
  const freshness = classifyFreshness(overlay.asOf);
  if (freshness === "expired") return null;

  const provider = providerLabel(overlay.paymentProvider);
  const mrr = formatUsd(overlay.mrrCents);
  const last30 = formatUsd(overlay.last30DaysCents);
  const growth = formatGrowth(overlay.growthMrr30d);
  const growthIcon =
    growth.tone === "up"
      ? TrendingUp
      : growth.tone === "down"
        ? TrendingDown
        : null;

  return (
    <div
      aria-label="Verified revenue"
      className="v2-card p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <BadgeCheck
            className="size-4"
            style={{ color: "var(--v3-sig-green)" }}
            aria-hidden
          />
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            Verified revenue
          </h3>
        </div>
        {freshness === "stale" ? (
          <span
            className="rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{
              borderColor: "var(--v3-line-200)",
              background: "var(--v3-bg-100)",
              color: "var(--v3-sig-amber)",
            }}
          >
            updated {getRelativeTime(overlay.asOf)}
          </span>
        ) : null}
      </header>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="MRR" value={mrr ?? "-"} highlight />
        <Metric label="Last 30 days" value={last30 ?? "-"} />
        <Metric
          label="Growth 30d"
          value={growth.label}
          tone={growth.tone}
          icon={growthIcon}
        />
        <Metric
          label="Subscriptions"
          value={
            typeof overlay.activeSubscriptions === "number" &&
            overlay.activeSubscriptions > 0
              ? formatNumber(overlay.activeSubscriptions)
              : typeof overlay.customers === "number" && overlay.customers > 0
                ? formatNumber(overlay.customers)
                : "-"
          }
        />
      </div>

      <footer className="mt-3 text-[11px] text-text-tertiary">
        Verified via {provider}
        {overlay.category ? ` · ${overlay.category}` : ""}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrustmrrClaimCard — moderated claim of a TrustMRR profile with no live
// metrics attached yet. Neutral chrome, no MRR slot, explicit "pointer only"
// copy. Gets replaced by VerifiedRevenueCard once the next catalog sweep
// resolves the repo against the catalog.
// ---------------------------------------------------------------------------

function TrustmrrClaimCard({
  overlay,
}: {
  overlay: RevenueOverlay;
}): JSX.Element | null {
  const freshness = classifyFreshness(overlay.asOf);
  if (freshness === "expired") return null;
  return (
    <div
      aria-label="Linked TrustMRR profile"
      className="v2-card p-4"
      style={{ background: "var(--v2-bg-100)" }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-text-tertiary" aria-hidden />
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            Linked TrustMRR profile — numbers not yet verified
          </h3>
        </div>
      </header>
      <p className="mt-3 text-sm text-text-secondary">
        The founder linked this repo to a TrustMRR profile. Live metrics will
        appear here after the next catalog sync. Until then, this is a
        pointer — not a verified revenue figure.
      </p>
      <footer className="mt-3 text-[11px] text-text-tertiary">
        {overlay.sourceUrl ? (
          <a
            href={overlay.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary hover:underline"
          >
            View on TrustMRR
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelfReportedRevenueCard — founder-reported. Deliberately different chrome
// (muted border, grayscale tone, no large hero MRR) so a skimmer never
// mistakes it for a verified number.
// ---------------------------------------------------------------------------

function SelfReportedRevenueCard({
  overlay,
}: {
  overlay: RevenueOverlay;
}): JSX.Element | null {
  const freshness = classifyFreshness(overlay.asOf);
  if (freshness === "expired") return null;

  const mrr = formatUsd(overlay.mrrCents);
  const provider = providerLabel(overlay.paymentProvider);
  return (
    <div
      aria-label="Self-reported revenue"
      className="v2-card p-4"
      style={{ background: "var(--v2-bg-100)" }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle
            className="size-4 text-text-tertiary"
            aria-hidden
          />
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            Self-reported — not independently verified
          </h3>
        </div>
        {freshness === "stale" ? (
          <span
            className="rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{
              borderColor: "var(--v3-line-200)",
              background: "var(--v3-bg-100)",
              color: "var(--v3-sig-amber)",
            }}
          >
            {getRelativeTime(overlay.asOf)}
          </span>
        ) : null}
      </header>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PlainMetric label="MRR reported" value={mrr ?? "-"} />
        <PlainMetric
          label="Customers"
          value={
            typeof overlay.customers === "number"
              ? formatNumber(overlay.customers)
              : "-"
          }
        />
        <PlainMetric label="Provider" value={provider} />
      </div>

      <footer className="mt-3 text-[11px] text-text-tertiary">
        Submitted by founder. Not sourced from a payment-provider sync.
      </footer>
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
  tone?: "up" | "down" | "default";
  highlight?: boolean;
  icon?: React.ElementType | null;
}

function Metric({
  label,
  value,
  tone = "default",
  highlight,
  icon: Icon,
}: MetricProps): JSX.Element {
  const valueColor =
    tone === "up"
      ? "var(--v3-sig-green)"
      : tone === "down"
        ? "var(--v3-sig-red)"
        : "var(--v3-ink-100)";
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div
        className={`mt-1 flex items-baseline gap-1 font-mono font-semibold tabular-nums leading-none ${
          highlight ? "text-2xl" : "text-lg"
        }`}
        style={{ color: valueColor }}
      >
        {Icon ? <Icon className="size-4" aria-hidden /> : null}
        <span>{value}</span>
      </div>
    </div>
  );
}

function PlainMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 font-mono text-base font-medium tabular-nums leading-none text-text-secondary">
        {value}
      </div>
    </div>
  );
}

export default RepoRevenuePanel;
