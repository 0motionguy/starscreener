// TopRoundsTable renders the 10-row funding table from the HTML mockup.
// Rows are live-first, with seeded rounds filling the table when the current
// funding window exposes fewer than ten structured amounts.

import Link from "next/link";

import type { FundingSignal } from "@/lib/funding/types";
import {
  ensureFundingSignals,
  relAge,
  ROUND_LABEL,
} from "./fundingDisplayData";

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

function pickHost(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function withSeedRows(rounds: TopRound[], limit: number): TopRound[] {
  if (rounds.length >= limit) return rounds.slice(0, limit);
  const existing = rounds.map((r) => r.signal);
  const seeded = ensureFundingSignals(existing, limit);
  const byId = new Map(rounds.map((r) => [r.signal.id, r]));
  return seeded.slice(0, limit).map((signal) => byId.get(signal.id) ?? { signal });
}

export function TopRoundsTable({
  rounds,
  limit = 10,
  totalRounds,
}: TopRoundsTableProps) {
  const rows = withSeedRows(rounds, limit);

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 01"}</span>
        <span className="ph-title">Top rounds - last 7 days</span>
        <span className="ph-meta">
          {rows.length} of <b>{Math.max(rows.length, rounds.length, totalRounds ?? 0)}</b> - sorted by amount
        </span>
      </div>
      <div>
        {rows.map((r, idx) => {
          const ex = r.signal.extracted;
          const company = ex?.companyName ?? "Tracked company";
          const host = pickHost(ex?.companyWebsite);
          const round = ex ? ROUND_LABEL[ex.roundType] ?? "Round" : "Round";
          const source = SOURCE_LABEL[r.signal.sourcePlatform] ?? r.signal.sourcePlatform;
          const repo = r.matchedRepo ?? null;

          return (
            <div className="fund-row" key={`${r.signal.id}-${idx}`}>
              <span className="fr-rank">{idx + 1}</span>
              <div className="fr-logo">{logoLetter(company)}</div>
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
    </div>
  );
}
