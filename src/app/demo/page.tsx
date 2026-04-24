// /demo — visual showcase for the new surfaces (ideas + predictions).
//
// Renders fake-but-realistic data so the designs can be reviewed
// without seeding the database, waiting on moderation, or having a
// tracked repo with live forecast inputs. Explicit "DEMO" banner so
// nobody mistakes these for real data.
//
// Real cards, mock data — the components themselves are production
// code (IdeaCard, the forecast-card styling mirrors PredictTool's
// ForecastCard). Click interactions route to real endpoints, so
// reacting on a demo card does persist — that's useful for seeing
// the loop end-to-end.

import Link from "next/link";
import type { Metadata } from "next";
import { FlaskConical, Lightbulb, LineChart, TrendingUp } from "lucide-react";

import type { PublicIdea } from "@/lib/ideas";
import type { ReactionCounts } from "@/lib/reactions-shape";
import { IdeaCard } from "@/components/ideas/IdeaCard";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: `Demo — ideas + predictions · ${SITE_NAME}`,
  description:
    "Design preview for the new idea cards and repo trajectory forecast cards. Uses mock data, real components.",
  alternates: { canonical: absoluteUrl("/demo") },
  robots: { index: false, follow: false },
};

export const dynamic = "force-static";

// ---------------------------------------------------------------------------
// Mock data — one idea per lifecycle stage + a few with varying reaction
// density so you see what low / high engagement looks like.
// ---------------------------------------------------------------------------

interface Demo {
  idea: PublicIdea;
  counts: ReactionCounts;
  caption: string;
}

const NOW = new Date("2026-04-24T12:00:00Z").toISOString();
const YESTERDAY = new Date("2026-04-23T09:00:00Z").toISOString();
const LAST_WEEK = new Date("2026-04-17T08:30:00Z").toISOString();
const TWO_WEEKS_AGO = new Date("2026-04-10T15:10:00Z").toISOString();

function mockIdea(partial: Partial<PublicIdea> & { id: string }): PublicIdea {
  return {
    id: partial.id,
    authorHandle: partial.authorHandle ?? "mirko",
    title: partial.title ?? "Untitled idea",
    pitch: partial.pitch ?? "A short pitch explaining why this matters.",
    body: partial.body ?? null,
    status: partial.status ?? "published",
    buildStatus: partial.buildStatus ?? "exploring",
    shippedRepoUrl: partial.shippedRepoUrl ?? null,
    targetRepos: partial.targetRepos ?? [],
    category: partial.category ?? null,
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? NOW,
    publishedAt: partial.publishedAt ?? NOW,
  };
}

