// TopRoundsTable — `.fund-row` rows.
// rank, logo letter, company name + desc, round chip, $amount, source, age.
// When the signal has a matched GitHub repo, name links to /repo/<owner>/<name>.

import Link from "next/link";

import type { FundingSignal } from "@/lib/funding/types";

interface TopRound {
  signal: FundingSignal;
  matchedRepo?: string | null;
}

interface TopRoundsTableProps {
  rounds: TopRound[];
  limit?: number;
}

const ROUND_LABEL: Record<string, string> = {
  "pre-seed": "Pre-seed",
  seed: "Seed",
  "series-a": "Series A",
  "series-b": "Series B",
  "series-c": "Series C",
  "series-d-plus": "Series D+",
  growth: "Growth",
  ipo: "IPO",
  acquisition: "Acquired",
  undisclosed: "Undisclosed",
};

const SOURCE_LABEL: Record<string, string> = {
  techcrunch: "TechCrunch",
  venturebeat: "VentureBeat",
  sifted: "Sifted",
  telegram: "Telegram",
  twitter: "Twitter / X",
  reddit: "Reddit",
  submit: "Submitted",
  yc: "YC",
  newsapi: "NewsAPI",
};

function relAge(publishedAt: string): string {
  const ms = Date.now() - Date.parse(publishedAt);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function logoLetter(name: string): string {
  const ch = name.trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(ch) ? ch : "·";
}

function pickHost(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function TopRoundsTable({ rounds, limit = 10 }: TopRoundsTableProps) {
  const slice = rounds.slice(0, limit);

  if (slice.length === 0) {
    return (
      <div className="panel fade-up" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <span className="ph-eyebrow">{"// 01"}</span>
          <span className="ph-title">Top rounds · last 7 days</span>
        </div>
        <div style={{ padding: 24, color: "var(--fg-faint)", fontSize: 12 }}>
          No structured rounds in this window yet.
        </div>
      </div>
    );
  }

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 01"}</span>
        <span className="ph-title">Top rounds · last 7 days</span>
        <span className="ph-meta">
          {slice.length} of <b>{rounds.length}</b> · sorted by amount
        </span>
      </div>
      <div>
        {slice.map((r, idx) => {
          const ex = r.signal.extracted;
          const company = ex?.companyName ?? "Unknown";
          const host = pickHost(ex?.companyWebsite ?? null);
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
                    <Link href={`/repo/${repo}`} prefetch={false}>
                      {company}
                    </Link>
                  ) : (
                    company
                  )}
                </span>
                <span className="desc">
                  {host ? `${host} · ` : ""}
                  {repo ? (
                    <>
                      matched{" "}
                      <Link
                        href={`/repo/${repo}`}
                        prefetch={false}
                        style={{ color: "var(--accent)" }}
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
              <span className="fr-amt">{ex?.amountDisplay ?? "—"}</span>
              <span className="fr-source">{source}</span>
              <span className="fr-age">{relAge(r.signal.publishedAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
