// TopRoundsTable renders the top-N funding rounds from real data only.
//
// 2026-05-23: dropped withSeedRows() — previously padded with SEED_ROUNDS
// (Anthropic $3.5B / Cursor $900M / Mistral $640M / Perplexity $520M etc),
// which surfaced fabricated rounds when the live spine was empty. Now
// shows only what TOOLBOX has collected; empty state when nothing.

import Link from "next/link";

import type { FundingSignal } from "@/lib/funding/types";
import { relAge, ROUND_LABEL } from "./fundingDisplayData";

interface TopRound {
  signal: FundingSignal;
  matchedRepo?: string | null;
}

interface TopRoundsTableProps {
  rounds: TopRound[];
  limit?: number;
  totalRounds?: number;
}

const SOURCE_LABEL: Partial<Record<FundingSignal["sourcePlatform"], string>> = {
  techcrunch: "TechCrunch",
  venturebeat: "VentureBeat",
  sifted: "Sifted",
  telegram: "Telegram",
  twitter: "Twitter / X",
  reddit: "Reddit",
  submit: "Submitted",
  yc: "YC",
  newsapi: "Funding wire",
};

function logoLetter(name: string): string {
  const ch = name.trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(ch) ? ch : ".";
}

/** Infer a domain from the company name when extracted.companyWebsite is
 *  missing — "Anthropic" → "anthropic.com", "Together AI" → "togetherai.com". */
function inferDomain(name: string): string {
  const trimmed = name.trim();
  if (trimmed.includes(".")) {
    return trimmed.toLowerCase().replace(/\s+/g, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com";
}

function logoUrlFor(name: string, website: string | null | undefined, explicit: string | null | undefined): string {
  if (explicit) return explicit;
  let domain = "";
  if (website) {
    try {
      domain = new URL(website).hostname.replace(/^www\./, "");
    } catch {
      domain = "";
    }
  }
  if (!domain) domain = inferDomain(name);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function pickHost(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function TopRoundsTable({
  rounds,
  limit = 10,
  totalRounds,
}: TopRoundsTableProps) {
  const rows = rounds.slice(0, limit);
  const honestTotal = totalRounds ?? rounds.length;

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 01"}</span>
        <span className="ph-title">Top rounds &middot; structured amounts</span>
        <span className="ph-meta">
          {rows.length} of <b>{honestTotal}</b> - sorted by amount
        </span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "28px 16px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-faint)" }}>
          No structured funding rounds in window. TOOLBOX funding collectors
          (TechCrunch / VentureBeat / Sifted / SEC Form D / Crunchbase
          news) may be quiet or stale &mdash; check {"`ssh toolbox`"} for
          collector status.
        </div>
      ) : (
      <div>
        {rows.map((r, idx) => {
          const ex = r.signal.extracted;
          const company = ex?.companyName ?? "Tracked company";
          const host = pickHost(ex?.companyWebsite);
          const round = ex ? ROUND_LABEL[ex.roundType] ?? "Round" : "Round";
          const source = SOURCE_LABEL[r.signal.sourcePlatform] ?? r.signal.sourcePlatform;
          const repo = r.matchedRepo ?? null;

          const logoSrc = logoUrlFor(company, ex?.companyWebsite, ex?.companyLogoUrl);

          return (
            <div className="fund-row" key={`${r.signal.id}-${idx}`}>
              <span className="fr-rank">{idx + 1}</span>
              <div className="fr-logo">
                {/* eslint-disable-next-line @next/next/no-img-element -- favicon, no Image optimization */}
                <img
                  src={logoSrc}
                  alt=""
                  width={20}
                  height={20}
                  loading="lazy"
                  decoding="async"
                  style={{ display: "block", width: 20, height: 20, objectFit: "contain" }}
                  data-fallback-letter={logoLetter(company)}
                />
              </div>
              <div className="fr-co">
                <span className="name">
                  {repo ? (
                    <Link href={`/repo/${repo}`} prefetch={false} data-repo-hover data-repo={repo}>
                      {company}
                    </Link>
                  ) : (
                    company
                  )}
                </span>
                <span className="desc">
                  {host ? `${host} - ` : ""}
                  {repo ? (
                    <>
                      matched{" "}
                      <Link
                        className="repo-link"
                        href={`/repo/${repo}`}
                        prefetch={false}
                        data-repo-hover
                        data-repo={repo}
                      >
                        {repo}
                      </Link>
                    </>
                  ) : (
                    r.signal.headline
                  )}
                </span>
              </div>
              <span className="fr-round">{round}</span>
              <span className="fr-amt">{ex?.amountDisplay ?? "$0"}</span>
              <span className="fr-source">{source}</span>
              <span className="fr-age">{relAge(r.signal.publishedAt)}</span>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