const IDEA_DEMOS: Demo[] = [
  {
    caption: "Fresh idea · exploring · zero reactions",
    idea: mockIdea({
      id: "demo-fresh",
      authorHandle: "newauthor",
      title: "Paste any repo URL, get a Telegram daily-diff bot",
      pitch:
        "A one-line wrapper that turns any GitHub repo into a daily diff digest delivered to TG or WA. For forkers who want to know what landed upstream at breakfast.",
      buildStatus: "exploring",
      tags: ["bot", "github", "notifications"],
      createdAt: NOW,
      publishedAt: NOW,
    }),
    counts: { build: 0, use: 0, buy: 0, invest: 0 },
  },
  {
    caption:
      "Scoping · moderate build interest · one target repo · day-old",
    idea: mockIdea({
      id: "demo-scoping",
      authorHandle: "mirko",
      title: "Cross-repo compare with forecast overlay",
      pitch:
        "Pick 2-4 repos, see stars + momentum + 30d forecast bands on one chart. The shared x-axis makes the \"who's decelerating\" question obvious.",
      buildStatus: "scoping",
      targetRepos: ["vercel/next.js"],
      tags: ["charts", "compare", "ai"],
      createdAt: YESTERDAY,
      publishedAt: YESTERDAY,
    }),
    counts: { build: 14, use: 3, buy: 0, invest: 0 },
  },
  {
    caption: "Building · strong build+buy signal · multiple targets",
    idea: mockIdea({
      id: "demo-building",
      authorHandle: "starbuilder",
      title: "One-liner MCP wrapper for any GitHub repo",
      pitch:
        "Scaffolds an MCP server from a repo in one command. Agents get list/search/get tools over the repo's docs + code, zero config.",
      buildStatus: "building",
      targetRepos: ["anthropics/claude-code", "modelcontextprotocol/servers"],
      tags: ["mcp", "agents", "scaffolding"],
      createdAt: LAST_WEEK,
      publishedAt: LAST_WEEK,
    }),
    counts: { build: 67, use: 122, buy: 18, invest: 4 },
  },
  {
    caption: "Shipped · published two weeks ago · live repo link",
    idea: mockIdea({
      id: "demo-shipped",
      authorHandle: "shipper",
      title: "Trending-repo RSS with per-language filters",
      pitch:
        "Atom + RSS feeds of every breakout repo filtered by language. Drop-in for Feedly or any reader; no account needed.",
      buildStatus: "shipped",
      shippedRepoUrl: "https://github.com/shipper/trending-rss",
      targetRepos: [],
      tags: ["rss", "atom", "feed"],
      createdAt: TWO_WEEKS_AGO,
      publishedAt: TWO_WEEKS_AGO,
    }),
    counts: { build: 31, use: 84, buy: 12, invest: 2 },
  },
  {
    caption: "Investor-heavy · high commitment signal",
    idea: mockIdea({
      id: "demo-invest-heavy",
      authorHandle: "founder",
      title: "Pay-per-issue bounty board for OSS maintainers",
      pitch:
        "Submit an issue, set a bounty in USDC. Maintainer ships a fix, escrow releases. Cuts the middleman cost of existing bounty platforms by half.",
      buildStatus: "scoping",
      targetRepos: [],
      category: "devtools",
      tags: ["bounty", "payments", "stripe-connect"],
      createdAt: YESTERDAY,
      publishedAt: YESTERDAY,
    }),
    counts: { build: 23, use: 8, buy: 41, invest: 19 },
  },
];

// ---------------------------------------------------------------------------
// Mock prediction forecast cards — mirrors PredictTool's ForecastCard so
// the visual matches the /predict page one-for-one. No import from
// PredictTool because that component fetches live data via useEffect;
// we want static, reproducible cards here.
// ---------------------------------------------------------------------------

interface ForecastDemo {
  horizonDays: 7 | 30 | 90;
  currentStars: number;
  pointEstimate: number;
  lowP10: number;
  highP90: number;
  drivers: { label: string; detail: string; tone: "positive" | "negative" | "neutral" }[];
}

