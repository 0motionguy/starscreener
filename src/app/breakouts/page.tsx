// /breakouts - full-page Cross-Signal Breakouts.

import Link from "next/link";
import type { ReactNode } from "react";

import { Metric, MetricGrid } from "@/components/ui/Metric";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getChannelStatus } from "@/lib/pipeline/cross-signal";
import { formatNumber } from "@/lib/utils";
import type { Repo } from "@/lib/types";

export const dynamic = "force-static";

type FilterKey = "all" | "multi" | "three";

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All firing",
  multi: "2+ channels",
  three: "3 channels",
};

function parseFilter(raw: string | undefined): FilterKey {
  if (raw === "all" || raw === "multi" || raw === "three") return raw;
  return "multi";
}

function visibleFiring(repo: Repo, nowMs: number): number {
  const s = getChannelStatus(repo, nowMs);
  return (s.github ? 1 : 0) + (s.reddit ? 1 : 0) + (s.hn ? 1 : 0);
}

function applyFilter(repos: Array<Repo & { _firing: number }>, filter: FilterKey) {
  if (filter === "all") return repos.filter((r) => r._firing >= 1);
  if (filter === "three") return repos.filter((r) => r._firing === 3);
  return repos.filter((r) => r._firing >= 2);
}

function SectionHead({
  num,
  title,
  meta,
}: {
  num: string;
  title: string;
  meta: ReactNode;
}) {
  return (
    <div className="sec-head">
      <span className="sec-num">{`// ${num}`}</span>
      <h2 className="sec-title">{title}</h2>
      <span className="sec-meta">{meta}</span>
    </div>
  );
}

function channelRank(repo: Repo, nowMs: number, channel: "github" | "reddit" | "hn") {
  const status = getChannelStatus(repo, nowMs);
  return status[channel] ? "ON" : "-";
}

export default async function BreakoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.filter);
  const nowMs = Date.now();

  const annotated = getDerivedRepos().map((repo) => ({
    ...repo,
    _firing: visibleFiring(repo, nowMs),
  }));

  const totalFiring = annotated.filter((r) => r._firing >= 1).length;
  const multiChannel = annotated.filter((r) => r._firing >= 2).length;
  const allThree = annotated.filter((r) => r._firing === 3).length;
  const oneChannel = totalFiring - multiChannel;
  const topScore = annotated.reduce(
    (max, repo) => Math.max(max, repo.crossSignalScore ?? 0),
    0,
  );

  const view = applyFilter(annotated, filter)
    .sort((a, b) => (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0))
    .slice(0, 50);

  return (
    <main className="home-surface breakouts-page">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Breakouts</b> / cross-signal / github + reddit + hn
          </div>
          <h1>Where independent channels fire together.</h1>
          <p className="lede">
            Multi-channel repo momentum, ranked by cross-signal score and
            filtered by visible firing count.
          </p>
        </div>
        <div className="clock">
          <span className="big">{view.length}</span>
          <span className="live">repos</span>
        </div>
      </section>

      <section className="verdict">
        <div className="v-stamp">
          <span>breakout board</span>
          <span className="ts">{multiChannel}</span>
          <span className="ago">multi-channel</span>
        </div>
        <p className="v-text">
          <b>{totalFiring} repos</b> are firing on at least one visible channel.{" "}
          <span className="hl-early">{multiChannel} multi-channel</span>{" "}
          candidates clear the noise filter, with{" "}
          <span className="hl-div">{allThree} all-three</span> consensus hits.
        </p>
        <div className="v-actions">
          <Link href="/feeds/breakouts.xml">RSS</Link>
          <Link href="/consensus">Consensus</Link>
        </div>
      </section>

      <MetricGrid columns={5} className="kpi-band">
        <Metric label="Firing" value={totalFiring} sub=">=1 channel" pip />
        <Metric label="Multi" value={multiChannel} sub=">=2 channels" tone="positive" pip />
        <Metric label="All three" value={allThree} sub="gh + r + hn" tone="accent" pip />
        <Metric label="Noise" value={oneChannel} sub="single channel" tone="warning" pip />
        <Metric label="Top score" value={topScore.toFixed(2)} sub="max signal" tone="external" pip />
      </MetricGrid>

      <SectionHead
        num="01"
        title="Breakout leaderboard"
        meta={<><b>{view.length}</b> / {FILTER_LABELS[filter]}</>}
      />
      <section className="board">
        <div className="filter-bar">
          <span className="lbl">Filter</span>
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
            <Link
              key={key}
              href={`/breakouts?filter=${key}`}
              scroll={false}
              className={`chip ${key === filter ? "on" : ""}`}
              aria-current={key === filter ? "page" : undefined}
            >
              {FILTER_LABELS[key]}
            </Link>
          ))}
          <span className="right">{view.length} repos</span>
        </div>
        {view.length === 0 ? (
          <div className="p-8 text-sm text-text-secondary">
            No repos match this filter right now.
          </div>
        ) : (
          <>
            <div className="lb-head">
              <span>#</span>
              <span>Repository</span>
              <span className="num">Score</span>
              <span>Channels</span>
              <span>Signals</span>
              <span>24h</span>
            </div>
            {view.map((repo, index) => {
              const delta24 = repo.starsDelta24h;
              const deltaLabel =
                delta24 > 0
                  ? `+${formatNumber(delta24)}`
                  : delta24 < 0
                    ? formatNumber(delta24)
                    : "0";
              const score = Math.max(4, Math.min(100, Math.round((repo.crossSignalScore ?? 0) * 32)));
              return (
                <Link
                  key={repo.id}
                  href={`/repo/${repo.owner}/${repo.name}`}
                  className={`lb-row ${index === 0 ? "first" : ""}`}
                >
                  <span className="rk">
                    <span className="n">{String(index + 1).padStart(2, "0")}</span>
                  </span>
                  <span className="repo">
                    <span className="av">{repo.fullName.slice(0, 2).toUpperCase()}</span>
                    <span className="nm-wrap">
                      <span className="nm">{repo.fullName}</span>
                      <span className="desc">
                        {repo.categoryId ?? "uncategorized"} / {formatNumber(repo.stars)} stars
                      </span>
                    </span>
                  </span>
                  <span className="score">
                    <span className="v">{(repo.crossSignalScore ?? 0).toFixed(2)}</span>
                    <span className="conf-bar"><i style={{ width: `${score}%` }} /></span>
                  </span>
                  <span className="ranks">
                    <span className="rb us"><span className="lab">GH</span><span className="v">{channelRank(repo, nowMs, "github")}</span></span>
                  </span>
                  <span className="ranks">
                    <span className="rb gh"><span className="lab">R</span><span className="v">{channelRank(repo, nowMs, "reddit")}</span></span>
                    <span className="rb hf"><span className="lab">HN</span><span className="v">{channelRank(repo, nowMs, "hn")}</span></span>
                  </span>
                  <span className="badge cons">
                    <span className="pip" aria-hidden="true" />
                    {deltaLabel}
                  </span>
                </Link>
              );
            })}
          </>
        )}
      </section>
    </main>
  );
}
