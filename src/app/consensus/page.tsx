import Link from "next/link";
import { GitFork, Radar, Sparkles, Star, TriangleAlert } from "lucide-react";
import {
  getConsensusTrendingItems,
  getConsensusTrendingMeta,
  refreshConsensusTrendingFromStore,
  type ConsensusBadge,
  type ConsensusItem,
  type ConsensusSource,
  type ConsensusSourceComponent,
} from "@/lib/consensus-trending";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl } from "@/lib/logos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BADGE_LABELS: Record<ConsensusBadge, string> = {
  consensus_pick: "Consensus",
  our_early_signal: "Early",
  external_breakout: "External",
  divergence: "Divergence",
};

const BADGE_STYLES: Record<ConsensusBadge, string> = {
  consensus_pick: "border-emerald-400/60 text-emerald-200 bg-emerald-500/10",
  our_early_signal: "border-cyan-400/60 text-cyan-200 bg-cyan-500/10",
  external_breakout: "border-amber-400/60 text-amber-200 bg-amber-500/10",
  divergence: "border-rose-400/60 text-rose-200 bg-rose-500/10",
};

function fmtScore(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function sourceMark(
  item: ConsensusItem,
  source: ConsensusSource | "oss" | "trendshift",
) {
  const s = (item.sources as Record<string, ConsensusSourceComponent | undefined>)[
    source
  ];
  if (!s || !s.present) return <span className="text-text-tertiary">-</span>;
  return (
    <span className="tabular-nums text-text-primary">
      #{s.rank}
    </span>
  );
}

function repoHref(fullName: string): string {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return "#";
  return `/repo/${owner}/${name}`;
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="border border-border-primary bg-bg-secondary px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-text-tertiary">
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="mt-2 font-mono text-2xl text-text-primary tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Badge({ badge }: { badge: ConsensusBadge }) {
  return (
    <span
      className={`inline-flex h-6 items-center border px-2 text-[10px] uppercase tracking-wider ${BADGE_STYLES[badge]}`}
    >
      {BADGE_LABELS[badge]}
    </span>
  );
}

function EmptyState() {
  return (
    <section className="border border-border-primary bg-bg-secondary p-8 text-sm text-text-secondary">
      Consensus data is warming. The worker publishes after Trendshift, OSS
      Insight, and STARSCREENER engagement inputs have refreshed.
    </section>
  );
}

export default async function ConsensusPage() {
  await refreshConsensusTrendingFromStore();
  const meta = getConsensusTrendingMeta();
  const items = getConsensusTrendingItems(100);
  const consensusPicks = items.filter((i) => i.badges.includes("consensus_pick")).length;
  const early = items.filter((i) => i.badges.includes("our_early_signal")).length;
  const external = items.filter((i) => i.badges.includes("external_breakout")).length;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6 md:py-8">
        <header className="border-b border-border-primary pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-tertiary">
                <Radar size={14} />
                Ours + OSS Insight + Trendshift
              </div>
              <h1 className="mt-2 text-2xl font-bold uppercase tracking-wider md:text-3xl">
                Consensus Trending
              </h1>
            </div>
            <Link
              href="/api/scoring/consensus?limit=100"
              className="inline-flex min-h-10 items-center border border-border-primary px-3 text-[11px] uppercase tracking-wider text-text-secondary transition-colors hover:border-text-secondary hover:text-text-primary"
            >
              JSON
            </Link>
          </div>
          <p className="mt-3 max-w-3xl text-sm text-text-secondary">
            A rank-fused leaderboard that validates STARSCREENER momentum
            against two independent GitHub discovery engines.
          </p>
          <div className="mt-3 text-[11px] uppercase tracking-wider text-text-tertiary">
            {meta.computedAt ? `Computed ${meta.computedAt}` : "Waiting for first publish"}
          </div>
        </header>

        <section className="my-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Repos" value={String(items.length)} icon={<Star size={14} />} />
          <Stat label="Consensus" value={String(consensusPicks)} icon={<Sparkles size={14} />} />
          <Stat label="Our early" value={String(early)} icon={<Radar size={14} />} />
          <Stat label="External" value={String(external)} icon={<GitFork size={14} />} />
        </section>

        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <section className="overflow-hidden border border-border-primary bg-bg-secondary">
            <div className="hidden grid-cols-[48px_1fr_96px_90px_90px_100px_220px] gap-3 border-b border-border-primary px-4 py-2 text-[10px] uppercase tracking-wider text-text-tertiary md:grid">
              <span>#</span>
              <span>Repository</span>
              <span className="text-right">Score</span>
              <span className="text-right">Ours</span>
              <span className="text-right">OSS</span>
              <span className="text-right">Trendshift</span>
              <span>Badges</span>
            </div>
            <ol className="divide-y divide-border-primary/50">
              {items.map((item) => (
                <li key={item.fullName}>
                  <Link
                    href={repoHref(item.fullName)}
                    className="grid min-h-[64px] grid-cols-[34px_1fr_64px] gap-3 px-4 py-3 transition-colors hover:bg-bg-card-hover md:grid-cols-[48px_1fr_96px_90px_90px_100px_220px] md:items-center md:py-0"
                  >
                    <span className="text-[11px] text-text-tertiary tabular-nums">
                      {item.rank}
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <EntityLogo
                        src={repoLogoUrl(item.fullName, 24)}
                        name={item.fullName}
                        size={24}
                        shape="square"
                        alt=""
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text-primary">
                          {item.fullName}
                        </span>
                      <span className="mt-1 flex gap-2 text-[10px] uppercase tracking-wider text-text-tertiary md:hidden">
                        <span>O {sourceMark(item, "ours")}</span>
                        <span>OSS {sourceMark(item, "oss")}</span>
                        <span>TS {sourceMark(item, "trendshift")}</span>
                      </span>
                      </span>
                    </span>
                    <span className="text-right text-sm font-bold tabular-nums text-text-primary">
                      {fmtScore(item.consensusScore)}
                    </span>
                    <span className="hidden text-right text-[11px] md:block">
                      {sourceMark(item, "ours")}
                    </span>
                    <span className="hidden text-right text-[11px] md:block">
                      {sourceMark(item, "oss")}
                    </span>
                    <span className="hidden text-right text-[11px] md:block">
                      {sourceMark(item, "trendshift")}
                    </span>
                    <span className="col-span-3 flex flex-wrap gap-1 md:col-span-1">
                      {item.badges.length > 0 ? (
                        item.badges.map((badge) => <Badge key={badge} badge={badge} />)
                      ) : (
                        <span className="inline-flex h-6 items-center gap-1 border border-border-primary px-2 text-[10px] uppercase tracking-wider text-text-tertiary">
                          <TriangleAlert size={11} />
                          Single
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
