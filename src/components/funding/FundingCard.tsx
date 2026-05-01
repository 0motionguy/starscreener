"use client";

import Image from "next/image";
import { useState } from "react";
import type { FundingSignal } from "@/lib/funding/types";
import { resolveLogoUrl } from "@/lib/logo-url";

interface FundingCardProps {
  signal: FundingSignal;
}

// ---------------------------------------------------------------------------
// Known VC → domain map for investor logos
// ---------------------------------------------------------------------------

const VC_DOMAINS: Record<string, string> = {
  "a16z": "a16z.com",
  "andreessen horowitz": "a16z.com",
  "sequoia": "sequoiacap.com",
  "sequoia capital": "sequoiacap.com",
  "benchmark": "benchmark.com",
  "greylock": "greylock.com",
  "accel": "accel.com",
  "index ventures": "indexventures.com",
  "bessemer": "bvp.com",
  "khosla ventures": "khoslaventures.com",
  "first round": "firstround.com",
  "neo": "neo.com",
  "dcm": "dcm.com",
  "ivp": "ivp.com",
  "thrive capital": "thrivecap.com",
  "tiger global": "tigerglobal.com",
  "softbank": "softbank.jp",
  "founders fund": "foundersfund.com",
  "8vc": "8vc.com",
  "lux capital": "luxcapital.com",
  "general catalyst": "generalcatalyst.com",
  "bain capital": "baincapital.com",
  "insight partners": "insightpartners.com",
  "lightspeed": "lsvp.com",
  "menlo ventures": "menlo.vc",
  "mayfield": "mayfield.com",
  "kleiner perkins": "kpcb.com",
  "y combinator": "ycombinator.com",
  "yc": "ycombinator.com",
  "techstars": "techstars.com",
  "google ventures": "gv.com",
  "gv": "gv.com",
  "nvidia": "nvidia.com",
  "valor equity partners": "valor.com",
  "valor": "valor.com",
  "fidelity": "fidelity.com",
  "coatue": "coatue.com",
  "dragoneer": "dragoneer.com",
  "redpoint": "redpoint.com",
  "true ventures": "trueventures.com",
  "slow ventures": "slow.co",
  "homebrew": "homebrew.co",
  "sv angel": "svangel.com",
  "greenoaks": "greenoaks.com",
  "magnetar": "magnetar.com",
  "spark capital": "sparkcapital.com",
  "type1 ventures": "type1.vc",
  "blackrock": "blackrock.com",
  "nat friedman": "nat.org",
  "jeff bezos": "bezosexpeditions.com",
};

