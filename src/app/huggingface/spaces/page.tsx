// /huggingface/spaces â€” domain-scored Hugging Face spaces feed.
//
// Reads `huggingface-spaces` Redis payload (populated by
// scripts/scrape-huggingface-spaces.mjs) through the new domain pipeline:
//   hfSpaceScorer.computeRaw() â†’ computeCrossDomainMomentum() â†’ top 100
//
// Mirrors /huggingface/trending visually: NewsTopHeaderV3 strip + a dense
// TerminalFeedTable below. ISR-cached at 30 min per project convention.

import {
  getHfSpacesTrending,
  getHfSpacesFile,
  refreshHfSpacesFromStore,
  type HfSpaceTrending,
} from "@/lib/hf-spaces";
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

export default async function HuggingFaceSpacesPage() {
  await refreshHfSpacesFromStore();
  const file = getHfSpacesFile();
  const spaces = getHfSpacesTrending(100);
  const cold = (file.spaces ?? []).length === 0;

  return (
    <SourceFeedTemplate
      cold={cold}
      coldState={<ColdState />}
      header={{
        routeTitle: "HUGGINGFACE - SPACES",
        liveLabel: "LIVE - 30M",
        eyebrow: "// HUGGINGFACE - SPACES",
        meta: [
          {
            label: "TRACKED",
            value: (file.spaces?.length ?? 0).toLocaleString("en-US"),
          },
          { label: "TOP", value: String(spaces.length) },
        ],
        ...buildHuggingFaceSpacesHeader(file.spaces ?? [], spaces),
        accent: HF_ACCENT,
        caption: [
          "// LAYOUT compact-v1",
          "- DOMAIN hf-space",
          "- SCORER modelCount + recency",
        ],
      }}
    >
      <HfSpaceFeed spaces={spaces} />
    </SourceFeedTemplate>
  );
}

// ---------------------------------------------------------------------------
// Header builder
// ---------------------------------------------------------------------------

function buildHuggingFaceSpacesHeader(
  raws: {
    likes: number;
    sdk: string | null;
    author: string;
    models: string[];
  }[],
  scored: HfSpaceTrending[],
) {
  const totalLikes = raws.reduce((s, x) => s + (x.likes ?? 0), 0);
  const topLikes = raws.reduce((m, r) => Math.max(m, r.likes ?? 0), 0);
  const totalModels = raws.reduce(
    (s, r) => s + (Array.isArray(r.models) ? r.models.length : 0),
    0,
  );

  // SDK distribution (top 6) â€” substitutes for "topics" panel.
  const sdkCounts = new Map<string, number>();
  for (const r of raws) {
    const sdk = r.sdk ?? "untagged";
    sdkCounts.set(sdk, (sdkCounts.get(sdk) ?? 0) + 1);
  }
  const sdkBars = Array.from(sdkCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([sdk, count], i) => ({
      label: sdk.toUpperCase(),
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
        rightLabel: `${raws.length} SPACES`,
        label: "SPACES TRACKED",
        value: compactNumber(raws.length),
        hint: `${sdkCounts.size} SDKS`,
        rows: [
          { label: "TOTAL LIKES", value: compactNumber(totalLikes) },
          {
            label: "TOP LIKES",
            value: compactNumber(topLikes),
            tone: "accent",
          },
          { label: "MODELS USED", value: compactNumber(totalModels) },
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
        title: "// SDK Â· MIX",
        rightLabel: `TOP ${sdkBars.length}`,
        bars: sdkBars,
        labelWidth: 96,
        emptyText: "NO SDKS YET",
      },
    ],
    { totalItems: raws.length },
  );

  // Hero stories â€” top 3 spaces by momentum.
  const topStories = scored.slice(0, 3).map((s) => ({
    title: s.id,
    href: s.url,
    external: true,
    sourceCode: "HF",
    byline: s.sdk ?? undefined,
    scoreLabel: `${compactNumber(s.likes ?? 0)} â™¥ Â· ${s.models.length} models`,
    ageHours: s.lastModified
      ? Math.max(0, (Date.now() - Date.parse(s.lastModified)) / 3_600_000)
      : null,
    logoUrl: huggingFaceLogoUrl(),
    logoName: s.author ?? s.id,
  }));

  return { cards, topStories };
}

// ---------------------------------------------------------------------------
// Feed table
// ---------------------------------------------------------------------------

function HfSpaceFeed({ spaces }: { spaces: HfSpaceTrending[] }) {
  const nowMs = Date.now();

  const columns: FeedColumn<HfSpaceTrending>[] = [
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
      header: "Space",
      render: (s) => (
        <div className="flex min-w-0 items-center gap-2">
          <EntityLogo
            src={huggingFaceLogoUrl()}
            name={s.author ?? s.id}
            size={20}
            shape="square"
            alt=""
          />
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-[13px] font-medium transition-colors hover:text-[color:var(--v4-acc)]"
            style={{ color: "var(--v4-ink-100)" }}
            title={s.id}
          >
            {s.id}
          </a>
        </div>
      ),
    },
    {
      id: "sdk",
      header: "SDK",
      width: "100px",
      hideBelow: "sm",
      render: (s) => {
        const sdk = s.sdk;
        if (!sdk) return <span style={{ color: "var(--v4-ink-500)" }}>â€”</span>;
        return (
          <span
            className="v2-mono inline-block px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase"
            style={{
              border: "1px solid var(--v4-line-200)",
              background: "var(--v4-bg-100)",
              color: "var(--v4-ink-300)",
              borderRadius: 2,
            }}
            title={sdk}
          >
            {sdk}
          </span>
        );
      },
    },
    {
      id: "models",
      header: "Models",
      width: "70px",
      align: "right",
      hideBelow: "sm",
      render: (s) => {
        const count = s.models?.length ?? 0;
        // Tooltip lists first 3 model IDs (when modelsUsed populated).
        // When Chunk D's join resolver lands, this list will rank by
        // each model's hf-model momentum so the most-impactful model
        // surfaces first.
        const tooltip =
          count === 0
            ? "no models declared"
            : s.models
                .slice(0, 3)
                .join("\n") + (count > 3 ? `\nâ€¦ +${count - 3} more` : "");
        return (
          <span
            className="font-mono text-[12px] tabular-nums"
            style={{
              color: count >= 3 ? HF_ACCENT_BAR : "var(--v4-ink-300)",
              cursor: count > 0 ? "help" : "default",
            }}
            title={tooltip}
          >
            {count}
          </span>
        );
      },
    },
    {
      id: "likes",
      header: "Likes",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (s) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-300)" }}
        >
          {compactNumber(s.likes ?? 0)}
        </span>
      ),
    },
    {
      id: "momentum",
      header: "Momentum",
      width: "120px",
      hideBelow: "md",
      render: (s) => <MomentumBar value={s.momentum} accent={HF_ACCENT_BAR} />,
    },
    {
      id: "age",
      header: "Age",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (s) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {formatAgeIso(s.lastModified ?? s.createdAt, nowMs)}
        </span>
      ),
    },
  ];

  return (
    <TerminalFeedTable
      rows={spaces}
      columns={columns}
      rowKey={(s) => s.id}
      accent={HF_ACCENT_BAR}
      caption="Hugging Face spaces ranked by domain-scored momentum"
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
        The Hugging Face spaces scraper hasn&apos;t run yet. Run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>
          node scripts/scrape-huggingface-spaces.mjs
        </code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>
          data/huggingface-spaces.json
        </code>
        , then refresh this page.
      </p>
    </section>
  );
}

