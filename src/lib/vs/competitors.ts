// /vs — competitor data file
//
// Drives the /vs/<competitor> comparison pages and the /vs index.
//
// Evidence trail
// --------------
// Every checkbox in this file traces back to the v3 competitor deep-crawl
// deltas captured on 2026-06-15 against ossinsight.io and trendshift.io
// (toolbox PR #241,
// `scripts/competitor-deep-crawl/out/2026-06-15T07-19-30-206Z/deltas.md`).
//
// Honesty rules:
//   - Only mark `'yes'` when the competitor *visibly* ships the feature.
//   - Mark `'partial'` when something is close-but-not-quite (e.g. we cover
//     11+ sources incl. Bilibili / XHS, TrendShift covers GitHub + 3 social).
//   - Mark `'no'` when the deltas captured an explicit absence
//     ("No public API or programmatic access", etc.).
//   - Mark `'unknown'` when the crawl couldn't confirm either way; render
//     this as `—` rather than guessing.
//
// Adding a new competitor:
//   1. Add a slug to `COMPETITORS`.
//   2. Add the full row set + panels below.
//   3. The dynamic route at /vs/[competitor]/page.tsx picks the new slug up
//      via generateStaticParams().
//   4. Add the new path to `src/app/sitemap-pages.xml/route.ts`.

export type CellStatus = "yes" | "no" | "partial" | "unknown";

export interface MatrixCell {
  /** ✓ / ✗ / partial / — */
  status: CellStatus;
  /** Inline note rendered under the status token. Short — one phrase. */
  note?: string;
}

export interface MatrixRow {
  /** Stable id used as React key. */
  id: string;
  /** Row label rendered in the leftmost column. */
  label: string;
  /** One-line "what this is" for screen readers + the mobile card variant. */
  description?: string;
  trendingrepo: MatrixCell;
  competitor: MatrixCell;
}

export interface WhyItMatters {
  /** Short heading rendered above the body copy. */
  title: string;
  /** Body — one paragraph. Plain text, no markdown. */
  body: string;
  /** Optional internal link to the proof page. */
  href?: string;
  /** Optional inline link label. */
  hrefLabel?: string;
}

export interface CompetitorProfile {
  /** URL slug (also used as `params.competitor`). */
  slug: string;
  /** Display name as it appears in headings + meta. */
  displayName: string;
  /** Their canonical homepage — used in the lede + the JSON-LD. */
  homepage: string;
  /** Short tag rendered in the crumb (e.g. "OSS-INSIGHT"). */
  crumbTag: string;
  /** SEO title (page-specific). */
  metaTitle: string;
  /** SEO description (page-specific). */
  metaDescription: string;
  /** TL;DR — one sentence summary at the top of the page. */
  tldr: string;
  /** 10-row feature matrix. */
  rows: MatrixRow[];
  /** Three "why this matters" panels rendered under the matrix. */
  whyItMatters: WhyItMatters[];
}

const evidenceUrl =
  "https://github.com/0motionguy/toolbox/pull/241";

// -----------------------------------------------------------------------------
// OSSInsight — github-only deep history product backed by TiDB Cloud.
// Crawl found: 10B+ GitHub events since 2011, 102 collections, no API/webhook,
// no pricing tier, list/table views only.
// -----------------------------------------------------------------------------

