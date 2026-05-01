// /huggingface/spaces — V4 SourceFeedTemplate consumer.
//
// Reads `huggingface-spaces` Redis payload (populated by
// scripts/scrape-huggingface-spaces.mjs) through the domain pipeline:
//   hfSpaceScorer.computeRaw() → computeCrossDomainMomentum() → top 100
//
// Mirrors /hackernews/trending visually: V4 PageHead + KpiBand snapshot
// + TerminalFeedTable list slot. ISR-cached at 30 min per project
// convention.

import {
  getHfSpacesTrending,
  getHfSpacesFile,
  refreshHfSpacesFromStore,
  type HfSpaceTrending,
} from "@/lib/hf-spaces";
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

const HF_YELLOW = "#FFD21E";

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

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

export default async function HuggingFaceSpacesPage() {
  await refreshHfSpacesFromStore();
  const file = getHfSpacesFile();
  const spaces = getHfSpacesTrending(100);
  const allSpaces = file.spaces ?? [];
  const cold = allSpaces.length === 0;

  if (cold) {
    return (
      <main className="home-surface">
        <SourceFeedTemplate
          crumb={
            <>
              <b>HF</b> · TERMINAL · /HUGGINGFACE/SPACES
            </>
          }
          title="Hugging Face · spaces"
          lede="Trending spaces ranked by domain-scored momentum: likes velocity, model count, and recency. Cross-domain join surfaces the most-impactful underlying models."
        />
        <ColdState />
      </main>
    );
  }

  const nowMs = Date.now();
  const topLikes = allSpaces.reduce((m, s) => Math.max(m, s.likes ?? 0), 0);
  const sevenDaysMs = 7 * 24 * 3_600_000;
  const newThisWeek = allSpaces.filter((s) => {
    const created = s.createdAt ? Date.parse(s.createdAt) : NaN;
    return Number.isFinite(created) && nowMs - created <= sevenDaysMs;
  }).length;
  const gradioStreamlit = allSpaces.filter((s) => {
    const sdk = (s.sdk ?? "").toLowerCase();
    return sdk === "gradio" || sdk === "streamlit";
  }).length;

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>HF</b> · TERMINAL · /HUGGINGFACE/SPACES
          </>
        }
        title="Hugging Face · spaces"
        lede="Trending spaces ranked by domain-scored momentum: likes velocity, model count, and recency. Cross-domain join surfaces the most-impactful underlying models."
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
                label: "SPACES",
                value: allSpaces.length.toLocaleString("en-US"),
                sub: "tracked",
                pip: HF_YELLOW,
              },
              {
                label: "TOP LIKES",
                value: topLikes.toLocaleString("en-US"),
                sub: "engagement peak",
                tone: "acc",
                pip: "var(--v4-acc)",
              },
              {
                label: "NEW THIS WEEK",
                value: newThisWeek.toLocaleString("en-US"),
                sub: "created · 7d",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "GRADIO/STREAMLIT",
                value: gradioStreamlit.toLocaleString("en-US"),
                sub: "sdk count",
                pip: "var(--v4-blue)",
              },
            ]}
          />
        }
        listEyebrow="Space feed · top 100 by momentum"
        list={<HfSpaceFeed spaces={spaces} />}
      />
    </main>
  );
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
          style={{ color: i < 10 ? HF_YELLOW : "var(--v4-ink-400)" }}
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
        if (!sdk) return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
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
        const tooltip =
          count === 0
            ? "no models declared"
            : s.models
                .slice(0, 3)
                .join("\n") + (count > 3 ? `\n… +${count - 3} more` : "");
        return (
          <span
            className="font-mono text-[12px] tabular-nums"
            style={{
              color: count >= 3 ? HF_YELLOW : "var(--v4-ink-300)",
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
          {(s.likes ?? 0).toLocaleString("en-US")}
        </span>
      ),
    },
    {
      id: "momentum",
      header: "Momentum",
      width: "120px",
      hideBelow: "md",
      render: (s) => <MomentumBar value={s.momentum} accent={HF_YELLOW} />,
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
      accent={HF_YELLOW}
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
      <p
        style={{
          marginTop: 12,
          maxWidth: "32rem",
          fontSize: 13,
          color: "var(--v4-ink-300)",
        }}
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
