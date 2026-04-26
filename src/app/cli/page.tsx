// /cli — V2 CLI docs.
//
// Static docs page for the `ss` CLI (bin/ss.mjs). Lists the real command
// set extracted from the binary so drift against the help text is
// obvious in review. Pure server component — V2 design system: TerminalBar,
// .v2-display headline, .v2-card command table, mono section labels.

import type { Metadata } from "next";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { AsciiInterstitial } from "@/components/today-v2/AsciiInterstitial";

export const metadata: Metadata = {
  title: "CLI — TrendingRepo",
  description:
    "Zero-dependency terminal client for TrendingRepo. Tail trending, tail the live stream, pipe JSON through jq — AI-repo trending without opening a browser.",
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

// Live prod endpoint — the CLI reads STARSCREENER_API_URL.
const LIVE_BASE = "https://trendingrepo.com";

const INSTALL_LIVE = `# Pipe straight from the live deployment
npx github:0motionguy/starscreener \\
  trending --window=24h --limit=10

# Or export the API base and keep the command short across a session
export STARSCREENER_API_URL=${LIVE_BASE}
npx github:0motionguy/starscreener trending --limit=5`;

const INSTALL_DEV = `# From a local checkout against npm run dev
npm run cli:dev -- trending --window=24h --limit=10

# Or run the bin directly
STARSCREENER_API_URL=${LIVE_BASE} node bin/ss.mjs trending`;

const PORTAL_CLI = `# Spec-native Portal v0.1 visitor CLI — works against /portal
# on any provider that publishes a manifest, not just TrendingRepo.
npx @visitportal/visit ${LIVE_BASE}/portal top_gainers --limit=5`;

const TRANSCRIPT = `$ ss trending --window=24h --limit=5
Trending repos (window=24h, showing 5 of 212)

#  REPO                            STARS    24H      7D      MOMENTUM  STATUS
-  ------------------------------  -------  -------  ------  --------  --------
1  anthropics/claude-code          48,214   +1,204   +6,880  94.2      hot
2  microsoft/vscode-copilot        92,101   +874     +3,120  88.7      breakout
3  mlabonne/llm-course             41,502   +612     +2,045  81.3      rising
4  ollama/ollama                   112,880  +548     +1,982  79.1      rising
5  vercel/ai                       12,044   +421     +1,210  74.8      rising`;

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      className="v2-card overflow-x-auto p-4 whitespace-pre"
      style={{
        fontFamily:
          "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
        fontSize: 13,
        lineHeight: 1.5,
        color: "var(--v2-ink-100)",
      }}
    >
      {children}
    </pre>
  );
}

export default function CliPage() {
  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>CLI · SS · TERMINAL CLIENT
              </>
            }
            status={`${CLI_COMMANDS.length} CMDS`}
          />

          <h1
            className="v2-display mt-6"
            style={{
              fontSize: "clamp(36px, 5vw, 64px)",
              color: "var(--v2-ink-000)",
            }}
          >
            Terminal-native AI{" "}
            <span style={{ color: "var(--v2-ink-400)" }}>trending.</span>
          </h1>
          <p
            className="text-[15px] leading-relaxed max-w-[80ch] mt-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Zero dependencies. Reads the same pipeline the web terminal reads,
            printed in honest monospace. Pipe through{" "}
            <code
              className="v2-mono-tight"
              style={{ color: "var(--v2-ink-100)", fontSize: 13 }}
            >
              jq
            </code>
            , tail the event stream, or just glance at what&apos;s moving
            without opening a browser.
          </p>
        </div>
      </section>

      {/* Install */}
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame py-6 max-w-[900px]">
          <p
            className="v2-mono mb-2"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            RUN AGAINST LIVE PRODUCTION
          </p>
          <p
            className="text-[14px] leading-relaxed mb-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            The CLI hits the live Portal pipeline directly — no clone, no
            setup. Node 18+ is the only prerequisite.
          </p>
          <CodeBlock>{INSTALL_LIVE}</CodeBlock>

          <p
            className="v2-mono mt-6 mb-2"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            OR · PORTAL V0.1 VISITOR CLI
          </p>
          <p
            className="text-[14px] leading-relaxed mb-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Same data, spec-native. Works against any{" "}
            <code
              className="v2-mono-tight"
              style={{ color: "var(--v2-ink-100)", fontSize: 13 }}
            >
              /portal
            </code>{" "}
            endpoint on the open agent web.
          </p>
          <CodeBlock>{PORTAL_CLI}</CodeBlock>

          <p
            className="v2-mono mt-6 mb-2"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            LOCAL DEV
          </p>
          <CodeBlock>{INSTALL_DEV}</CodeBlock>
          <p
            className="v2-mono mt-3"
            style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
          >
            <span aria-hidden>{"// "}</span>
            EVERY COMMAND ACCEPTS{" "}
            <code
              className="v2-mono-tight"
              style={{ color: "var(--v2-ink-200)", fontSize: 11 }}
            >
              STARSCREENER_API_URL=https://…
            </code>{" "}
            TO POINT AT A NON-DEFAULT API.
          </p>
        </div>
      </section>

      <AsciiInterstitial />

      {/* Commands */}
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame py-6 max-w-[1100px]">
          <p
            className="v2-mono mb-3"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            COMMANDS · {CLI_COMMANDS.length}
          </p>
          <div className="v2-card overflow-hidden">
            {CLI_COMMANDS.map((c, i) => (
              <div
                key={c.cmd}
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:gap-6 px-4 py-3"
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--v2-line-100)",
                }}
              >
                <code
                  className="v2-mono-tight break-all"
                  style={{ color: "var(--v2-acc)", fontSize: 13 }}
                >
                  {c.cmd}
                </code>
                <p
                  className="text-[14px] leading-snug"
                  style={{ color: "var(--v2-ink-200)" }}
                >
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
          <p
            className="v2-mono mt-3"
            style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
          >
            <span aria-hidden>{"// "}</span>
            EVERY COMMAND ACCEPTS{" "}
            <code
              className="v2-mono-tight"
              style={{ color: "var(--v2-ink-200)", fontSize: 11 }}
            >
              --json
            </code>{" "}
            FOR MACHINE-READABLE OUTPUT · EXIT 0 OK · 1 ERROR · 130 CTRL-C
          </p>
        </div>
      </section>

      {/* Transcript */}
      <section>
        <div className="v2-frame py-6 max-w-[1100px]">
          <p
            className="v2-mono mb-2"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            SAMPLE SESSION
          </p>
          <p
            className="text-[14px] leading-relaxed mb-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            What a 24-hour movers check actually looks like on a wide
            terminal:
          </p>
          <CodeBlock>{TRANSCRIPT}</CodeBlock>
        </div>
      </section>
    </>
  );
}
