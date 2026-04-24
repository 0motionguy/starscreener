import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  Eye,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import type { VerifiedStartup } from "@/lib/revenue-startups";
import { logoFromDomain } from "@/lib/logo-url";
import { formatNumber } from "@/lib/utils";

interface VerifiedStartupCardProps {
  startup: VerifiedStartup;
  rank: number;
}

function formatUsd(cents: number | null): string | null {
  if (cents === null || !Number.isFinite(cents)) return null;
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${formatNumber(Math.round(dollars))}`;
}

function growthTuple(raw: number | null | undefined): {
  label: string;
  tone: "up" | "down" | "default";
} {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { label: "-", tone: "default" };
  }
  const rounded = Math.round(raw * 10) / 10;
  if (rounded > 0) return { label: `+${rounded}%`, tone: "up" };
  if (rounded < 0) return { label: `${rounded}%`, tone: "down" };
  return { label: "0%", tone: "default" };
}

function hostname(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** 2-letter ISO country code → flag emoji. Returns null for invalid input. */
function countryFlag(code: string | null): string | null {
  if (!code || code.length !== 2) return null;
  const A = 0x1f1e6;
  const up = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(up)) return null;
  return String.fromCodePoint(
    A + (up.charCodeAt(0) - 65),
    A + (up.charCodeAt(1) - 65),
  );
}

function foundedYear(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return String(new Date(t).getUTCFullYear());
}

/**
 * Growth strength bar — a single horizontal bar whose fill reflects the
 * 30-day MRR growth rate. Not a time-series sparkline (we don't have the
 * history), but gives each card a live visual signal.
 * Saturates at ±100% so extreme outliers don't blow the layout.
 */
function GrowthBar({ pct }: { pct: number | null }) {
  if (pct === null || !Number.isFinite(pct)) return null;
  const clamped = Math.max(-100, Math.min(100, pct));
  const widthPct = Math.abs(clamped);
  const isUp = clamped >= 0;
  return (
    <div className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-bg-muted">
      <div
        className={`absolute top-0 h-full ${isUp ? "left-1/2 bg-up" : "right-1/2 bg-down"}`}
        style={{ width: `${widthPct / 2}%` }}
        aria-hidden
      />
      <div
        className="absolute left-1/2 top-0 h-full w-px bg-border-primary"
        aria-hidden
      />
    </div>
  );
}

export function VerifiedStartupCard({
  startup,
  rank,
}: VerifiedStartupCardProps) {
  const mrr = formatUsd(startup.mrrCents);
  const growth = growthTuple(startup.growthMrr30d);
  const host = hostname(startup.website);
  const flag = countryFlag(startup.country);
  const year = foundedYear(startup.foundedDate);
  const subs =
    typeof startup.activeSubscriptions === "number" &&
    startup.activeSubscriptions > 0
      ? startup.activeSubscriptions
      : typeof startup.customers === "number" && startup.customers > 0
        ? startup.customers
        : null;
  const visitors = startup.visitorsLast30Days;
  const logoUrl = logoFromDomain(host, 128);

  return (
    <article className="group relative flex flex-col gap-3 rounded-card border border-border-primary bg-bg-card p-4 shadow-card transition hover:border-brand/40 hover:bg-bg-card-hover">
      {/* Header: logo + name + tracked badge */}
      <header className="flex items-start gap-3">
        <LogoBlock logoUrl={logoUrl} name={startup.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] tabular-nums text-text-tertiary">
              #{rank}
            </span>
            {startup.matchedRepoFullName ? (
              <Link
                href={`/repo/${startup.matchedRepoFullName}`}
                className="truncate font-mono text-sm font-semibold text-text-primary hover:underline"
                title={`Tracked repo: ${startup.matchedRepoFullName}`}
              >
                {startup.name}
              </Link>
            ) : (
              <span className="truncate font-mono text-sm font-semibold text-text-primary">
                {startup.name}
              </span>
            )}
            {startup.matchedRepoFullName ? (
              <span className="rounded-full border border-up/50 bg-up/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-up">
                tracked
              </span>
            ) : null}
          </div>
          {startup.description ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-text-tertiary">
              {startup.description}
            </p>
          ) : null}
        </div>
      </header>

      {/* MRR + growth */}
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            MRR
          </div>
          <div className="font-mono text-2xl font-semibold leading-none tabular-nums text-text-primary">
            {mrr ?? "-"}
          </div>
        </div>
        <div className="flex min-w-[88px] flex-col items-end gap-0.5">
          <span
            className={
              "inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums " +
              (growth.tone === "up"
                ? "text-up"
                : growth.tone === "down"
                  ? "text-down"
                  : "text-text-secondary")
            }
          >
            {growth.tone === "up" ? (
              <TrendingUp className="size-3.5" aria-hidden />
            ) : growth.tone === "down" ? (
              <TrendingDown className="size-3.5" aria-hidden />
            ) : null}
            {growth.label}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            30d
          </span>
        </div>
      </div>

      <GrowthBar pct={startup.growthMrr30d} />

      {/* Metadata strip */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-tertiary">
        {subs !== null ? (
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" aria-hidden />
            {formatNumber(subs)}
          </span>
        ) : null}
        {visitors !== null ? (
          <span className="inline-flex items-center gap-1" title="Visitors (last 30d)">
            <Eye className="size-3" aria-hidden />
            {formatNumber(visitors)}
          </span>
        ) : null}
        {flag ? <span className="text-sm leading-none" title={startup.country ?? undefined}>{flag}</span> : null}
        {year ? <span className="tabular-nums">since {year}</span> : null}
        {startup.category ? <span>· {startup.category}</span> : null}
        {startup.paymentProvider ? <span>· {startup.paymentProvider}</span> : null}
      </div>

      {/* Links footer */}
      <footer className="mt-auto flex flex-wrap items-center gap-3 border-t border-border-primary pt-3 text-[11px]">
        {startup.website ? (
          <a
            href={startup.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary"
            title={startup.website}
          >
            <span className="font-mono">{host}</span>
            <ArrowUpRight className="size-3" aria-hidden />
          </a>
        ) : null}
        {startup.xHandle ? (
          <a
            href={`https://x.com/${startup.xHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-text-tertiary hover:text-text-primary"
            title={`Founder @${startup.xHandle}`}
          >
            <span className="font-mono">@{startup.xHandle}</span>
            <ArrowUpRight className="size-3" aria-hidden />
          </a>
        ) : null}
      </footer>

      <BadgeCheck
        className="absolute right-3 top-3 size-3 text-up/50"
        aria-hidden
      />
    </article>
  );
}

function LogoBlock({
  logoUrl,
  name,
}: {
  logoUrl: string | null;
  name: string;
}) {
  const initial = name.charAt(0).toUpperCase();
  if (!logoUrl) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border-primary bg-bg-muted font-mono text-sm font-bold text-text-secondary">
        {initial}
      </div>
    );
  }
  return (
    <div className="size-10 shrink-0 overflow-hidden rounded-md border border-border-primary bg-bg-muted">
      <Image
        src={logoUrl}
        alt=""
        width={40}
        height={40}
        className="size-full object-cover"
        unoptimized
      />
    </div>
  );
}
