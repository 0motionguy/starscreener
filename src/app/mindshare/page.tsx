// TrendingRepo — /mindshare
//
// Cross-source attention map ("mindshare"). Each bubble is one repo; size
// = crossSignalScore (sum of GitHub + Reddit + HN + Bluesky + dev.to firing
// components, range 0-5). The bubble's circumference is split into 5 arc
// segments — ONE PER CHANNEL — sized PROPORTIONALLY to that channel's share
// of 24h mention volume. Lit (bright + thick) when the channel is firing
// in the cross-signal model; dim + thin when not but still proportionally
// sized so the share reads at a glance.
//
// Reads as: "who is getting talked about, and where the chatter is coming
// from" — the canonical mindshare visualisation.
//
// Hover → per-channel breakdown tooltip. Click → /repo/{owner}/{name}.

import type { Metadata } from "next";

import { getDerivedRepos } from "@/lib/derived-repos";
import { packBubbles, type PackInput } from "@/lib/bubble-pack";
import {
  SITE_NAME,
  absoluteUrl,
  OG_COLORS,
} from "@/lib/seo";
import { ShareBar } from "@/components/share/ShareBar";
import { MindShareCanvas } from "@/components/mindshare/MindShareCanvas";
import {
  CHANNELS,
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  type BubbleRow,
  type Channel,
} from "@/components/mindshare/channels";
import type { Repo } from "@/lib/types";

// 30-min ISR — same cadence as homepage; underlying derived-repos changes
// only when the cron commits fresh data, so a tighter cache wastes bandwidth.
export const revalidate = 1800;

const TITLE = `MindShare — ${SITE_NAME}`;
const DESCRIPTION =
  "Who's getting talked about, and where. Cross-source attention map across GitHub, Reddit, Hacker News, Bluesky, and dev.to.";

const OG_IMAGE = absoluteUrl("/api/og/mindshare");

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
        alt: "TrendingRepo MindShare — cross-source attention map",
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

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 600;
const MIN_RADIUS = 20;
const MAX_RADIUS = 80;
const PACK_LIMIT = 60;

function selectMindShareRepos(repos: Repo[]): Repo[] {
  // Need at least 2 channels firing to count as cross-source attention —
  // a single channel is just that channel's noise, not mindshare.
  const eligible = repos.filter(
    (r) =>
      typeof r.crossSignalScore === "number" &&
      typeof r.channelsFiring === "number" &&
      r.channelsFiring >= 2 &&
      r.channelStatus,
  );
  eligible.sort(
    (a, b) => (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0),
  );
  return eligible.slice(0, PACK_LIMIT);
}

function buildBubbleRows(repos: Repo[]): BubbleRow[] {
  const inputs: PackInput[] = repos.map((r) => ({
    id: r.fullName,
    // Pack weight is non-linear in score — squaring spreads the top-of-list
    // visually so a 4.5 score reads ~2.5× a 2.0 score, instead of a flat
    // proportional pack where a 4.5 vs 2.0 is barely noticeable on screen.
    value: Math.max(0.1, (r.crossSignalScore ?? 0)) ** 2,
  }));
  const placed = packBubbles(inputs, {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    minRadius: MIN_RADIUS,
    maxRadius: MAX_RADIUS,
    padding: 4,
    fillRatio: 0.7,
    edgeMargin: 4,
  });
  const byId = new Map(placed.map((p) => [p.id, p]));
  const rows: BubbleRow[] = [];
  for (const r of repos) {
    const pack = byId.get(r.fullName);
    if (!pack) continue;
    const status = r.channelStatus ?? {
      github: false,
      reddit: false,
      hn: false,
      bluesky: false,
      devto: false,
      twitter: false,
    };
    // Map channelStatus -> our 5-channel display vocabulary (Twitter is in
    // the score but not in the 5-arc display per the page header copy).
    const firing: Record<Channel, boolean> = {
      github: status.github,
      reddit: status.reddit,
      hn: status.hn,
      bluesky: status.bluesky,
      devto: status.devto,
    };
    // Per-channel 24h mention counts for proportional arc sizing. Maps
    // mentions.perSource (which uses "hackernews") onto our display key
    // ("hn") so the canvas math matches the legend labels.
    const ps = r.mentions?.perSource;
    const shares: Record<Channel, number> = {
      github: ps?.github?.count24h ?? 0,
      reddit: ps?.reddit?.count24h ?? 0,
      hn: ps?.hackernews?.count24h ?? 0,
      bluesky: ps?.bluesky?.count24h ?? 0,
      devto: ps?.devto?.count24h ?? 0,
    };
    const totalShare = CHANNELS.reduce((acc, c) => acc + shares[c], 0);
    const [owner, name] = r.fullName.split("/");
    rows.push({
      id: r.fullName,
      fullName: r.fullName,
      shortName: name ?? r.fullName,
      owner: owner ?? "",
      name: name ?? "",
      score: r.crossSignalScore ?? 0,
      firing,
      shares,
      totalShare,
      pack,
    });
  }
  return rows;
}

export default function MindSharePage() {
  const repos = getDerivedRepos();
  const selected = selectMindShareRepos(repos);
  const rows = buildBubbleRows(selected);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <header className="mb-4">
        <h1 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
          {"// MINDSHARE · CROSS-SOURCE ATTENTION"}
        </h1>
        <p className="mt-2 text-sm text-text-secondary max-w-3xl">
          Who&rsquo;s getting talked about, and where. Bubble size = total
          channels firing × strength. Each bubble splits into five arcs sized
          by that channel&rsquo;s share of 24h mentions: GitHub · Reddit ·
          Hacker News · Bluesky · dev.to. Lit arcs = active chatter on that
          channel right now. Hover for breakdown · click to open repo.
        </p>
      </header>

      <ChannelLegend />

      <div className="rounded-card border border-border-primary bg-bg-secondary p-2 sm:p-3">
        <div className="overflow-hidden">
          <MindShareCanvas
            rows={rows}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            bgColor={OG_COLORS.bg}
            bgTertiary={OG_COLORS.bgTertiary}
            borderColor={OG_COLORS.border}
            textPrimaryColor={OG_COLORS.textPrimary}
            textTertiaryColor={OG_COLORS.textTertiary}
          />
        </div>
      </div>

      {rows.length === 0 && (
        <div className="mt-6 rounded-card border border-border-primary bg-bg-secondary px-4 py-6 text-sm text-text-tertiary text-center font-mono">
          {"// no repos firing on 2+ channels right now — check back after the next scrape"}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          {/* ShareBar wired with the top repo IDs so Copy Link / Share-on-X
              carry the exact set captured in the bubble field. CSV omitted
              for the v1 — there's no per-day series here, just current
              snapshot scores; the markdown / iframe / PNG / SVG embeds
              are the meaningful share surfaces. */}
          <ShareBar
            state={{
              repos: rows.slice(0, 4).map((r) => r.fullName),
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
      {CHANNELS.map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: CHANNEL_COLORS[c] }}
          />
          <span>{CHANNEL_LABELS[c]}</span>
        </span>
      ))}
    </div>
  );
}