const OSSINSIGHT: CompetitorProfile = {
  slug: "ossinsight",
  displayName: "OSSInsight",
  homepage: "https://ossinsight.io",
  crumbTag: "OSS-INSIGHT",
  metaTitle:
    "TrendingRepo vs OSSInsight — 11-source OSS intelligence with monetization signals",
  metaDescription:
    "Side-by-side: OSSInsight indexes GitHub events; TrendingRepo cross-checks 11+ sources, ships webhooks + Slack, and surfaces revenue, funding, and pricing signals OSSInsight doesn't track.",
  tldr:
    "OSSInsight is GitHub-only analytics with a decade of historical depth. TrendingRepo cross-references 11+ sources and ships the API + webhook surface OSSInsight doesn't have.",
  rows: [
    {
      id: "data-sources",
      label: "Data sources",
      description: "How many signal feeds the product ingests.",
      trendingrepo: {
        status: "yes",
        note: "11+ — GitHub, HN, X, Bluesky, ProductHunt, Dev.to, arXiv, Hugging Face, npm, Bilibili, XHS.",
      },
      competitor: {
        status: "partial",
        note: "GitHub event firehose only — exceptional depth, single surface.",
      },
    },
    {
      id: "refresh",
      label: "Refresh cadence",
      description: "How fast new signal lands on the front page.",
      trendingrepo: {
        status: "yes",
        note: "Trending pipeline every 20 min; per-source crons 6–24h.",
      },
      competitor: {
        status: "partial",
        note: "GitHub events ingested continuously; dashboards refresh on query.",
      },
    },
    {
      id: "taxonomy",
      label: "Taxonomy / categories",
      description: "Curated buckets the product slices its data into.",
      trendingrepo: {
        status: "partial",
        note: "32-axis classifier + 15 hub categories (smaller breadth, deeper signal).",
      },
      competitor: {
        status: "yes",
        note: "102 curated technology collections.",
      },
    },
    {
      id: "api",
      label: "Public REST API",
      description: "Programmatic access for agents and scripts.",
      trendingrepo: {
        status: "yes",
        note: "REST + MCP server; documented under /docs.",
      },
      competitor: {
        status: "no",
        note: "No documented public API surface.",
      },
    },
    {
      id: "webhooks",
      label: "Webhooks + Slack",
      description: "Push notifications when something crosses a threshold.",
      trendingrepo: {
        status: "yes",
        note: "Webhook targets + native Slack integration, alerts engine.",
      },
      competitor: {
        status: "no",
        note: "No webhooks, RSS, or programmatic notifications.",
      },
    },
    {
      id: "treemap",
      label: "Interactive treemap",
      description: "Visual share-of-attention view.",
      trendingrepo: {
        status: "yes",
        note: "/tools/treemap — drillable, exportable.",
      },
      competitor: {
        status: "no",
        note: "List and table views only.",
      },
    },
    {
      id: "revenue",
      label: "Revenue estimate",
      description: "Per-repo / per-project revenue radar.",
      trendingrepo: {
        status: "yes",
        note: "/revenue — estimated MRR per repo with confidence band.",
      },
      competitor: {
        status: "no",
        note: "Not tracked.",
      },
    },
    {
      id: "funding",
      label: "Funding / MRR radar",
      description: "Tracks rounds and reported MRR on indexed repos.",
      trendingrepo: {
        status: "yes",
        note: "/funding — rounds + announcements stitched to repos.",
      },
      competitor: {
        status: "no",
        note: "Not tracked.",
      },
    },
    {
      id: "digest",
      label: "Email digest",
      description: "Periodic emailed summary of moves.",
      trendingrepo: {
        status: "yes",
        note: "Weekly digest (Pro tier).",
      },
      competitor: {
        status: "no",
        note: "No subscription digest surface found.",
      },
    },
    {
      id: "pricing",
      label: "Public pricing",
      description: "Stated price for individual access.",
      trendingrepo: {
        status: "yes",
        note: "Free + $6.50/mo Pro entry tier, /pricing.",
      },
      competitor: {
        status: "no",
        note: "No visible pricing or self-serve plan.",
      },
    },
  ],
  whyItMatters: [
    {
      title: "Cross-source consensus beats single-source depth",
      body: "OSSInsight's GitHub-only firehose tells you what a single network thinks. An eleven-source consensus catches the moment a repo trends on Hacker News, gets picked up on Bilibili, and crosses 100 stars in the same six hours — a story no GitHub-only product can tell.",
      href: "/methodology",
      hrefLabel: "How the scoring works",
    },
    {
      title: "Webhooks turn analytics into automation",
      body: "OSSInsight is a dashboard you visit. TrendingRepo is a dashboard plus a webhook that fires into Slack when your watchlist moves. Once a signal can land in your team channel without a human checking a tab, the product becomes part of the workflow.",
      href: "/alerts",
      hrefLabel: "Set up alerts",
    },
    {
      title: "Monetization signals are part of the trend",
      body: "Knowing a repo is trending isn't enough — you also want to know whether it has revenue, who funded it, and how it's priced. TrendingRepo tracks revenue, funding, and pricing alongside the activity signal. OSSInsight intentionally stays on the activity side of the line.",
      href: "/revenue",
      hrefLabel: "Open the revenue radar",
    },
  ],
};

// -----------------------------------------------------------------------------
// TrendShift — repo trend radar with a small social signal layer.
// Crawl found: GitHub + ~3 social sources, no programmatic surface, sponsor
// slots as monetization, no treemap, no public revenue or funding view.
// -----------------------------------------------------------------------------

