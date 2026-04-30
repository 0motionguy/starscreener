import Link from "next/link";

import type {
  ConsensusItem,
  ConsensusVerdictBand,
  ConsensusExternalSource,
} from "@/lib/consensus-trending";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl } from "@/lib/logos";

const BAND_ORDER: ConsensusVerdictBand[] = [
  "strong_consensus",
  "early_call",
  "divergence",
  "external_only",
  "single_source",
];

const BAND_META: Record<
  ConsensusVerdictBand,
  { cssClass: string; title: string; sub: string; badgeClass: string; badgeLabel: string }
> = {
  strong_consensus: {
    cssClass: "cons",
    title: "STRONG CONSENSUS",
    sub: "≥ 5 of 8 sources agree, gap ≤ 30",
    badgeClass: "cons",
    badgeLabel: "CONSENSUS",
  },
  early_call: {
    cssClass: "early",
    title: "EARLY CALL",
    sub: "OURS ranked ≥ 20 places before external feeds",
    badgeClass: "early",
    badgeLabel: "EARLY",
  },
  divergence: {
    cssClass: "div",
    title: "DIVERGENCE",
    sub: "engines disagree by > 30 ranks",
    badgeClass: "div",
    badgeLabel: "DIVERGENCE",
  },
  external_only: {
    cssClass: "ext",
    title: "EXTERNAL ONLY",
    sub: "caught by feeds · not yet on our radar",
    badgeClass: "ext",
    badgeLabel: "EXTERNAL",
  },
  single_source: {
    cssClass: "single",
    title: "SINGLE SOURCE",
    sub: "one feed only · low validation",
    badgeClass: "single",
    badgeLabel: "SINGLE",
  },
};

const SOURCE_ORDER: ConsensusExternalSource[] = ["gh", "hf", "hn", "x", "r", "pdh", "dev", "bs"];
const SOURCE_NAMES: Record<ConsensusExternalSource, string> = {
  gh: "GitHub",
  hf: "Hugging Face",
  hn: "Hacker News",
  x: "X / Twitter",
  r: "Reddit",
  pdh: "Product Hunt",
  dev: "Dev.to",
  bs: "Bluesky",
};

function consensusHref(fullName: string): string {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return "#";
  return `/consensus/${owner}/${name}`;
}

interface ConsensusBoardProps {
  items: ConsensusItem[];
  /** Per-band cap. Default 20. */
  perBand?: number;
}

export function ConsensusBoard({ items, perBand = 20 }: ConsensusBoardProps) {
  const grouped = new Map<ConsensusVerdictBand, ConsensusItem[]>();
  for (const band of BAND_ORDER) grouped.set(band, []);
  for (const item of items) {
    grouped.get(item.verdict)?.push(item);
  }

  return (
    <div className="board">
      <div className="lb-head">
        <span>#</span>
        <span>Repository</span>
        <span className="num">Score · conf</span>
        <span>Verdict</span>
        <span>Sources · 8</span>
        <span>Per-engine rank</span>
      </div>
      {BAND_ORDER.map((band) => {
        const meta = BAND_META[band];
        const bandItems = grouped.get(band)?.slice(0, perBand) ?? [];
        if (bandItems.length === 0) return null;
        return (
          <div className={`band ${meta.cssClass}`} key={band}>
            <div className="band-head">
              <div className="b-pip" aria-hidden="true" />
              <div>
                <div className="b-title">{meta.title}</div>
                <div className="b-sub">{meta.sub}</div>
              </div>
              <div className="b-meta">
                <b>{bandItems.length}</b> · in band
              </div>
            </div>
            {bandItems.map((item, idx) => (
              <BoardRow
                key={item.fullName}
                item={item}
                isFirst={band === "strong_consensus" && idx === 0}
                badgeMeta={meta}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BoardRow({
  item,
  isFirst,
  badgeMeta,
}: {
  item: ConsensusItem;
  isFirst: boolean;
  badgeMeta: typeof BAND_META[ConsensusVerdictBand];
}) {
  return (
    <Link href={consensusHref(item.fullName)} className={`lb-row ${isFirst ? "first" : ""}`}>
      <div className="rk">
        {isFirst ? <span className="star">★</span> : null}
        <span className="n">{String(item.rank).padStart(2, "0")}</span>
      </div>
      <div className="repo">
        <EntityLogo src={repoLogoUrl(item.fullName, 24)} name={item.fullName} size={24} shape="square" alt="" />
        <span className="nm-wrap">
          <span className="nm">{item.fullName}</span>
          <span className="desc">
            {item.sourceCount}/8 sources · gap {item.maxRankGap}
          </span>
        </span>
      </div>
      <div className="score">
        <span className="v">{item.consensusScore.toFixed(1)}</span>
        <span className="conf-bar">
          <i style={{ width: `${item.confidence}%` }} />
        </span>
        <span className="conf-pct">conf {item.confidence}%</span>
      </div>
      <div>
        <span className={`badge ${badgeMeta.badgeClass}`}>
          <span className="pip" aria-hidden="true" />
          {badgeMeta.badgeLabel}
        </span>
      </div>
      <Gauge item={item} />
      <RankPills item={item} />
    </Link>
  );
}

function Gauge({ item }: { item: ConsensusItem }) {
  return (
    <div className="gauge">
      {SOURCE_ORDER.map((k) => {
        const c = item.sources[k];
        const cls = c.present ? (c.normalized > 0.4 ? "on" : "weak") : "";
        const status = c.present ? `rank #${c.rank}` : "absent";
        return <span key={k} className={`g ${cls}`} title={`${SOURCE_NAMES[k]}: ${status}`} />;
      })}
    </div>
  );
}

function RankPills({ item }: { item: ConsensusItem }) {
  const us = item.oursRank;
  const gh = item.sources.gh.rank;
  const hf = item.sources.hf.rank;
  return (
    <div className="ranks">
      <RankPill label="US" rank={us} cls="us" />
      <RankPill label="GH" rank={gh} cls="gh" />
      <RankPill label="HF" rank={hf} cls="hf" />
    </div>
  );
}

function RankPill({ label, rank, cls }: { label: string; rank: number | null; cls: string }) {
  if (rank == null) {
    return (
      <span className="rb dash" title={`${label}: not ranked`}>
        —
      </span>
    );
  }
  return (
    <span className={`rb ${cls}`} title={`${label} rank`}>
      <span className="lab">{label}</span>
      <span className="v">#{rank}</span>
    </span>
  );
}
