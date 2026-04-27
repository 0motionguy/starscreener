// V2 Signal Radar — wraps the existing BubbleMap with Node/01 chrome.
// The bubble logic stays untouched; the surrounding card gets a terminal
// bar header and a Node/01 spider-style legend.

import type { Repo } from "@/lib/types";
import { BubbleMap } from "@/components/terminal/BubbleMap";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

interface SignalRadarV2Props {
  repos: Repo[];
  /** Soft cap on bubbles drawn. Default 220. */
  limit?: number;
}

export function SignalRadarV2({ repos, limit = 220 }: SignalRadarV2Props) {
  const breakouts = repos.filter(
    (r) => r.movementStatus === "breakout" || r.movementStatus === "hot",
  ).length;

  return (
    <section
      id="signals"
      className="scroll-mt-32 hidden md:block border-b border-[color:var(--v2-line-100)]"
    >
      <div className="v2-frame py-12">
        <header className="mb-6">
          <p className="v2-mono mb-2">
            <span aria-hidden>{"// "}</span>
            STAGE 02 · VALIDATE
          </p>
          <h2 className="v2-h1">Signal Radar</h2>
          <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--v2-ink-200)]">
            Live bubble map of repos by momentum. Bigger = stronger 24h star
            velocity. Color = category.
          </p>

          {/* Spider-style legend pulled from Node/01 */}
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 v2-mono">
            <span>
              <span aria-hidden>tags </span>
              <span aria-hidden>→ </span>
              <span className="text-[color:var(--v2-ink-100)]">
                count={String(Math.min(repos.length, limit))}
              </span>
            </span>
            <span>
              <span aria-hidden>→ </span>
              <span className="text-[color:var(--v2-acc)] tabular-nums">
                breakouts={breakouts}
              </span>
            </span>
            <span>
              <span aria-hidden>→ </span>
              <span className="text-[color:var(--v2-ink-100)]">
                window=24h
              </span>
            </span>
          </div>
        </header>

        <div className="v2-card overflow-hidden">
          <TerminalBar
            label="// SIGNAL · RADAR"
            status={
              <>
                <span className="tabular-nums">
                  {Math.min(repos.length, limit)}
                </span>{" "}
                NODES · LIVE
              </>
            }
          />
          <div className="bg-[color:var(--v2-bg-000)]">
            <BubbleMap repos={repos} limit={limit} />
          </div>
        </div>
      </div>
    </section>
  );
}
