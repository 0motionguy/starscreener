import type { Metadata } from "next";

import { ShareBar } from "@/components/share/ShareBar";
import {
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  CHANNELS,
  type Channel,
} from "@/components/mindshare/channels";
import {
  MindshareTreemap,
  type MindshareTreemapRow,
  type MindshareWindow,
} from "@/components/mindshare/MindshareTreemap";
import { getDerivedRepos } from "@/lib/derived-repos";
import { SITE_NAME, absoluteUrl } from "@/lib/seo";
import type { Repo } from "@/lib/types";

export const revalidate = 1800;

const TITLE = `MindShare - ${SITE_NAME}`;
const DESCRIPTION =
  "Kaito-style AI repo mindshare treemap with period tabs, filters, and top gainers/losers.";
const OG_IMAGE = absoluteUrl("/api/og/mindshare");
const MAP_LIMIT = 140;

const AI_CATEGORY_IDS = new Set<string>(["ai-ml", "ai-agents", "mcp", "local-llm", "ml-frameworks", "speech-ai"]);

const AI_TOPIC_TOKENS = ["ai", "ml", "llm", "agent", "gpt", "rag", "mcp", "model"];

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/mindshare") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/mindshare"),
    title: TITLE,
    description: DESCRIPTION,
    siteName: SITE_NAME,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 675,
        alt: "TrendingRepo mindshare treemap",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

function isAiRepo(repo: Repo): boolean {
  if (AI_CATEGORY_IDS.has(repo.categoryId)) return true;
  const topicBlob = (repo.topics ?? []).join(" ").toLowerCase();
  return AI_TOPIC_TOKENS.some((token) => topicBlob.includes(token));
}

function selectMindshareRepos(repos: Repo[]): Repo[] {
  const eligible = repos.filter(
    (repo) =>
      isAiRepo(repo) &&
      typeof repo.crossSignalScore === "number" &&
      typeof repo.channelsFiring === "number" &&
      repo.channelsFiring >= 1,
  );

  eligible.sort((a, b) => {
    const scoreA = (a.crossSignalScore ?? 0) + Math.log1p(a.mentionCount24h ?? 0) + Math.log1p(Math.max(0, a.starsDelta24h));
    const scoreB = (b.crossSignalScore ?? 0) + Math.log1p(b.mentionCount24h ?? 0) + Math.log1p(Math.max(0, b.starsDelta24h));
    return scoreB - scoreA;
  });

  return eligible.slice(0, MAP_LIMIT);
}

function dominantChannel(shares: Record<Channel, number>): Channel {
  let winner: Channel = "github";
  let winnerValue = -1;

  for (const channel of CHANNELS) {
    const value = shares[channel];
    if (value > winnerValue) {
      winner = channel;
      winnerValue = value;
    }
  }

  return winner;
}

function sparklineDelta(values: number[], days: number, fallback = 0): number {
  if (values.length <= days) return fallback;
  const last = values[values.length - 1] ?? 0;
  const first = values[values.length - 1 - days] ?? last;
  return Math.round(last - first);
}

function periodDeltas(repo: Repo): Record<MindshareWindow, number> {
  const spark = Array.isArray(repo.sparklineData) ? repo.sparklineData : [];
  const d24 = repo.starsDelta24h ?? sparklineDelta(spark, 1, 0);
  const d48 = sparklineDelta(spark, 2, d24 * 2);
  const d7 = repo.starsDelta7d ?? sparklineDelta(spark, 7, d24 * 7);
  const d30 = repo.starsDelta30d ?? sparklineDelta(spark, 30, d7 * 4);

  return {
    "24h": d24,
    "48h": d48,
    "7d": d7,
    "30d": d30,
    "3m": Math.round(d30 * 3),
    "6m": Math.round(d30 * 6),
    "12m": Math.round(d30 * 12),
  };
}

function periodMentions(repo: Repo): Record<MindshareWindow, number> {
  const m24 = repo.mentionCount24h ?? 0;
  const m7 = repo.mentions?.total7d ?? m24 * 7;
  return {
    "24h": m24,
    "48h": m24 * 2,
    "7d": m7,
    "30d": m7 * 4,
    "3m": m7 * 12,
    "6m": m7 * 24,
    "12m": m7 * 48,
  };
}

function ecosystemLabel(repo: Repo): string {
  const t = (repo.topics ?? []).map((topic) => topic.toLowerCase());
  if (t.some((topic) => topic.includes("python"))) return "python";
  if (t.some((topic) => topic.includes("typescript") || topic.includes("javascript"))) return "javascript";
  if (t.some((topic) => topic.includes("rust"))) return "rust";
  if (t.some((topic) => topic.includes("go"))) return "go";
  return (repo.language ?? "other").toLowerCase();
}

function toTreemapRows(repos: Repo[]): MindshareTreemapRow[] {
  return repos.map((repo) => {
    const perSource = repo.mentions?.perSource;
    const shares: Record<Channel, number> = {
      github: perSource?.github?.count24h ?? 0,
      reddit: perSource?.reddit?.count24h ?? 0,
      hn: perSource?.hackernews?.count24h ?? 0,
      bluesky: perSource?.bluesky?.count24h ?? 0,
      devto: perSource?.devto?.count24h ?? 0,
    };
    const [owner, name] = repo.fullName.split("/");

    return {
      id: repo.fullName,
      fullName: repo.fullName,
      shortName: name ?? repo.fullName,
      owner: owner ?? "",
      name: name ?? "",
      score: repo.crossSignalScore ?? 0,
      starsDelta24h: repo.starsDelta24h ?? 0,
      mentionCount24h: repo.mentionCount24h ?? 0,
      channelsFiring: repo.channelsFiring ?? 0,
      dominantChannel: dominantChannel(shares),
      shares,
      categoryId: repo.categoryId ?? "other",
      ecosystem: ecosystemLabel(repo),
      sparkline: repo.sparklineData ?? [],
      periodDelta: periodDeltas(repo),
      periodMentions: periodMentions(repo),
    };
  });
}

export default function MindSharePage() {
  const repos = getDerivedRepos();
  const selected = selectMindshareRepos(repos);
  const rows = toTreemapRows(selected);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
          {"// MINDSHARE · AI REPO TREEMAP"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-text-secondary">
          Kaito-style market map for tracked AI repositories. Area follows cross-source mindshare,
          color follows selected-window delta, and side rails surface top gainers and losers.
        </p>
      </header>

      <ChannelLegend />

      <div className="rounded-card border border-border-primary bg-bg-secondary p-2 sm:p-3">
        <MindshareTreemap rows={rows} />
      </div>

      {rows.length === 0 && (
        <div className="mt-6 rounded-card border border-border-primary bg-bg-secondary px-4 py-6 text-center font-mono text-sm text-text-tertiary">
          {"// no AI repos with active signal right now - check back after the next scrape"}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          <ShareBar
            state={{
              repos: rows.slice(0, 4).map((row) => row.fullName),
              mode: "date",
              scale: "lin",
              legend: "tr",
            }}
            pagePath="/mindshare"
            imageEndpoint="/api/og/mindshare"
            hideCsv
          />
        </div>
      )}
    </main>
  );
}

function ChannelLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
      {CHANNELS.map((channel) => (
        <span key={channel} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: CHANNEL_COLORS[channel] }}
          />
          <span>{CHANNEL_LABELS[channel]}</span>
        </span>
      ))}
    </div>
  );
}
