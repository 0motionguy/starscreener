import Link from "next/link";
import type { ReactNode } from "react";

import {
  getConsensusTrendingItems,
  getConsensusTrendingMeta,
  refreshConsensusTrendingFromStore,
  type ConsensusBadge,
  type ConsensusItem,
} from "@/lib/consensus-trending";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { Card, CardHeader } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { repoLogoUrl } from "@/lib/logos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BADGE_LABELS: Record<ConsensusBadge, string> = {
  consensus_pick: "Consensus",
  our_early_signal: "Early",
  external_breakout: "External",
  divergence: "Divergence",
};

const BADGE_CLASS: Record<ConsensusBadge, string> = {
  consensus_pick: "cons",
  our_early_signal: "early",
  external_breakout: "ext",
  divergence: "div",
};

function fmtScore(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function repoHref(fullName: string): string {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return "#";
  return `/repo/${owner}/${name}`;
}

function sourceRank(
  item: ConsensusItem,
  source: "ours" | "oss" | "trendshift",
): string {
  const s = item.sources[source];
  return s.present && typeof s.rank === "number" ? `#${s.rank}` : "-";
}

function sourceCount(item: ConsensusItem): number {
  return (["ours", "oss", "trendshift"] as const).filter(
    (source) => item.sources[source].present,
  ).length;
}

function primaryBadge(item: ConsensusItem): ConsensusBadge | null {
  return item.badges[0] ?? null;
}

function confidencePct(item: ConsensusItem): number {
  return Math.max(4, Math.min(100, Math.round(item.consensusScore * 10)));
}

function formatComputedAt(value: string): string {
  if (!value) return "warming";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(11, 19)
    : "warming";
}

function Badge({ badge }: { badge: ConsensusBadge }) {
  return (
    <span className={`badge ${BADGE_CLASS[badge]}`}>
      <span className="pip" aria-hidden="true" />
      {BADGE_LABELS[badge]}
    </span>
  );
}

function EmptyState() {
  return (
    <Card className="p-8 text-sm text-text-secondary">
      Consensus data is warming. The worker publishes after Trendshift, OSS
      Insight, and TrendingRepo engagement inputs have refreshed.
    </Card>
  );
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

export default async function ConsensusPage() {
  await refreshConsensusTrendingFromStore();
  const meta = getConsensusTrendingMeta();
  const items = getConsensusTrendingItems(100);
  const consensusPicks = items.filter((i) =>
    i.badges.includes("consensus_pick"),
  ).length;
  const early = items.filter((i) =>
    i.badges.includes("our_early_signal"),
  ).length;
  const external = items.filter((i) =>
    i.badges.includes("external_breakout"),
  ).length;
  const divergence = items.filter((i) => i.badges.includes("divergence")).length;
  const computed = formatComputedAt(meta.computedAt);
  const topItems = items.slice(0, 20);
  const earlyItems = items
    .filter((i) => i.badges.includes("our_early_signal"))
    .slice(0, 6);
  const divergenceItems = items
    .filter((i) => i.badges.includes("divergence"))
    .slice(0, 6);

  return (
    <main className="home-surface">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Consensus</b> / source agreement / rank fusion
          </div>
          <h1>What independent feeds agree on.</h1>
          <p className="lede">
            A compact board for repos that line up across TrendingRepo,
            OSS Insight, and Trendshift.
          </p>
        </div>
        <div className="clock">
          <span className="big">{computed}</span>
          <span className="live">computed</span>
        </div>
      </section>

      <section className="verdict">
        <div className="v-stamp">
          <span>daily verdict</span>
          <span className="ts">{computed}</span>
          <span className="ago">rank fusion</span>
        </div>
        <p className="v-text">
          <b>{consensusPicks} consensus picks</b> are validated by multiple
          engines. <span className="hl-early">{early} early signals</span>{" "}
          lean toward TrendingRepo first, while{" "}
          <span className="hl-div">{divergence} divergences</span> need manual
          review before promotion.
        </p>
        <div className="v-actions">
          <Link href="/api/scoring/consensus?limit=100">JSON</Link>
          <Link href="/breakouts">Breakouts</Link>
        </div>
      </section>

      <MetricGrid columns={5} className="kpi-band">
        <Metric label="Total" value={items.length} sub="tracked repos" pip />
        <Metric
          label="Consensus"
          value={consensusPicks}
          sub="multi-engine"
          tone="consensus"
          pip
        />
        <Metric label="Early" value={early} sub="ours first" tone="early" pip />
        <Metric
          label="External"
          value={external}
          sub="outside lift"
          tone="external"
          pip
        />
        <Metric
          label="Divergence"
          value={divergence}
          sub="review"
          tone="divergence"
          pip
        />
      </MetricGrid>

      <div className="src-strip">
        <div className="src-cell">
          <div className="src-top">
            <span className="sd sd-gh">TR</span>
            <span className="nm">TrendingRepo</span>
            <span className="wt">0.42</span>
          </div>
          <div className="ct">{items.length}</div>
          <div className="meta">engagement + velocity</div>
          <span className="bar"><i style={{ width: "72%" }} /></span>
        </div>
        <div className="src-cell">
          <div className="src-top">
            <span className="sd sd-hf">OSS</span>
            <span className="nm">OSS Insight</span>
            <span className="wt">0.32</span>
          </div>
          <div className="ct">{consensusPicks + external}</div>
          <div className="meta">external validation</div>
          <span className="bar"><i style={{ width: "58%" }} /></span>
        </div>
        <div className="src-cell">
          <div className="src-top">
            <span className="sd sd-x">TS</span>
            <span className="nm">Trendshift</span>
            <span className="wt">0.26</span>
          </div>
          <div className="ct">{external + divergence}</div>
          <div className="meta">rank movement</div>
          <span className="bar"><i style={{ width: "46%" }} /></span>
        </div>
      </div>

      <SectionHead
        num="01"
        title="Consensus leaderboard"
        meta={<><b>{topItems.length}</b> / top ranked</>}
      />

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="board">
          <div className="filter-bar">
            <span className="lbl">View</span>
            <span className="chip on">All</span>
            <span className="chip">
              <span className="pip cons" />
              Consensus
            </span>
            <span className="chip">
              <span className="pip early" />
              Early
            </span>
            <span className="chip">
              <span className="pip div" />
              Divergence
            </span>
            <span className="right">computed / {computed}</span>
          </div>
          <div className="lb-head">
            <span>#</span>
            <span>Repository</span>
            <span className="num">Score</span>
            <span>Sources</span>
            <span>Ranks</span>
            <span>Badge</span>
          </div>
          {topItems.map((item, index) => {
            const badge = primaryBadge(item);
            return (
              <Link
                key={item.fullName}
                href={repoHref(item.fullName)}
                className={`lb-row ${index === 0 ? "first" : ""}`}
              >
                <span className="rk">
                  <span className="n">{String(item.rank).padStart(2, "0")}</span>
                </span>
                <span className="repo">
                  <EntityLogo
                    src={repoLogoUrl(item.fullName, 24)}
                    name={item.fullName}
                    size={24}
                    shape="square"
                    alt=""
                  />
                  <span className="nm-wrap">
                    <span className="nm">{item.fullName}</span>
                    <span className="desc">
                      {sourceCount(item)} source agreement / confidence{" "}
                      {confidencePct(item)}%
                    </span>
                  </span>
                </span>
                <span className="score">
                  <span className="v">{fmtScore(item.consensusScore)}</span>
                  <span className="conf-bar">
                    <i style={{ width: `${confidencePct(item)}%` }} />
                  </span>
                </span>
                <span className="ranks">
                  <span className="rb us">
                    <span className="lab">TR</span>
                    <span className="v">{sourceRank(item, "ours")}</span>
                  </span>
                </span>
                <span className="ranks">
                  <span className="rb gh">
                    <span className="lab">OSS</span>
                    <span className="v">{sourceRank(item, "oss")}</span>
                  </span>
                  <span className="rb hf">
                    <span className="lab">TS</span>
                    <span className="v">{sourceRank(item, "trendshift")}</span>
                  </span>
                </span>
                {badge ? <Badge badge={badge} /> : <span className="badge single">Single</span>}
              </Link>
            );
          })}
        </section>
      )}

      <SectionHead
        num="02"
        title="Review lanes"
        meta={<><b>Early</b> / divergence</>}
      />
      <div className="grid">
        <Card className="col-6">
          <CardHeader showCorner right={<span>{earlyItems.length} active</span>}>
            Early signals
          </CardHeader>
          {earlyItems.map((item, index) => (
            <Link
              key={item.fullName}
              href={repoHref(item.fullName)}
              className="sp-row"
            >
              <span className="rk">{String(index + 1).padStart(2, "0")}</span>
              <span className="nm">
                <span className="h">{item.fullName}</span>
                <span className="meta">TrendingRepo ahead of external ranks</span>
              </span>
              <span className="delta up">
                {fmtScore(item.consensusScore)}
                <span className="lbl">score</span>
              </span>
            </Link>
          ))}
        </Card>
        <Card className="col-6">
          <CardHeader showCorner right={<span>{divergenceItems.length} active</span>}>
            Divergence
          </CardHeader>
          {divergenceItems.map((item, index) => (
            <Link
              key={item.fullName}
              href={repoHref(item.fullName)}
              className="sp-row"
            >
              <span className="rk">{String(index + 1).padStart(2, "0")}</span>
              <span className="nm">
                <span className="h">{item.fullName}</span>
                <span className="meta">rank disagreement across sources</span>
              </span>
              <span className="delta dn">
                {sourceCount(item)}/3
                <span className="lbl">sources</span>
              </span>
            </Link>
          ))}
        </Card>
      </div>
    </main>
  );
}
