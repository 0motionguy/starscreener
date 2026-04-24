// TrendingRepo — Builder panel on the repo detail page.
//
// Renders three modules: Prediction card (30d star trajectory), Conviction
// tallies (reactions), and Ideas-using-this (up to 6). Server component —
// data is fetched once and handed to the ReactionsBar for client-side
// interactions.

import Link from "next/link";
import { getBuilderStore } from "@/lib/builder/store";
import { buildStarTrajectoryPrediction } from "@/lib/builder/predictions";
import { ReactionsBar } from "./ReactionsBar";
import { IdeaFeedCardItem } from "./IdeaFeedCardItem";
import type { Repo } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

interface Props {
  repo: Repo;
}

export async function RepoBuilderPanel({ repo }: Props) {
  const store = getBuilderStore();
  const [tally, ideas] = await Promise.all([
    store.getTally("repo", repo.fullName),
    store.ideasByRepoId(repo.id, 6),
  ]);

  // Run the forecast inline so no round-trip is needed on first paint.
  const prediction = buildStarTrajectoryPrediction({
    repoFullName: repo.fullName,
    sparklineData: repo.sparklineData,
    currentStars: repo.stars,
    horizonDays: 30,
  });
  const p20 = Math.round(prediction.p20);
  const p50 = Math.round(prediction.p50);
  const p80 = Math.round(prediction.p80);
  const bandWidthPct =
    p50 > 0 ? Math.max(1, Math.round(((p80 - p20) / p50) * 100)) : 0;

  return (
    <section
      aria-label="Builder layer"
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4"
    >
      {/* Left: Conviction + Ideas */}
      <div className="flex flex-col gap-4">
        <div className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card">
          <header className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-text-secondary">
              Conviction
            </h3>
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-tertiary">
              {tally.uniqueBuilders} builder
              {tally.uniqueBuilders === 1 ? "" : "s"}
            </span>
          </header>
          <div className="mt-3">
            <ReactionsBar
              subjectType="repo"
              subjectId={repo.fullName}
              initialTally={tally}
            />
          </div>
          {tally.topPayloads.build.length > 0 && (
            <div className="mt-3 border-t border-border-primary pt-3">
              <p className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
                What builders would build
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {tally.topPayloads.build.map((p) => (
                  <li
                    key={`${p.builderId}-${p.createdAt}`}
                    className="text-xs text-text-secondary"
                  >
                    <span className="text-text-tertiary">▸</span> {p.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card">
          <header className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-text-secondary">
              Ideas using this
            </h3>
            <Link
              href={`/submit?tab=idea`}
              className="font-mono text-[11px] uppercase tracking-wide text-accent-green hover:underline"
            >
              post one →
            </Link>
          </header>
          {ideas.length === 0 ? (
            <p className="mt-3 text-xs text-text-tertiary">
              No ideas anchored to this repo yet.
            </p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {ideas.map((i) => (
                <li key={i.id}>
                  <IdeaFeedCardItem idea={i} variant="compact" />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Right: Prediction card */}
      <aside className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card">
        <header className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-text-secondary">
            30-day forecast
          </h3>
          <span
            title="auto_linear_vol_30d — OLS trend with ±0.84σ residual band; widens with √t."
            className="font-mono text-[10px] uppercase tracking-wide text-text-tertiary"
          >
            method · auto_linear
          </span>
        </header>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center font-mono">
          <div className="rounded-card bg-bg-secondary p-2">
            <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
              p20
            </dt>
            <dd className="mt-1 text-sm text-text-secondary">
              {formatNumber(p20)}
            </dd>
          </div>
          <div className="rounded-card bg-bg-secondary p-2 border border-border-accent">
            <dt className="text-[10px] uppercase tracking-wide text-text-primary">
              p50
            </dt>
            <dd className="mt-1 text-base font-bold text-text-primary">
              {formatNumber(p50)}
            </dd>
          </div>
          <div className="rounded-card bg-bg-secondary p-2">
            <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
              p80
            </dt>
            <dd className="mt-1 text-sm text-text-secondary">
              {formatNumber(p80)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-text-secondary">
          {prediction.question}
        </p>
        <p className="mt-2 text-[11px] text-text-tertiary">
          Band width ≈ <strong className="text-text-secondary">±{bandWidthPct}%</strong>{" "}
          around p50. Wider bands mean less certainty.
        </p>
      </aside>
    </section>
  );
}
