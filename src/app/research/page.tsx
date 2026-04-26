// /research — V2 coming-soon placeholder.

import type { Metadata } from "next";
import Link from "next/link";

import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Research — TrendingRepo",
  description:
    "Research-paper signal coming to TrendingRepo. arXiv + Papers With Code + HuggingFace trends.",
};

export default function ResearchPage() {
  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>RESEARCH · ARXIV · PWC · HF
              </>
            }
            status="COMING SOON"
          />

          <h1
            className="v2-mono mt-6 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-100)",
              fontSize: 12,
              letterSpacing: "0.20em",
            }}
          >
            <span aria-hidden>{"// "}</span>
            RESEARCH · PAPER SIGNAL
            <span
              aria-hidden
              className="inline-block ml-1"
              style={{
                width: 6,
                height: 6,
                background: "var(--v2-acc)",
                borderRadius: 1,
                boxShadow: "0 0 6px var(--v2-acc-glow)",
              }}
            />
          </h1>
          <p
            className="text-[14px] leading-relaxed max-w-[80ch] mt-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Research-paper signal will land here — arXiv hot papers, Papers
            With Code velocity, HuggingFace model trends, and code-mention
            cross-references back into the repo corpus.
          </p>
        </div>
      </section>

      <section>
        <div className="v2-frame py-6">
          <div className="v2-card v2-bracket relative p-8">
            <p
              className="v2-mono mb-4"
              style={{ color: "var(--v2-acc)" }}
            >
              <span aria-hidden>{"// "}</span>
              SCOPE · PLANNED ADAPTERS
            </p>
            <ul className="space-y-3 text-[14px] leading-relaxed">
              <li style={{ color: "var(--v2-ink-200)" }}>
                <span style={{ color: "var(--v2-ink-000)", fontWeight: 510 }}>
                  arXiv adapter
                </span>{" "}
                — pull new submissions in cs.AI / cs.CL / cs.LG, score by 24h
                download velocity + author H-index, link papers to GitHub
                repos named in the abstract or footnotes.
              </li>
              <li style={{ color: "var(--v2-ink-200)" }}>
                <span style={{ color: "var(--v2-ink-000)", fontWeight: 510 }}>
                  Papers With Code
                </span>{" "}
                — track SOTA leaderboard climbers and surface their associated
                repos when a benchmark gets a fresh entry.
              </li>
              <li style={{ color: "var(--v2-ink-200)" }}>
                <span style={{ color: "var(--v2-ink-000)", fontWeight: 510 }}>
                  HuggingFace
                </span>{" "}
                — model page download velocity + trending spaces. Cross-link
                to the source repo when one is declared.
              </li>
              <li style={{ color: "var(--v2-ink-200)" }}>
                <span style={{ color: "var(--v2-ink-000)", fontWeight: 510 }}>
                  Cross-signal upgrade
                </span>{" "}
                — add a 5th channel to the cross-signal score so a paper
                hitting #1 on Papers With Code lights up its associated GitHub
                repo on the homepage breakouts feed.
              </li>
            </ul>

            <div
              className="mt-6 pt-6 border-t v2-mono"
              style={{
                borderColor: "var(--v2-line-100)",
                color: "var(--v2-ink-400)",
                fontSize: 11,
              }}
            >
              <span aria-hidden>{"// "}</span>
              NO ETA · SCOPING AFTER CROSS-SIGNAL V1 + BLUESKY INTEGRATION LAND
            </div>
          </div>

          <p
            className="v2-mono mt-6"
            style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
          >
            <span aria-hidden>{"// "}</span>
            IN THE MEANTIME:{" "}
            <Link
              href="/breakouts"
              className="underline decoration-dotted"
              style={{ color: "var(--v2-acc)" }}
            >
              CROSS-SIGNAL BREAKOUTS
            </Link>{" "}
            COVERS THE GITHUB + REDDIT + HN + BLUESKY AGREEMENT LAYER.
          </p>
        </div>
      </section>
    </>
  );
}
