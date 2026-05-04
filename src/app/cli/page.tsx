// TrendingRepo — /cli docs
//
// Static docs page for the `ss` CLI (bin/ss.mjs). Lists the real command
// set extracted from the binary so drift against the help text is
// obvious in review. Pure server component — no interactive state so
// we render a single flat tree and let the document-title metadata
// handle tab naming.

import type { Metadata } from "next";
import { getDerivedRepos } from "@/lib/derived-repos";
import { lastFetchedAt } from "@/lib/trending";
import { trendScoreForTimeRange } from "@/lib/filters";
import { getRelativeTime } from "@/lib/utils";
import { formatTrendingSession } from "@/lib/cli-table-format.mjs";

// ISR: the rendered transcript is computed from the same in-memory derived
// Repo[] cache the homepage uses. Match the homepage's 30-min revalidate so
// /cli never claims to be more current than what the rest of the site is
// serving — and so the "last refresh" stamp under the <pre> stays honest.
export const revalidate = 1800;

export const metadata: Metadata = {
  // Layout template at app/layout.tsx:65 appends ` — TrendingRepo`. Drop
  // the manual suffix to avoid double-brand "CLI — TrendingRepo —
  // TrendingRepo" (Google quality signal failure).
  title: "CLI",
  description:
    "Zero-dependency terminal client for TrendingRepo. Tail trending, tail the live stream, pipe JSON through jq — AI-repo trending without opening a browser.",
  alternates: { canonical: "/cli" },
  openGraph: {
    title: "TrendingRepo CLI — terminal client for AI-repo trending",
    description:
      "Zero-dependency CLI (Node 18+). `npx trendingrepo` to tail trending, breakouts, and live signals from your terminal.",
    url: "/cli",
    type: "website",
  },
};

interface CliCommand {
  cmd: string;
  desc: string;
}

// Mirrors the COMMANDS table in bin/ss.mjs. Keep in sync when adding a
// new command there.
const CLI_COMMANDS: CliCommand[] = [
  {
    cmd: "ss trending [--window=24h|7d|30d] [--limit=20]",
    desc: "Top movers for a time window. Default: 7d.",
  },
  {
    cmd: "ss breakouts [--limit=20]",
    desc: "Repos currently flagged as breakouts by the classifier.",
  },
  {
    cmd: "ss new [--limit=20]",
    desc: "Repos created in the last 30 days.",
  },
  {
    cmd: "ss search <query> [--limit=10]",
    desc: "Full-text search over name, description, and topics.",
  },
  {
    cmd: "ss repo <owner/name>",
    desc: "Detailed view of one repo — stars, deltas, momentum, release.",
  },
  {
    cmd: "ss compare <a/b> <c/d> [...]",
    desc: "Side-by-side comparison of stars, forks, deltas, momentum.",
  },
  {
    cmd: "ss categories",
    desc: "List of categories with repo counts and average momentum.",
  },
  {
    cmd: "ss stream [--types=...]",
    desc: "Tail the live SSE event stream — rank changes, breakouts, alerts.",
  },
];

// Live prod endpoint — the CLI reads TRENDINGREPO_API_URL (legacy
// STARSCREENER_API_URL also accepted), so a one-line export gets you real
// data immediately. Portal v0.1 /portal + /portal/call run against the
// same base.
const LIVE_BASE = "https://trendingrepo.com";

const INSTALL_LIVE = `# Pipe straight from the live deployment
npx github:0motionguy/starscreener \\
  trending --window=24h --limit=10

# Or export the API base and keep the command short across a session
export TRENDINGREPO_API_URL=${LIVE_BASE}
# (legacy STARSCREENER_API_URL also accepted)
npx github:0motionguy/starscreener trending --limit=5`;

const INSTALL_DEV = `# From a local checkout against npm run dev
npm run cli:dev -- trending --window=24h --limit=10

# Or run the bin directly
TRENDINGREPO_API_URL=${LIVE_BASE} node bin/ss.mjs trending`;

const PORTAL_CLI = `# Spec-native Portal v0.1 visitor CLI — works against /portal
# on any provider that publishes a manifest, not just TrendingRepo.
npx @visitportal/visit ${LIVE_BASE}/portal top_gainers --limit=5`;