const FORECAST_DEMOS: ForecastDemo[] = [
  {
    horizonDays: 7,
    currentStars: 128_412,
    pointEstimate: 129_640,
    lowP10: 128_412,
    highP90: 130_122,
    drivers: [
      {
        label: "Accelerating",
        detail:
          "Recent daily growth (180/day) is 22% above the 30-day average.",
        tone: "positive",
      },
      {
        label: "Steady cadence",
        detail: "Daily growth is consistent (CV=0.35); narrow band.",
        tone: "positive",
      },
    ],
  },
  {
    horizonDays: 30,
    currentStars: 128_412,
    pointEstimate: 133_880,
    lowP10: 128_412,
    highP90: 137_451,
    drivers: [
      {
        label: "Baseline trajectory",
        detail:
          "Projecting current pace (180 stars/day) forward, damped for horizon.",
        tone: "neutral",
      },
    ],
  },
  {
    horizonDays: 90,
    currentStars: 128_412,
    pointEstimate: 141_280,
    lowP10: 128_412,
    highP90: 152_900,
    drivers: [
      {
        label: "High volatility",
        detail: "Daily growth varies a lot (CV=1.8); the band is wide.",
        tone: "neutral",
      },
    ],
  },
];

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function fmtSigned(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${fmtNumber(n)}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10">
        {/* Demo banner */}
        <div
          className="rounded-card border border-warning/60 bg-warning/10 px-4 py-3 text-xs text-warning inline-flex items-center gap-2"
          role="note"
        >
          <FlaskConical className="size-3.5" aria-hidden />
          <span>
            DEMO PAGE. Mock data, real components. Clicks on reactions DO
            persist to the local store.
          </span>
        </div>

        {/* Ideas section */}
        <section className="space-y-6">
          <header className="border-b border-border-primary pb-4">
            <h1 className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
              <Lightbulb className="size-5 text-warning" aria-hidden />
              Idea feed cards
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Each card is the real <code>&lt;IdeaCard&gt;</code> rendered on{" "}
              <Link href="/ideas" className="text-brand hover:underline">
                /ideas
              </Link>
              . The caption above each one tells you which state it shows.
            </p>
          </header>

          <ul className="space-y-8">
            {IDEA_DEMOS.map((demo) => (
              <li key={demo.idea.id} className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                  {demo.caption}
                </div>
                <IdeaCard
                  idea={demo.idea}
                  reactionCounts={demo.counts}
                  linkToDetail={false}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* Predictions section */}
        <section className="space-y-6">
          <header className="border-b border-border-primary pb-4">
            <h1 className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
              <LineChart className="size-5 text-brand" aria-hidden />
              Prediction forecast cards
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Three horizon cards for a hypothetical 128K-star repo.
              The real tool is at{" "}
              <Link href="/predict" className="text-brand hover:underline">
                /predict
              </Link>{" "}
              — enter any tracked repo to get live forecasts.
            </p>
          </header>

          <div className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-border-primary">
              <h2 className="font-mono text-base font-semibold text-text-primary">
                demo/repo-at-128k-stars
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                model: v1-velocity-extrapolation
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
              {FORECAST_DEMOS.map((f) => (
                <ForecastCardDemo key={f.horizonDays} forecast={f} />
              ))}
            </div>
          </div>
        </section>

        {/* Footer nav */}
        <footer className="border-t border-border-primary pt-6 text-xs text-text-tertiary">
          <p className="mb-2">Live surfaces:</p>
          <ul className="flex flex-wrap gap-3">
            <LinkPill href="/ideas" label="/ideas" />
            <LinkPill href="/predict" label="/predict" />
            <LinkPill href="/repo/vercel/next.js" label="/repo/vercel/next.js" />
            <LinkPill href="/breakouts" label="/breakouts" />
            <LinkPill href="/u/mirko" label="/u/mirko" />
            <LinkPill href="/portal" label="/portal (MCP manifest)" />
          </ul>
        </footer>
      </div>
    </main>
  );
}

function LinkPill({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-button border border-border-primary bg-bg-card px-3 py-1.5 font-mono text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-card-hover"
      >
        {label}
      </Link>
    </li>
  );
}

function ForecastCardDemo({ forecast }: { forecast: ForecastDemo }) {
  const delta = forecast.pointEstimate - forecast.currentStars;
  const deltaPct =
    forecast.currentStars > 0 ? (delta / forecast.currentStars) * 100 : 0;
  const bandWidth = forecast.highP90 - forecast.lowP10;
  return (
    <article className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-brand" aria-hidden />
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            +{forecast.horizonDays}d horizon
          </h3>
        </div>
        <span className="font-mono text-[10px] text-text-tertiary tabular-nums">
          band ±{fmtNumber(Math.round(bandWidth / 2))}
        </span>
      </header>

      <div>
        <div className="font-mono text-2xl font-semibold tabular-nums text-text-primary">
          {fmtNumber(forecast.pointEstimate)}
        </div>
        <div className="font-mono text-[11px] text-text-tertiary tabular-nums">
          from {fmtNumber(forecast.currentStars)} ·{" "}
          <span className={delta >= 0 ? "text-up" : "text-down"}>
            {fmtSigned(delta)} ({deltaPct.toFixed(1)}%)
          </span>
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          80% confidence
        </div>
        <div className="font-mono text-[11px] tabular-nums text-text-secondary">
          {fmtNumber(forecast.lowP10)} – {fmtNumber(forecast.highP90)}
        </div>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-border-primary">
        {forecast.drivers.map((d) => (
          <div key={d.label} className="text-[11px]">
            <span
              className={[
                "font-mono uppercase tracking-wider mr-2",
                d.tone === "positive"
                  ? "text-up"
                  : d.tone === "negative"
                    ? "text-down"
                    : "text-text-tertiary",
              ].join(" ")}
            >
              {d.label}
            </span>
            <span className="text-text-secondary">{d.detail}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

