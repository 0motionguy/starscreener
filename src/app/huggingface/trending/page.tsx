// /huggingface/trending — V4 SourceFeedTemplate consumer.
//
// Reads `huggingface-trending` Redis payload (populated by
// scripts/scrape-huggingface.mjs) through the domain pipeline:
//   hfModelScorer.computeRaw() → computeCrossDomainMomentum() → top 100
//
// Template provides PageHead + KpiBand snapshot + list slot; HfModelFeed
// table renders inside the list slot unchanged.

import type { Metadata } from "next";
import {
  getHfModelsTrending,
  getHfTrendingFile,
  refreshHfModelsFromStore,
  type HfModelTrending,
} from "@/lib/huggingface";
import {
  TerminalFeedTable,
  type FeedColumn,
} from "@/components/feed/TerminalFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { huggingFaceLogoUrl, huggingFaceAuthorLogoUrl } from "@/lib/logos";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

// HF "yellow" — no `--v4-src-hf` token exists; hardcoded once on the pip,
// rest of the page stays tokenized via var(--v4-*).
const HF_YELLOW = "#FFD21E";

export const dynamic = "force-static";
export const revalidate = 1800; // 30 min

export const metadata: Metadata = {
  title: "Trending Hugging Face Models",
  description:
    "Top 100 Hugging Face models by domain-scored momentum — downloads, likes, recency, and cross-source mentions. Live model leaderboard.",
  alternates: { canonical: "/huggingface/trending" },
  openGraph: {
    title: "Trending Hugging Face Models — TrendingRepo",
    description: "Top HF models by domain-scored momentum.",
    url: "/huggingface/trending",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trending Hugging Face Models — TrendingRepo",
    description: "Top HF models by domain-scored momentum.",
  },
};

function formatAgeIso(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const hours = Math.max(0, (nowMs - t) / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export default async function HuggingFaceTrendingPage() {
  await refreshHfModelsFromStore();
  const file = getHfTrendingFile();
  const models = getHfModelsTrending(100);
  const allModels = file.models ?? [];
  const cold = allModels.length === 0;

  if (cold) {
    return (
      <main className="home-surface">
        <SourceFeedTemplate
          crumb={
            <>
              <b>HF</b> · TERMINAL · /HUGGINGFACE
            </>
          }
          title="Hugging Face · trending"
          lede="Top models ranked by domain-scored momentum (weeklyDownloads + recency). Snapshot pulled from the public trending feed and re-scored against the cross-domain percentile."
        />
        <ColdState />
      </main>
    );
  }

  const totalDownloads = allModels.reduce((s, m) => s + (m.downloads ?? 0), 0);
  const topDownloads = allModels.reduce(
    (m, r) => Math.max(m, r.downloads ?? 0),
    0,
  );
  const totalLikes = allModels.reduce((s, m) => s + (m.likes ?? 0), 0);
  const nowMs = Date.now();
  const newThisWeek = allModels.filter((m) => {
    const t = m.createdAt ? Date.parse(m.createdAt) : NaN;
    if (!Number.isFinite(t)) return false;
    return nowMs - t <= 7 * 24 * 3_600_000;
  }).length;

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>HF</b> · TERMINAL · /HUGGINGFACE
          </>
        }
        title="Hugging Face · trending"
        lede="Top models ranked by domain-scored momentum (weeklyDownloads + recency). Snapshot pulled from the public trending feed and re-scored against the cross-domain percentile."
        clock={
          <>
            <span className="big">{formatClock(file.fetchedAt)}</span>
            <span className="muted">UTC · SCRAPED</span>
            <LiveDot label="FRESH · 3H" />
          </>
        }
        snapshot={
          <KpiBand
            cells={[
              {
                label: "MODELS",
                value: allModels.length.toLocaleString("en-US"),
                sub: "tracked",
                pip: HF_YELLOW,
              },
              {
                label: "TOP DOWNLOADS",
                value: compactNumber(topDownloads),
                sub: `${compactNumber(totalDownloads)} total`,
                tone: "acc",
                pip: "var(--v4-acc)",
              },
              {
                label: "NEW THIS WEEK",
                value: newThisWeek,
                sub: "createdAt ≤ 7d",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "LIKES",
                value: compactNumber(totalLikes),
                sub: "summed across feed",
                pip: "var(--v4-blue)",
              },
            ]}
          />
        }
        listEyebrow="Model feed · top 100 by momentum"
        list={<HfModelFeed models={models} />}
      />
    </main>
  );
}

