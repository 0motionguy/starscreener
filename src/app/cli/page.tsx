// StarScreener — /cli docs
//
// Static docs page for the `ss` CLI (bin/ss.mjs). Lists the real command
// set extracted from the binary so drift against the help text is
// obvious in review. Pure server component — no interactive state so
// we render a single flat tree and let the document-title metadata
// handle tab naming.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CLI — StarScreener",
  description:
    "Zero-dependency terminal client for StarScreener. Tail trending, tail the live stream, pipe JSON through jq — AI-repo trending without opening a browser.",
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

const INSTALL_ASPIRATIONAL = `npx starscreener trending`;

const INSTALL_DEV = `# from a local checkout
npm run cli:dev -- trending --window=24h --limit=10

# or run the bin directly
node bin/ss.mjs trending`;

const TRANSCRIPT = `$ ss trending --window=24h --limit=5
Trending repos (window=24h, showing 5 of 212)

#  REPO                            STARS    24H      7D      MOMENTUM  STATUS
-  ------------------------------  -------  -------  ------  --------  --------
1  anthropics/claude-code          48,214   +1,204   +6,880  94.2      hot
2  microsoft/vscode-copilot        92,101   +874     +3,120  88.7      breakout
3  mlabonne/llm-course             41,502   +612     +2,045  81.3      rising
4  ollama/ollama                   112,880  +548     +1,982  79.1      rising
5  vercel/ai                       12,044   +421     +1,210  74.8      rising`;

export default function CliPage() {
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
        <span className="label-section">Install</span>
        <p className="text-text-secondary text-sm mt-2 mb-3">
          When the npm release ships you&apos;ll be one command away:
        </p>
        <pre className="bg-bg-card border border-border-primary rounded-md p-3 font-mono text-[13px] overflow-x-auto text-text-primary">
          {INSTALL_ASPIRATIONAL}
        </pre>
        <p className="text-text-tertiary text-xs mt-3 mb-2 font-mono uppercase tracking-wider">
          Today — local dev
        </p>
        <pre className="bg-bg-card border border-border-primary rounded-md p-3 font-mono text-[13px] overflow-x-auto text-text-primary">
          {INSTALL_DEV}
        </pre>
        <p className="text-text-tertiary text-xs mt-2">
          Point at a non-default API with{" "}
          <span className="font-mono text-text-secondary">
            STARSCREENER_API_URL=https://…
          </span>
          .
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
          {TRANSCRIPT}
        </pre>
      </section>
    </div>
  );
}
