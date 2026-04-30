// /huggingface/datasets â€” domain-scored Hugging Face dataset feed.
//
// Reads `huggingface-datasets` Redis payload (populated by
// scripts/scrape-huggingface-datasets.mjs) through the new domain
// pipeline:
//   hfDatasetScorer.computeRaw() â†’ computeCrossDomainMomentum() â†’ top 100
//
// Mirrors /huggingface/trending visually: NewsTopHeaderV3 strip + a dense
// TerminalFeedTable below. ISR-cached at 30 min per project convention.

import {
  getHfDatasetsTrending,
  getHfDatasetsFile,
  refreshHfDatasetsFromStore,
  type HfDatasetTrending,
} from "@/lib/hf-datasets";
import {
  applyCompactV1,
  compactNumber,
} from "@/components/news/newsTopMetrics";
import {
  TerminalFeedTable,
  type FeedColumn,
} from "@/components/feed/TerminalFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { huggingFaceLogoUrl } from "@/lib/logos";
import { SourceFeedTemplate } from "@/components/source-feed/SourceFeedTemplate";

const HF_ACCENT = "rgba(255, 159, 28, 0.85)";
const HF_ACCENT_BAR = "#FF9F1C";

export const dynamic = "force-static";
export const revalidate = 1800; // 30 min

function formatAgeIso(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "â€”";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "â€”";
  const hours = Math.max(0, (nowMs - t) / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export default async function HuggingFaceDatasetsPage() {
  await refreshHfDatasetsFromStore();
  const file = getHfDatasetsFile();
  const datasets = getHfDatasetsTrending(100);
  const cold = (file.datasets ?? []).length === 0;

  return (
    <SourceFeedTemplate
      cold={cold}
      coldState={<ColdState />}
      header={{
        routeTitle: "HUGGINGFACE - DATASETS",
        liveLabel: "LIVE - 30M",
        eyebrow: "// HUGGINGFACE - DATASETS",
        meta: [
          {
            label: "TRACKED",
            value: (file.datasets?.length ?? 0).toLocaleString("en-US"),
          },
          { label: "TOP", value: String(datasets.length) },
        ],
        ...buildHuggingFaceDatasetsHeader(file.datasets ?? [], datasets),
        accent: HF_ACCENT,
        caption: [
          "// LAYOUT compact-v1",
          "- DOMAIN hf-dataset",
          "- SCORER weeklyDownloads + recency",
        ],
      }}
    >
      <HfDatasetFeed datasets={datasets} />
    </SourceFeedTemplate>
  );
}

// ---------------------------------------------------------------------------
// Header builder
// ---------------------------------------------------------------------------

function buildHuggingFaceDatasetsHeader(
  raws: { downloads: number; likes: number; tags: string[]; author: string }[],
  scored: HfDatasetTrending[],
) {
  const totalDownloads = raws.reduce((s, d) => s + (d.downloads ?? 0), 0);
  const totalLikes = raws.reduce((s, d) => s + (d.likes ?? 0), 0);
  const topDownloads = raws.reduce(
    (m, r) => Math.max(m, r.downloads ?? 0),
    0,
  );

  // Tag distribution (top 6) â€” substitutes for "topics" panel.
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
        title: "// SNAPSHOT Â· NOW",
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
        title: "// AUTHORS Â· TOP 6",
        rightLabel: `${authorBars.length}`,
        bars: authorBars,
        labelWidth: 96,
        emptyText: "NO AUTHORS YET",
      },
      {
        variant: "bars",
        title: "// TAGS Â· MIX",
        rightLabel: `TOP ${tagBars.length}`,
        bars: tagBars,
        labelWidth: 96,
        emptyText: "NO TAGS YET",
      },
    ],
    { totalItems: raws.length },
  );

  // Hero stories â€” top 3 datasets by momentum.
  const topStories = scored.slice(0, 3).map((d) => ({
    title: d.id,
    href: d.url,
    external: true,
    sourceCode: "HF",
    byline: d.tags?.[0] ?? undefined,
    scoreLabel: `${compactNumber(d.downloads ?? 0)} dl Â· ${compactNumber(d.likes ?? 0)} â™¥`,
    ageHours: d.lastModified
      ? Math.max(0, (Date.now() - Date.parse(d.lastModified)) / 3_600_000)
      : null,
    logoUrl: huggingFaceLogoUrl(),
    logoName: d.author ?? d.id,
  }));

  return { cards, topStories };
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
// Cold state
// ---------------------------------------------------------------------------

function ColdState() {
  return (
    <section
      className="p-8"
      style={{
        background: "var(--v4-bg-025)",
        border: "1px dashed var(--v4-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono text-lg font-bold uppercase tracking-[0.18em]"
        style={{ color: HF_ACCENT_BAR }}
      >
        {"// no data yet"}
      </h2>
      <p
        className="mt-3 max-w-xl text-sm"
        style={{ color: "var(--v4-ink-300)" }}
      >
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

