// /huggingface/trending — domain-scored Hugging Face model feed.
//
// Reads `huggingface-trending` Redis payload (populated by
// scripts/scrape-huggingface.mjs) through the new domain pipeline:
//   hfModelScorer.computeRaw() → computeCrossDomainMomentum() → top 100
//
// Mirrors /hackernews/trending visually: NewsTopHeaderV3 strip + a dense
// TerminalFeedTable below. ISR-cached at 30 min per project convention.

import {
  getHfModelsTrending,
  getHfTrendingFile,
  refreshHfModelsFromStore,
  type HfModelTrending,
} from "@/lib/huggingface";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import {
  applyCompactV1,
  compactNumber,
} from "@/components/news/newsTopMetrics";
import {
  TerminalFeedTable,
  type FeedColumn,
} from "@/components/feed/TerminalFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";

const HF_ACCENT = "rgba(255, 159, 28, 0.85)"; // HF "yellow" (warm orange)
const HF_ACCENT_BAR = "#FF9F1C";
const HF_LOGO = "https://huggingface.co/front/assets/huggingface_logo-noborder.svg";

export const dynamic = "force-static";
export const revalidate = 1800; // 30 min

function formatAgeIso(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const hours = Math.max(0, (nowMs - t) / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export default async function HuggingFaceTrendingPage() {
  await refreshHfModelsFromStore();
  const file = getHfTrendingFile();
  const models = getHfModelsTrending(100);
  const cold = (file.models ?? []).length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {cold ? (
          <ColdState />
        ) : (
          <>
            <div className="mb-6">
              <NewsTopHeaderV3
                routeTitle="HUGGINGFACE · TRENDING"
                liveLabel="LIVE · 30M"
                eyebrow="// HUGGINGFACE · MODELS"
                meta={[
                  { label: "TRACKED", value: (file.models?.length ?? 0).toLocaleString("en-US") },
                  { label: "TOP", value: String(models.length) },
                ]}
                {...buildHuggingFaceHeader(file.models ?? [], models)}
                accent={HF_ACCENT}
                caption={[
                  "// LAYOUT compact-v1",
                  "· DOMAIN hf-model",
                  "· SCORER weeklyDownloads + recency",
                ]}
              />
            </div>

            <HfModelFeed models={models} />
          </>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Header builder — local (mirrors patterns in components/news/newsTopMetrics)
// ---------------------------------------------------------------------------

function buildHuggingFaceHeader(
  raws: { downloads: number; likes: number; pipelineTag: string | null }[],
  scored: HfModelTrending[],
) {
  const totalDownloads = raws.reduce((s, m) => s + (m.downloads ?? 0), 0);
  const totalLikes = raws.reduce((s, m) => s + (m.likes ?? 0), 0);
  const topDownloads = raws.reduce((m, r) => Math.max(m, r.downloads ?? 0), 0);

  // Pipeline-tag distribution (top 6) — substitutes for "topics" panel.
  const tagCounts = new Map<string, number>();
  for (const r of raws) {
    const tag = r.pipelineTag ?? "untagged";
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
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

  // Top-momentum bars (top 6 model authors by appearance count).
  const authorCounts = new Map<string, number>();
  for (const r of raws) {
    const a = (r as { author?: string }).author ?? "unknown";
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
      logoUrl: `https://huggingface.co/${encodeURIComponent(author)}/avatar.png`,
      logoName: author,
    }));

  const cards = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${raws.length} MODELS`,
        label: "MODELS TRACKED",
        value: compactNumber(raws.length),
        hint: `${tagCounts.size} PIPELINE TAGS`,
        rows: [
          { label: "TOTAL DOWNLOADS", value: compactNumber(totalDownloads) },
          { label: "TOP DOWNLOADS", value: compactNumber(topDownloads), tone: "accent" },
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
        title: "// PIPELINE · TAG MIX",
        rightLabel: `TOP ${tagBars.length}`,
        bars: tagBars,
        labelWidth: 96,
        emptyText: "NO TAGS YET",
      },
    ],
    { totalItems: raws.length },
  );

  // Hero stories — top 3 models by momentum.
  const topStories = scored.slice(0, 3).map((m) => ({
    title: m.id,
    href: m.url,
    external: true,
    sourceCode: "HF",
    byline: m.pipelineTag ?? m.libraryName ?? undefined,
    scoreLabel: `${compactNumber(m.downloads ?? 0)} dl · ${compactNumber(m.likes ?? 0)} ♥`,
    ageHours: m.lastModified
      ? Math.max(0, (Date.now() - Date.parse(m.lastModified)) / 3_600_000)
      : null,
    logoUrl: `https://huggingface.co/${encodeURIComponent(m.author)}/avatar.png`,
    logoName: m.author ?? m.id,
  }));

  return { cards, topStories };
}

// ---------------------------------------------------------------------------
// Feed table
// ---------------------------------------------------------------------------

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
          style={{ color: i < 10 ? HF_ACCENT_BAR : "var(--v3-ink-400)" }}
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
            src={`https://huggingface.co/${encodeURIComponent(m.author)}/avatar.png`}
            name={m.author ?? m.id}
            size={20}
            shape="square"
            alt=""
          />
          <a
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-[13px] font-medium transition-colors hover:text-[color:var(--v3-acc)]"
            style={{ color: "var(--v3-ink-100)" }}
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
        if (!tag) return <span style={{ color: "var(--v3-ink-500)" }}>—</span>;
        return (
          <span
            className="v2-mono inline-block px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase"
            style={{
              border: "1px solid var(--v3-line-200)",
              background: "var(--v3-bg-100)",
              color: "var(--v3-ink-300)",
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
            color: (m.downloads ?? 0) >= 100_000 ? HF_ACCENT_BAR : "var(--v3-ink-100)",
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
          style={{ color: "var(--v3-ink-300)" }}
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
      render: (m) => <MomentumBar value={m.momentum} accent={HF_ACCENT_BAR} />,
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
          style={{ color: "var(--v3-ink-400)" }}
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
      accent={HF_ACCENT_BAR}
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
          background: "var(--v3-bg-100)",
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
        style={{ color: "var(--v3-ink-300)", width: 24, textAlign: "right" }}
      >
        {Math.round(pct)}
      </span>
    </div>
  );
}

// Suppress unused-import lint for HF_LOGO when Next tree-shakes it; kept
// here so the brand source-of-truth is documented even if not yet rendered.
void HF_LOGO;

// ---------------------------------------------------------------------------
// Cold state
// ---------------------------------------------------------------------------

function ColdState() {
  return (
    <section
      className="p-8"
      style={{
        background: "var(--v3-bg-025)",
        border: "1px dashed var(--v3-line-100)",
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
        style={{ color: "var(--v3-ink-300)" }}
      >
        The Hugging Face scraper hasn&apos;t run yet. Run{" "}
        <code style={{ color: "var(--v3-ink-100)" }}>
          npm run scrape:huggingface
        </code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v3-ink-100)" }}>
          data/huggingface-trending.json
        </code>
        , then refresh this page.
      </p>
    </section>
  );
}
