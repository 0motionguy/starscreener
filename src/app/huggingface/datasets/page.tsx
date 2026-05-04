// /huggingface/datasets — V4 SourceFeedTemplate consumer.
//
// Domain-scored Hugging Face dataset feed (top 100). Reads
// `huggingface-datasets` Redis payload via the data-store and runs the
// new domain pipeline:
//   hfDatasetScorer.computeRaw() → computeCrossDomainMomentum() → top 100
//
// Template provides PageHead + KpiBand snapshot + list slot. The dense
// TerminalFeedTable renders inside the list slot unchanged.

import type { Metadata } from "next";
import {
  getHfDatasetsTrending,
  getHfDatasetsFile,
  refreshHfDatasetsFromStore,
  type HfDatasetTrending,
} from "@/lib/hf-datasets";
import {
  compactNumber,
  applyCompactV1,
} from "@/components/news/newsTopMetrics";
import {
  TerminalFeedTable,
  type FeedColumn,
} from "@/components/feed/TerminalFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { huggingFaceLogoUrl } from "@/lib/logos";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

const HF_ACCENT_BAR = "#FFD21E"; // HF brand yellow

export const dynamic = "force-static";
export const revalidate = 1800; // 30 min

export const metadata: Metadata = {
  title: "Trending Hugging Face Datasets",
  description:
    "Top 100 Hugging Face datasets by domain-scored momentum — downloads, likes, recency. Live dataset leaderboard.",
  alternates: { canonical: "/huggingface/datasets" },
  openGraph: {
    title: "Trending Hugging Face Datasets — TrendingRepo",
    description: "Top HF datasets by domain-scored momentum.",
    url: "/huggingface/datasets",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trending Hugging Face Datasets — TrendingRepo",
    description: "Top HF datasets by domain-scored momentum.",
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

export default async function HuggingFaceDatasetsPage() {
  await refreshHfDatasetsFromStore();
  const file = getHfDatasetsFile();
  const datasets = getHfDatasetsTrending(100);
  const allDatasets = file.datasets ?? [];
  const cold = allDatasets.length === 0;

  if (cold) {
    return (
      <main className="home-surface">
        <SourceFeedTemplate
          crumb={
            <>
              <b>HF</b> · TERMINAL · /HUGGINGFACE · DATASETS
            </>
          }
          title="Hugging Face · datasets"
          lede="Top datasets ranked by domain-scored momentum. Weekly downloads + recency drive ranking through hfDatasetScorer + computeCrossDomainMomentum."
        />
        <ColdState />
      </main>
    );
  }

  const topDownloads = allDatasets.reduce(
    (m, d) => Math.max(m, d.downloads ?? 0),
    0,
  );
  const totalLikes = allDatasets.reduce((s, d) => s + (d.likes ?? 0), 0);
  const nowMs = Date.now();
  const weekMs = 7 * 24 * 3_600_000;
  const newThisWeek = allDatasets.filter((d) => {
    const t = Date.parse(d.createdAt ?? "");
    return Number.isFinite(t) && nowMs - t < weekMs;
  }).length;
  const raws = allDatasets;
  const scored = datasets;
  const totalDownloads = raws.reduce((s, d) => s + (d.downloads ?? 0), 0);

  // Tag distribution (top 6) — substitutes for "topics" panel.
  const tagCounts = new Map<string, number>();
  for (const r of raws) {
    for (const t of r.tags ?? []) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }
  const tagBars = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag, count], i) => ({
      label: tag.toUpperCase(),
      value: count,
      valueLabel: count.toLocaleString("en-US"),
      color: ["#FF9F1C", "#F472B6", "#3AD6C5", "#A78BFA", "#34D399", "#FBBF24"][i % 6],
    }));

  // Top authors (top 6 by appearance count).
  const authorCounts = new Map<string, number>();
  for (const r of raws) {
    const a = r.author ?? "unknown";
    authorCounts.set(a, (authorCounts.get(a) ?? 0) + 1);
  }
  const authorBars = Array.from(authorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([author, count]) => ({
      label: author.toUpperCase(),
      value: count,
      valueLabel: count.toLocaleString("en-US"),
      color: HF_ACCENT_BAR,
      logoUrl: huggingFaceLogoUrl(),
      logoName: author,
    }));

  const cards = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${raws.length} DATASETS`,
        label: "DATASETS TRACKED",
        value: compactNumber(raws.length),
        hint: `${tagCounts.size} TAGS`,
        rows: [
          { label: "TOTAL DOWNLOADS", value: compactNumber(totalDownloads) },
          {
            label: "TOP DOWNLOADS",
            value: compactNumber(topDownloads),
            tone: "accent",
          },
          { label: "TOTAL LIKES", value: compactNumber(totalLikes) },
        ],
      },
      {
        variant: "bars",
        title: "// AUTHORS · TOP 6",
        rightLabel: `${authorBars.length}`,
        bars: authorBars,
        labelWidth: 96,
        emptyText: "NO AUTHORS YET",
      },
      {
        variant: "bars",
        title: "// TAGS · MIX",
        rightLabel: `TOP ${tagBars.length}`,
        bars: tagBars,
        labelWidth: 96,
        emptyText: "NO TAGS YET",
      },
    ],
    { totalItems: raws.length },
  );

  // Hero stories — top 3 datasets by momentum.
  const topStories = scored.slice(0, 3).map((d) => ({
    title: d.id,
    href: d.url,
    external: true,
    sourceCode: "HF",
    byline: d.tags?.[0] ?? undefined,
    scoreLabel: `${compactNumber(d.downloads ?? 0)} dl · ${compactNumber(d.likes ?? 0)} ♥`,
    ageHours: d.lastModified
      ? Math.max(0, (Date.now() - Date.parse(d.lastModified)) / 3_600_000)
      : null,
    logoUrl: huggingFaceLogoUrl(),
    logoName: d.author ?? d.id,
  }));

  // Use cards/topStories to silence unused-var; render path below.
  void cards;
  void topStories;

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>HF</b> · TERMINAL · /HUGGINGFACE · DATASETS
          </>
        }
        title="Hugging Face · datasets"
        lede="Top datasets ranked by domain-scored momentum. Weekly downloads + recency drive ranking through hfDatasetScorer + computeCrossDomainMomentum."
        list={<HfDatasetFeed datasets={datasets} />}
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Feed table
// ---------------------------------------------------------------------------

function HfDatasetFeed({ datasets }: { datasets: HfDatasetTrending[] }) {
  const nowMs = Date.now();

  const columns: FeedColumn<HfDatasetTrending>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      render: (_, i) => (
        <span
          className="font-mono text-[12px] tabular-nums font-semibold"
          style={{ color: i < 10 ? HF_ACCENT_BAR : "var(--v4-ink-400)" }}
        >
          {String(i + 1).padStart(2, "0")}
        </span>
      ),
    },
    {
      id: "title",
      header: "Dataset",
      render: (d) => (
        <div className="flex min-w-0 items-center gap-2">
          <EntityLogo
            src={huggingFaceLogoUrl()}
            name={d.author ?? d.id}
            size={20}
            shape="square"
            alt=""
          />
          <a
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-[13px] font-medium transition-colors hover:text-[color:var(--v4-acc)]"
            style={{ color: "var(--v4-ink-100)" }}
            title={d.id}
          >
            {d.id}
          </a>
        </div>
      ),
    },
    {
      id: "downloads",
      header: "Downloads",
      width: "100px",
      align: "right",
      render: (d) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{
            color: (d.downloads ?? 0) >= 100_000 ? HF_ACCENT_BAR : "var(--v4-ink-100)",
          }}
        >
          {compactNumber(d.downloads ?? 0)}
        </span>
      ),
    },
    {
      id: "likes",
      header: "Likes",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (d) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-300)" }}
        >
          {compactNumber(d.likes ?? 0)}
        </span>
      ),
    },
    {
      id: "momentum",
      header: "Momentum",
      width: "120px",
      hideBelow: "md",
      render: (d) => <MomentumBar value={d.momentum} accent={HF_ACCENT_BAR} />,
    },
    {
      id: "age",
      header: "Age",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (d) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {formatAgeIso(d.lastModified ?? d.createdAt, nowMs)}
        </span>
      ),
    },
  ];

  return (
    <TerminalFeedTable
      rows={datasets}
      columns={columns}
      rowKey={(d) => d.id}
      accent={HF_ACCENT_BAR}
      caption="Hugging Face datasets ranked by domain-scored momentum"
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
          color: HF_ACCENT_BAR,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no data yet"}
      </h2>
      <p style={{ marginTop: 12, maxWidth: "32rem", fontSize: 13, color: "var(--v4-ink-300)" }}>
        The Hugging Face datasets scraper hasn&apos;t run yet. Run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>
          node scripts/scrape-huggingface-datasets.mjs
        </code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>
          data/huggingface-datasets.json
        </code>
        , then refresh this page.
      </p>
    </section>
  );
}