const TRENDSHIFT: CompetitorProfile = {
  slug: "trendshift",
  displayName: "TrendShift",
  homepage: "https://trendshift.io",
  crumbTag: "TRENDSHIFT",
  metaTitle:
    "TrendingRepo vs TrendShift — 11-source OSS intelligence with monetization signals",
  metaDescription:
    "Side-by-side: TrendShift watches GitHub + a few socials; TrendingRepo cross-checks 11+ sources, ships an API + webhooks + Slack, and surfaces revenue, funding, and pricing signals TrendShift doesn't.",
  tldr:
    "TrendShift watches GitHub plus a small social layer. TrendingRepo cross-references 11+ sources, exposes a REST + MCP API, and adds revenue and funding context.",
  rows: [
    {
      id: "data-sources",
      label: "Data sources",
      description: "How many signal feeds the product ingests.",
      trendingrepo: {
        status: "yes",
        note: "11+ — GitHub, HN, X, Bluesky, ProductHunt, Dev.to, arXiv, Hugging Face, npm, Bilibili, XHS.",
      },
      competitor: {
        status: "partial",
        note: "GitHub + 3 social sources (X, Reddit, HN); no Bilibili / XHS / arXiv / HF coverage.",
      },
    },
    {
      id: "refresh",
      label: "Refresh cadence",
      description: "How fast new signal lands on the front page.",
      trendingrepo: {
        status: "yes",
        note: "Trending pipeline every 20 min; per-source crons 6–24h.",
      },
      competitor: {
        status: "partial",
        note: "Daily / hourly refresh on top-level boards.",
      },
    },
    {
      id: "taxonomy",
      label: "Taxonomy / categories",
      description: "Curated buckets the product slices its data into.",
      trendingrepo: {
        status: "yes",
        note: "32-axis classifier + 15 hub categories.",
      },
      competitor: {
        status: "partial",
        note: "Topic tags lifted from GitHub; no curated category hubs.",
      },
    },
    {
      id: "api",
      label: "Public REST API",
      description: "Programmatic access for agents and scripts.",
      trendingrepo: {
        status: "yes",
        note: "REST + MCP server; documented under /docs.",
      },
      competitor: {
        status: "no",
        note: "No documented public API surface.",
      },
    },
    {
      id: "webhooks",
      label: "Webhooks + Slack",
      description: "Push notifications when something crosses a threshold.",
      trendingrepo: {
        status: "yes",
        note: "Webhook targets + native Slack integration, alerts engine.",
      },
      competitor: {
        status: "no",
        note: "No webhooks, RSS, or programmatic notifications.",
      },
    },
    {
      id: "treemap",
      label: "Interactive treemap",
      description: "Visual share-of-attention view.",
      trendingrepo: {
        status: "yes",
        note: "/tools/treemap — drillable, exportable.",
      },
      competitor: {
        status: "no",
        note: "Ranked list views only.",
      },
    },
    {
      id: "revenue",
      label: "Revenue estimate",
      description: "Per-repo / per-project revenue radar.",
      trendingrepo: {
        status: "yes",
        note: "/revenue — estimated MRR per repo with confidence band.",
      },
      competitor: {
        status: "no",
        note: "Not tracked.",
      },
    },
    {
      id: "funding",
      label: "Funding / MRR radar",
      description: "Tracks rounds and reported MRR on indexed repos.",
      trendingrepo: {
        status: "yes",
        note: "/funding — rounds + announcements stitched to repos.",
      },
      competitor: {
        status: "no",
        note: "Not tracked.",
      },
    },
    {
      id: "digest",
      label: "Email digest",
      description: "Periodic emailed summary of moves.",
      trendingrepo: {
        status: "yes",
        note: "Weekly digest (Pro tier).",
      },
      competitor: {
        status: "partial",
        note: "Newsletter / mailing list surface; cadence not stated.",
      },
    },
    {
      id: "pricing",
      label: "Public pricing",
      description: "Stated price for individual access.",
      trendingrepo: {
        status: "yes",
        note: "Free + $6.50/mo Pro entry tier, /pricing.",
      },
      competitor: {
        status: "no",
        note: "Sponsor slots only; no self-serve plan published.",
      },
    },
  ],
  whyItMatters: [
    {
      title: "Eleven sources catch what four can't",
      body: "TrendShift watches GitHub plus a handful of socials. A repo that breaks first on Bilibili or XHS, gets cited in an arXiv paper, then surfaces on Hacker News three days later, is a story you only see when those upstream sources are part of the same index. TrendingRepo wires all of them into a single consensus score.",
      href: "/methodology",
      hrefLabel: "How the scoring works",
    },
    {
      title: "An API turns the index into an agent feed",
      body: "TrendShift is a site you visit. TrendingRepo exposes the exact same data over a REST API and an MCP server, so a Claude or Codex agent can pull a live list of breakouts and act on it. The radar is more valuable when the agent can read it.",
      href: "/docs",
      hrefLabel: "Read the API docs",
    },
    {
      title: "Pricing + revenue context is the moat",
      body: "TrendShift relies on sponsor slots for revenue and doesn't publish a self-serve plan. TrendingRepo ships a $6.50/mo entry tier and surfaces per-repo revenue + funding context. Together those make the product useful to operators who care about monetization, not just stars.",
      href: "/pricing",
      hrefLabel: "See the pricing tiers",
    },
  ],
};

// -----------------------------------------------------------------------------
// Registry
// -----------------------------------------------------------------------------

export const COMPETITORS: ReadonlyArray<CompetitorProfile> = [
  OSSINSIGHT,
  TRENDSHIFT,
];

export function getCompetitor(slug: string): CompetitorProfile | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}

/** Canonical evidence link used in the page footer + JSON-LD. */
export const EVIDENCE_URL = evidenceUrl;
