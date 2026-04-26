// V2 Launch section — Stage 5. Terminal-bar chrome on each repo card,
// stat tiles for quick read, barcode ticker as the closing motif.

import Link from "next/link";
import { Rocket, DollarSign, BadgeCheck } from "lucide-react";

import type { Repo } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { BarcodeTicker } from "@/components/today-v2/primitives/BarcodeTicker";
import { BracketMarkers } from "@/components/today-v2/primitives/BracketMarkers";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

interface LaunchSectionV2Props {
  repos: Repo[];
  /** Number of "ready to launch" repos to surface. */
  limit?: number;
}

export function LaunchSectionV2({ repos, limit = 6 }: LaunchSectionV2Props) {
  // Same filter as the original LaunchSection: ≥3 cross-source signals
  // AND a recent commit (≤30 days).
  const readyToLaunch = [...repos]
    .filter(
      (r) =>
        (r.channelsFiring ?? 0) >= 2 &&
        r.lastCommitAt &&
        Date.now() - Date.parse(r.lastCommitAt) < 30 * 86_400_000,
    )
    .sort((a, b) => (b.channelsFiring ?? 0) - (a.channelsFiring ?? 0))
    .slice(0, limit);

  const fundedCount = repos.filter(
    (r) => r.funding && (r.funding.count ?? 0) > 0,
  ).length;

  const totalLive = readyToLaunch.length;
  const topSignals = readyToLaunch[0]?.channelsFiring ?? 0;

  return (
    <section
      id="launch"
      className="scroll-mt-32 border-b border-[color:var(--v2-line-100)]"
    >
      <div className="v2-frame py-12">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="v2-mono mb-2">
              <span aria-hidden>{"// "}</span>
              STAGE 05 · TRACK
            </p>
            <h2 className="v2-h1 flex items-center gap-3">
              <Rocket
                className="size-7 text-[color:var(--v2-acc)]"
                aria-hidden
              />
              Launch &amp; funding
            </h2>
            <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--v2-ink-200)]">
              Repos breaking out across multiple signal sources are the ones to
              watch for funding announcements and revenue traction.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/funding" className="v2-btn v2-btn-ghost">
              <DollarSign className="size-3.5" aria-hidden />
              Funding Radar <span aria-hidden>→</span>
            </Link>
            <Link href="/revenue" className="v2-btn v2-btn-ghost">
              <BadgeCheck className="size-3.5" aria-hidden />
              Revenue <span aria-hidden>→</span>
            </Link>
          </div>
        </header>

        {/* Top-line stat row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="v2-stat">
            <div className="v tabular-nums">{formatNumber(totalLive)}</div>
            <div className="k">LAUNCH READY</div>
          </div>
          <div className="v2-stat">
            <div className="v tabular-nums">{formatNumber(topSignals)}</div>
            <div className="k">TOP SIGNAL · /7</div>
          </div>
          <div className="v2-stat">
            <div className="v tabular-nums">{formatNumber(fundedCount)}</div>
            <div className="k">FUNDED · ALL TIME</div>
          </div>
          <div className="v2-stat">
            <div className="v tabular-nums">30D</div>
            <div className="k">WINDOW</div>
          </div>
        </div>

        {readyToLaunch.length === 0 ? (
          <div className="v2-card p-8 text-center text-[13px] text-[color:var(--v2-ink-300)]">
            <span className="v2-mono">
              <span aria-hidden>{"// "}</span>
              NO REPOS · 3+ SIGNALS · WAITING NEXT SCRAPE
            </span>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {readyToLaunch.map((repo, i) => (
              <li key={repo.id}>
                <Link
                  href={`/repo/${repo.owner}/${repo.name}`}
                  className={cn(
                    "v2-card v2-card-hover overflow-hidden block group relative",
                    i === 0 && "v2-bracket",
                  )}
                >
                  {i === 0 ? <BracketMarkers /> : null}

                  <TerminalBar
                    label={
                      <span>
                        LAUNCH-{String(i + 1).padStart(2, "0")}
                      </span>
                    }
                    status={
                      <span className="text-[color:var(--v2-acc)] tabular-nums">
                        {repo.channelsFiring}/5 SIGNALS
                      </span>
                    }
                  />

                  <div className="p-4">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={repo.ownerAvatarUrl}
                        alt=""
                        width={20}
                        height={20}
                        loading="lazy"
                        className="size-5 shrink-0 rounded-sm border border-[color:var(--v2-line-200)] bg-[color:var(--v2-bg-100)]"
                      />
                      <span
                        className="truncate text-[color:var(--v2-ink-000)]"
                        style={{
                          fontFamily: "var(--font-geist), Inter, sans-serif",
                          fontWeight: 510,
                          fontSize: 13,
                        }}
                      >
                        {repo.fullName}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-3 v2-mono">
                      <span className="tabular-nums text-[color:var(--v2-ink-200)]">
                        {formatNumber(repo.stars)} ★
                      </span>
                      {(repo.starsDelta24h ?? 0) > 0 ? (
                        <>
                          <span aria-hidden className="text-[color:var(--v2-line-300)]">
                            ·
                          </span>
                          <span className="text-[color:var(--v2-sig-green)] tabular-nums">
                            +{formatNumber(repo.starsDelta24h)} /24H
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Closing barcode ticker — Node/01 industrial sign-off. */}
        <div className="mt-6">
          <BarcodeTicker
            left={`// LIVE · ${totalLive} READY`}
            middle="EU-CENTRAL-1"
            right={`${String(totalLive).padStart(2, "0")}/${String(repos.length).padStart(3, "0")}`}
            bars={36}
          />
        </div>
      </div>
    </section>
  );
}