function getVcDomain(name: string): string | null {
  const lower = name.toLowerCase().trim();
  if (VC_DOMAINS[lower]) return VC_DOMAINS[lower];
  const words = lower.split(/\s+/);
  for (let i = words.length; i > 0; i--) {
    const key = words.slice(0, i).join(" ");
    if (VC_DOMAINS[key]) return VC_DOMAINS[key];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Logo / initials avatar (deterministic colors)
// ---------------------------------------------------------------------------

// W3-FUNDCARD: hardcoded hex tones swapped for V4 palette tokens via color-mix.
// No `--v4-fund-*` tokens exist in v4.css; falling back to the nearest 8-bucket
// V4 palette (`--v4-src-*` brand channels + semantic colors) so the deterministic
// hash → tone mapping still picks from a stable, themeable color set. Original
// alphas preserved: bg ~20%, border ~50%, text uses the raw token (full color).
const LOGO_TONES = [
  {
    bg: "color-mix(in srgb, var(--v4-src-x) 20%, transparent)",
    border: "color-mix(in srgb, var(--v4-src-x) 50%, transparent)",
    text: "var(--v4-src-x)",
  }, // blue → src-x
  {
    bg: "color-mix(in srgb, var(--v4-money) 20%, transparent)",
    border: "color-mix(in srgb, var(--v4-money) 50%, transparent)",
    text: "var(--v4-money)",
  }, // emerald → money
  {
    bg: "color-mix(in srgb, var(--v4-src-reddit) 20%, transparent)",
    border: "color-mix(in srgb, var(--v4-src-reddit) 50%, transparent)",
    text: "var(--v4-src-reddit)",
  }, // pink → src-reddit
  {
    bg: "color-mix(in srgb, var(--v4-amber) 20%, transparent)",
    border: "color-mix(in srgb, var(--v4-amber) 50%, transparent)",
    text: "var(--v4-amber)",
  }, // amber
  {
    bg: "color-mix(in srgb, var(--v4-src-dev) 20%, transparent)",
    border: "color-mix(in srgb, var(--v4-src-dev) 50%, transparent)",
    text: "var(--v4-src-dev)",
  }, // violet → src-dev
  {
    bg: "color-mix(in srgb, var(--v4-red) 20%, transparent)",
    border: "color-mix(in srgb, var(--v4-red) 50%, transparent)",
    text: "var(--v4-red)",
  }, // red
  {
    bg: "color-mix(in srgb, var(--v4-cyan) 20%, transparent)",
    border: "color-mix(in srgb, var(--v4-cyan) 50%, transparent)",
    text: "var(--v4-cyan)",
  }, // cyan
  {
    bg: "color-mix(in srgb, var(--v4-src-hn) 20%, transparent)",
    border: "color-mix(in srgb, var(--v4-src-hn) 50%, transparent)",
    text: "var(--v4-src-hn)",
  }, // orange → src-hn
];

function getLogoTone(name: string) {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return LOGO_TONES[hash % LOGO_TONES.length];
}

function getGradient(name: string) {
  const gradients = [
    "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    "linear-gradient(135deg, #10b981 0%, #047857 100%)",
    "linear-gradient(135deg, #f472b6 0%, #db2777 100%)",
    "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)",
    "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
    "linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)",
    "linear-gradient(135deg, #f97316 0%, #c2410c 100%)",
  ];
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return gradients[hash % gradients.length];
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Try to load a favicon for the company's domain; fall back to colored
 * initials on error. Accepts any of: a prebuilt logo URL (legacy Clearbit
 * URLs in committed data still parse cleanly), a bare domain, or a full
 * website URL — all resolve to Google's favicon service via logoFromDomain.
 */
function CompanyLogo({
  name,
  logoUrl,
  size = 48,
}: {
  name: string;
  logoUrl: string | null | undefined;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  // Try explicit logoUrl first, then fall back to a name-based .com guess.
  // Google's favicon service 404s for nonexistent domains — bad guesses
  // trip the onError handler and render the initials block below.
  const resolved = resolveLogoUrl(logoUrl, name, Math.max(size, 128));
  const initials = getInitials(name);

  if (resolved && !failed) {
    return (
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: size,
          height: size,
          borderRadius: 2,
          border: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-100)",
        }}
      >
        <Image
          src={resolved}
          alt={name}
          width={size}
          height={size}
          className="w-full h-full object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="shrink-0 rounded-lg flex items-center justify-center text-sm font-bold text-white shadow-sm"
      style={{
        width: size,
        height: size,
        background: getGradient(name),
      }}
    >
      {initials}
    </div>
  );
}

/** Small investor logo / initials pill. */
function InvestorBadge({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  // Prefer the hardcoded VC domain map (a16z→a16z.com) and fall back to a
  // slug-based .com guess for the 50+ investors that aren't in the map
  // (TCV, Blast, Eiffel Investment Group, etc.). Google 404s when a guess
  // misses and the initials pill below takes over.
  const domain = getVcDomain(name);
  const logoUrl = resolveLogoUrl(domain, name, 64);

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-100)",
        color: "var(--v4-ink-200)",
      }}
    >
      {logoUrl && !failed ? (
        <Image
          src={logoUrl}
          alt=""
          width={16}
          height={16}
          className="rounded-full object-contain"
          style={{ background: "var(--v4-bg-100)" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
          style={{
            background: getGradient(name),
          }}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {name}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Round type badge
// ---------------------------------------------------------------------------

function roundTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "pre-seed": "Pre-Seed",
    seed: "Seed",
    "series-a": "Series A",
    "series-b": "Series B",
    "series-c": "Series C",
    "series-d-plus": "Series D+",
    growth: "Growth",
    ipo: "IPO",
    acquisition: "Acquisition",
    undisclosed: "Undisclosed",
  };
  return labels[type] ?? type;
}

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function FundingCard({ signal }: FundingCardProps) {
  const ext = signal.extracted;
  const hasExtraction = ext !== null;
  const companyName = hasExtraction ? ext.companyName : signal.headline.slice(0, 60);

  // Prefer enriched investors; fall back to plain strings; always show at least something
  let investors = hasExtraction
    ? ext.investorsEnriched.length > 0
      ? ext.investorsEnriched.map((i) => i.name)
      : ext.investors
    : [];
  if (investors.length === 0) {
    investors = ["Undisclosed"];
  }

  return (
    <article
      className="overflow-hidden transition-colors"
      style={{
        background: "var(--v4-bg-050)",
        border: "1px solid var(--v4-line-200)",
        borderRadius: 2,
      }}
    >
      {/* Top row: Logo + Company | Raised Amount */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-4">
        {/* Left: Logo + Company */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <CompanyLogo name={companyName} logoUrl={ext?.companyLogoUrl} />
          <div className="min-w-0">
            <div
              className="text-sm font-bold truncate"
              style={{ color: "var(--v4-ink-100)" }}
            >
              {companyName}
            </div>
            {hasExtraction && ext.companyWebsite && (
              <a
                href={ext.companyWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] hover:text-[var(--v4-acc)] transition-colors truncate block"
                style={{ color: "var(--v4-ink-300)" }}
              >
                {ext.companyWebsite.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        </div>

        {/* Right: Raised Amount */}
        {hasExtraction && ext.amount !== null ? (
          <div className="shrink-0 text-right">
            <div
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--v4-ink-300)" }}
            >
              Raised
            </div>
            <div
              className="text-2xl font-black leading-tight"
              style={{ color: "var(--v4-money)" }}
            >
              {ext.amountDisplay}
            </div>
            <div className="mt-0.5">
              <span
                className="inline-flex items-center rounded px-1.5 py-px text-[10px] uppercase tracking-wider"
                style={{
                  border: "1px solid var(--v4-line-200)",
                  color: "var(--v4-ink-300)",
                }}
              >
                {roundTypeLabel(ext.roundType)}
              </span>
            </div>
          </div>
        ) : (
          <div className="shrink-0 text-right">
            <div
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--v4-ink-300)" }}
            >
              Raised
            </div>
            <div
              className="text-lg font-bold"
              style={{ color: "var(--v4-ink-300)" }}
            >
              —
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="px-5 pb-3">
        <p
          className="text-xs line-clamp-2"
          style={{ color: "var(--v4-ink-200)" }}
        >
          {signal.description || signal.headline}
        </p>
      </div>

      {/* Investors row */}
      {investors.length > 0 && (
        <div className="px-5 pb-3">
          <div
            className="flex items-center gap-2 text-[10px] uppercase tracking-wider mb-2"
            style={{ color: "var(--v4-ink-300)" }}
          >
            <span>Investors</span>
            <span
              className="flex-1 h-px"
              style={{ background: "var(--v4-line-200)" }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {investors.map((investor, i) => (
              <InvestorBadge key={`${investor}-${i}`} name={investor} />
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {signal.tags.length > 0 && (
        <div className="px-5 pb-3">
          <div className="flex flex-wrap gap-1">
            {signal.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center"
                style={{
                  fontSize: 9,
                  padding: "1px 4px",
                  border: "1px solid var(--v4-line-200)",
                  color: "var(--v4-ink-300)",
                  borderRadius: 2,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer: source + time */}
      <div
        className="px-5 py-3 flex items-center justify-between gap-2"
        style={{ borderTop: "1px solid var(--v4-line-200)" }}
      >
        <a
          href={signal.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] hover:text-[var(--v4-acc)] transition-colors truncate"
          style={{ color: "var(--v4-ink-300)" }}
          title={signal.sourceUrl}
        >
          → {signal.sourceUrl.replace(/^https?:\/\//, "").split("/")[0]}
        </a>
        <div className="flex items-center gap-2 shrink-0">
          {hasExtraction && (
            <span
              className="text-[10px]"
              style={{
                color:
                  ext.confidence === "high"
                    ? "var(--v4-money)"
                    : ext.confidence === "medium"
                      ? "var(--v4-amber)"
                      : "var(--v4-ink-300)",
              }}
              title={`Extraction confidence: ${ext.confidence}`}
            >
              {ext.confidence === "high" ? "●" : ext.confidence === "medium" ? "◐" : "○"}
            </span>
          )}
          <span
            className="text-[10px] tabular-nums"
            style={{ color: "var(--v4-ink-300)" }}
          >
            {formatRelative(signal.publishedAt)}
          </span>
        </div>
      </div>
    </article>
  );
}
