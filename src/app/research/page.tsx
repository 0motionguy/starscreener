// /research — coming-soon placeholder page.
//
// Surfaced in the sidebar IA as a fourth TERMINAL (alongside Repos /
// Reddit / HackerNews) so users see where research signal will land
// when arXiv + paperswithcode adapters ship. Today: static content
// outlining the planned scope.

import type { Metadata } from "next";
import Link from "next/link";
import { Microscope } from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Research — TrendingRepo",
  description:
    "Research-paper signal coming to TrendingRepo. arXiv + Papers With Code + HuggingFace trends.",
};

export default function ResearchPage() {
  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              RESEARCH
            </h1>
            <span className="text-xs text-accent-green uppercase tracking-wider">
              {"// coming soon"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-2xl">
            Research-paper signal will land here — arXiv hot papers, Papers
            With Code velocity, HuggingFace model trends, and code-mention
            cross-references back into the repo corpus.
          </p>
        </header>

        <section className="rounded-md border border-dashed border-border-primary bg-bg-secondary/40 p-8">
          <div className="flex items-center gap-3 mb-4">
            <Microscope className="w-5 h-5 text-accent-green shrink-0" />
            <h2 className="text-lg font-bold uppercase tracking-wider text-accent-green">
              {"// scope"}
            </h2>
          </div>
          <ul className="space-y-2 text-sm text-text-secondary">
            <li>
              <span className="text-text-primary">arXiv adapter</span> — pull
              new submissions in cs.AI / cs.CL / cs.LG, score by 24h
              download velocity + author H-index, link papers to GitHub repos
              named in the abstract or footnotes.
            </li>
            <li>
              <span className="text-text-primary">Papers With Code</span> — track
              SOTA leaderboard climbers and surface their associated repos
              when a benchmark gets a fresh entry.
            </li>
            <li>
              <span className="text-text-primary">HuggingFace</span> — model
              page download velocity + trending spaces. Cross-link to the
              source repo when one is declared.
            </li>
            <li>
              <span className="text-text-primary">Cross-signal upgrade</span>
              {" "}— add a 5th channel to the cross-signal score so a paper
              hitting #1 on Papers With Code lights up its associated
              GitHub repo on the homepage breakouts feed.
            </li>
          </ul>

          <div className="mt-6 pt-6 border-t border-border-primary/50 text-xs text-text-tertiary">
            {"// no ETA — scoping after the cross-signal v1 + Bluesky integration land"}
          </div>
        </section>

        <p className="mt-6 text-xs text-text-tertiary">
          In the meantime:{" "}
          <Link href="/breakouts" className="text-accent-green hover:underline">
            Cross-Signal Breakouts
          </Link>
          {" "}covers the GitHub + Reddit + HN + Bluesky agreement layer.
        </p>
      </div>
    </main>
  );
}
