// V2 Ideas + Repos split — replaces TodayHero. Same data shape, new
// chrome. Server component. Provides IDs (#ideas, #repos) for TabsV2's
// IntersectionObserver.

import Link from "next/link";
import { Lightbulb, TrendingUp, Sparkles } from "lucide-react";

import type { Repo } from "@/lib/types";
import type { RankedIdea } from "@/components/ideas/IdeasFeedView";
import { IdeaCardV2 } from "@/components/today-v2/IdeaCardV2";
import { RepoCardV2 } from "@/components/today-v2/RepoCardV2";

interface IdeasRepoSplitV2Props {
  ideas: RankedIdea[];
  repos: Repo[];
  /** Cap rendered count per column. Defaults to 4. */
  limit?: number;
}

export function IdeasRepoSplitV2({
  ideas,
  repos,
  limit = 4,
}: IdeasRepoSplitV2Props) {
  const ideaList = ideas.slice(0, limit);
  const repoList = repos.slice(0, limit);

  return (
    <section className="border-b border-[color:var(--v2-line-100)]">
      <div className="v2-frame py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
          {/* IDEAS COLUMN */}
          <div id="ideas" className="scroll-mt-32 min-w-0 flex flex-col">
            <header className="mb-5 flex items-end justify-between gap-3">
              <div>
                <p className="v2-mono mb-2">
                  <span aria-hidden>{"// "}</span>
                  STAGE 03 · BUILD
                </p>
                <h2 className="v2-h1 flex items-center gap-3">
                  <Lightbulb
                    className="size-7 text-[color:var(--v2-acc)]"
                    aria-hidden
                  />
                  Trending Ideas
                </h2>
              </div>
              <Link
                href="/ideas?sort=hot"
                className="v2-mono hover:text-[color:var(--v2-acc)] transition-colors"
              >
                SEE ALL <span aria-hidden>→</span>
              </Link>
            </header>

            {ideaList.length === 0 ? (
              <IdeasEmptyV2 />
            ) : (
              <ul className="space-y-3">
                {ideaList.map((row, i) => (
                  <li key={row.idea.id}>
                    <IdeaCardV2
                      idea={row.idea}
                      reactionCounts={row.reactionCounts}
                      hotScore={row.hotScore}
                      rank={i + 1}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* REPOS COLUMN */}
          <div id="repos" className="scroll-mt-32 min-w-0 flex flex-col">
            <header className="mb-5 flex items-end justify-between gap-3">
              <div>
                <p className="v2-mono mb-2">
                  <span aria-hidden>{"// "}</span>
                  STAGE 01 · DISCOVER
                </p>
                <h2 className="v2-h1 flex items-center gap-3">
                  <TrendingUp
                    className="size-7 text-[color:var(--v2-acc)]"
                    aria-hidden
                  />
                  Trending Repos
                </h2>
              </div>
              <Link
                href="/top"
                className="v2-mono hover:text-[color:var(--v2-acc)] transition-colors"
              >
                SEE ALL <span aria-hidden>→</span>
              </Link>
            </header>

            {repoList.length === 0 ? (
              <div className="v2-card p-8 text-center text-[color:var(--v2-ink-300)] text-[13px]">
                <span className="v2-mono">
                  <span aria-hidden>{"// "}</span>
                  NO REPOS · NEXT SCRAPE PENDING
                </span>
              </div>
            ) : (
              <ul className="space-y-3">
                {repoList.map((repo, i) => (
                  <li key={repo.id}>
                    <RepoCardV2 repo={repo} rank={i + 1} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state for the Ideas column. Mirrors the original IdeasEmptyPlaceholder
// retypeset for V2 chrome — bracket markers + terminal bar on the ghost
// card, mono CTA.
// ---------------------------------------------------------------------------
function IdeasEmptyV2() {
  return (
    <div className="v2-card v2-bracket relative p-6 flex flex-col gap-4 min-h-[360px]">
      <span className="v2-br1" aria-hidden />
      <span className="v2-br2" aria-hidden />

      <div>
        <p className="v2-mono text-[color:var(--v2-acc)] mb-3 inline-flex items-center gap-2">
          <Sparkles className="size-3" aria-hidden />
          OPEN CALL
        </p>
        <h3 className="v2-h2">Drop an idea. We&apos;ll help build it.</h3>
        <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--v2-ink-200)] max-w-[44ch]">
          Post what should exist. Community reacts (build · use · buy · invest).
          Platform agents help turn the strongest signals into real repos.
        </p>
      </div>

      {/* Ghost preview card — shows what an idea card looks like. */}
      <div className="v2-card opacity-60 mt-2">
        <div className="v2-term-bar">
          <span className="v2-dots" aria-hidden>
            <i className="live" />
            <i />
            <i />
          </span>
          <span>IDEA-A7F2C9 · @builder</span>
          <span className="v2-status">AGENTS · SIG:78</span>
        </div>
        <div className="p-4">
          <div className="h-3 w-32 bg-[color:var(--v2-bg-200)] rounded-sm mb-2" />
          <div className="h-2 w-full bg-[color:var(--v2-bg-200)] rounded-sm mb-1.5 opacity-70" />
          <div className="h-2 w-3/4 bg-[color:var(--v2-bg-200)] rounded-sm opacity-70" />
        </div>
      </div>

      <div className="mt-auto">
        <Link
          href="/ideas#drop-idea"
          className="v2-btn v2-btn-primary w-full justify-center"
        >
          <Sparkles className="size-3.5" aria-hidden />
          Drop the first idea <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