export default async function CliPage() {
  // Pull the derived Repo[] (same cache the homepage uses) and compute the
  // top-5 24h trending list using the SAME sort key /api/repos applies for
  // ?period=today. Guarantees row-order parity with what `ss trending
  // --window=24h --limit=5` would actually print against this server.
  const repos = getDerivedRepos();
  const top5 = [...repos]
    .sort(
      (a, b) =>
        trendScoreForTimeRange(b, "24h") - trendScoreForTimeRange(a, "24h"),
    )
    .slice(0, 5);
  const transcript = formatTrendingSession(top5, {
    windowArg: "24h",
    total: repos.length,
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Heading ------------------------------------------------------ */}
      <header className="mb-8">
        <span className="label-micro">CLI · ss</span>
        <h1 className="font-display text-4xl sm:text-5xl mt-2 mb-3">
          Terminal-native AI trending.
        </h1>
        <p className="text-text-secondary text-md max-w-2xl leading-relaxed">
          Zero dependencies. Reads the same pipeline the web terminal
          reads, printed in honest monospace. Pipe through{" "}
          <span className="font-mono text-text-primary">jq</span>, tail
          the event stream, or just glance at what&apos;s moving without
          opening a browser.
        </p>
      </header>

      {/* Install ------------------------------------------------------ */}
      <section className="mb-10">
        <span className="label-section">Run against live production</span>
        <p className="text-text-secondary text-sm mt-2 mb-3">
          The CLI hits the live Portal pipeline directly — no clone, no
          setup. Node 18+ is the only prerequisite.
        </p>
        <pre className="bg-bg-card border border-border-primary rounded-md p-3 font-mono text-[13px] overflow-x-auto text-text-primary whitespace-pre">
          {INSTALL_LIVE}
        </pre>

        <p className="text-text-tertiary text-xs mt-5 mb-2 font-mono uppercase tracking-wider">
          Or via the Portal v0.1 visitor CLI
        </p>
        <p className="text-text-secondary text-sm mb-3">
          Same data, spec-native. Works against any{" "}
          <span className="font-mono text-text-primary">/portal</span>{" "}
          endpoint on the open agent web.
        </p>
        <pre className="bg-bg-card border border-border-primary rounded-md p-3 font-mono text-[13px] overflow-x-auto text-text-primary whitespace-pre">
          {PORTAL_CLI}
        </pre>

        <p className="text-text-tertiary text-xs mt-5 mb-2 font-mono uppercase tracking-wider">
          Local dev
        </p>
        <pre className="bg-bg-card border border-border-primary rounded-md p-3 font-mono text-[13px] overflow-x-auto text-text-primary whitespace-pre">
          {INSTALL_DEV}
        </pre>
        <p className="text-text-tertiary text-xs mt-2">
          Every command accepts{" "}
          <span className="font-mono text-text-secondary">
            TRENDINGREPO_API_URL=https://…
          </span>{" "}
          to point at a non-default API.
        </p>
      </section>

      {/* Commands ----------------------------------------------------- */}
      <section className="mb-10">
        <span className="label-section">Commands</span>
        <div className="mt-3 border border-border-primary rounded-md overflow-hidden bg-bg-card">
          {CLI_COMMANDS.map((c, i) => (
            <div
              key={c.cmd}
              className={
                "grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:gap-6 px-4 py-3 " +
                (i < CLI_COMMANDS.length - 1
                  ? "border-b border-border-secondary"
                  : "")
              }
            >
              <code className="font-mono text-[13px] text-brand break-all">
                {c.cmd}
              </code>
              <p className="text-text-secondary text-sm leading-snug">
                {c.desc}
              </p>
            </div>
          ))}
        </div>
        <p className="text-text-tertiary text-xs mt-3">
          Every command accepts{" "}
          <span className="font-mono text-text-secondary">--json</span>{" "}
          for machine-readable output. Exit code is{" "}
          <span className="font-mono">0</span> on success,{" "}
          <span className="font-mono">1</span> on error,{" "}
          <span className="font-mono">130</span> on Ctrl-C.
        </p>
      </section>

      {/* Transcript --------------------------------------------------- */}
      <section>
        <span className="label-section">Sample session</span>
        <p className="text-text-secondary text-sm mt-2 mb-3">
          What a 24-hour movers check actually looks like on a wide
          terminal:
        </p>
        <pre className="bg-bg-card border border-border-primary rounded-md p-3 font-mono text-[13px] overflow-x-auto whitespace-pre text-text-primary">
          {transcript}
        </pre>
        <p className="mt-2 font-mono text-[11px] text-text-tertiary">
          Live · refreshed every 30 min · last refresh{" "}
          {getRelativeTime(lastFetchedAt)}
        </p>
      </section>
    </div>
  );
}