function HfModelFeed({ models }: { models: HfModelTrending[] }) {
  const nowMs = Date.now();

  const columns: FeedColumn<HfModelTrending>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      render: (_, i) => (
        <span
          className="font-mono text-[12px] tabular-nums font-semibold"
          style={{ color: i < 10 ? HF_YELLOW : "var(--v4-ink-400)" }}
        >
          {String(i + 1).padStart(2, "0")}
        </span>
      ),
    },
    {
      id: "title",
      header: "Model",
      render: (m) => (
        <div className="flex min-w-0 items-center gap-2">
          <EntityLogo
            src={huggingFaceAuthorLogoUrl(m.author)}
            name={m.author ?? m.id}
            size={20}
            shape="square"
            alt=""
          />
          <a
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-[13px] font-medium transition-colors hover:text-[color:var(--v4-acc)]"
            style={{ color: "var(--v4-ink-100)" }}
            title={m.id}
          >
            {m.id}
          </a>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      width: "140px",
      hideBelow: "sm",
      render: (m) => {
        const tag = m.pipelineTag ?? m.libraryName ?? null;
        if (!tag) return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
        return (
          <span
            className="v2-mono inline-block px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase"
            style={{
              border: "1px solid var(--v4-line-200)",
              background: "var(--v4-bg-100)",
              color: "var(--v4-ink-300)",
              borderRadius: 2,
            }}
            title={tag}
          >
            {tag}
          </span>
        );
      },
    },
    {
      id: "downloads",
      header: "Downloads",
      width: "90px",
      align: "right",
      render: (m) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{
            color: (m.downloads ?? 0) >= 100_000 ? HF_YELLOW : "var(--v4-ink-100)",
          }}
        >
          {compactNumber(m.downloads ?? 0)}
        </span>
      ),
    },
    {
      id: "likes",
      header: "Likes",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (m) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-300)" }}
        >
          {compactNumber(m.likes ?? 0)}
        </span>
      ),
    },
    {
      id: "momentum",
      header: "Momentum",
      width: "120px",
      hideBelow: "md",
      render: (m) => <MomentumBar value={m.momentum} accent={HF_YELLOW} />,
    },
    {
      id: "age",
      header: "Age",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (m) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {formatAgeIso(m.lastModified ?? m.createdAt, nowMs)}
        </span>
      ),
    },
  ];

  return (
    <TerminalFeedTable
      rows={models}
      columns={columns}
      rowKey={(m) => m.id}
      accent={HF_YELLOW}
      caption="Hugging Face models ranked by domain-scored momentum"
    />
  );
}

function MomentumBar({ value, accent }: { value: number; accent: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1"
        style={{
          height: 6,
          background: "var(--v4-bg-100)",
          borderRadius: 1,
          overflow: "hidden",
          minWidth: 40,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: accent,
            boxShadow: pct > 0 ? `0 0 6px ${accent}66` : undefined,
          }}
        />
      </div>
      <span
        className="font-mono text-[10px] tabular-nums shrink-0"
        style={{ color: "var(--v4-ink-300)", width: 24, textAlign: "right" }}
      >
        {Math.round(pct)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cold-state fallback
// ---------------------------------------------------------------------------

function ColdState() {
  return (
    <section
      style={{
        padding: 32,
        background: "var(--v4-bg-025)",
        border: "1px dashed var(--v4-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono"
        style={{
          color: HF_YELLOW,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no data yet"}
      </h2>
      <p style={{ marginTop: 12, maxWidth: "32rem", fontSize: 13, color: "var(--v4-ink-300)" }}>
        The Hugging Face scraper hasn&apos;t run yet. Run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>
          npm run scrape:huggingface
        </code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>
          data/huggingface-trending.json
        </code>
        , then refresh this page.
      </p>
    </section>
  );
}
