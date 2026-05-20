// Top10Board — orders the 10 ranked rows + the meta-stats strip that lives
// under the ranking on the live /top10 page. Pure presentation; data wiring
// (live Repo lookup per row) happens in the parent server component.

import type { Top10Bundle } from "@/lib/top10/types";
import type { Repo } from "@/lib/types";

import { Top10RankRow } from "./Top10RankRow";

interface Top10BoardProps {
  bundle: Top10Bundle;
  /** Live Repo indexed by lower-cased fullName (slug). Missing -> null row. */
  reposBySlug: Map<string, Repo>;
}

export function Top10Board({ bundle, reposBySlug }: Top10BoardProps) {
  const items = bundle.items.slice(0, 10);

  return (
    <section className="t10-board" aria-label="Top 10 ranking">
      <ol className="t10-rows">
        {items.map((item) => (
          <Top10RankRow
            key={item.slug || `${item.rank}`}
            item={item}
            repo={reposBySlug.get(item.slug.toLowerCase()) ?? null}
          />
        ))}
      </ol>

      <dl className="t10-meta" aria-label="Day-over-day stats">
        <div className="t10-meta-cell">
          <dt>movement</dt>
          <dd>{bundle.meta.totalMovement}</dd>
          {bundle.meta.totalMovementSub && (
            <span className="sub">{bundle.meta.totalMovementSub}</span>
          )}
        </div>
        <div className="t10-meta-cell">
          <dt>mean score</dt>
          <dd>{bundle.meta.meanScore}</dd>
          {bundle.meta.meanScoreSub && (
            <span className="sub">{bundle.meta.meanScoreSub}</span>
          )}
        </div>
        <div className="t10-meta-cell">
          <dt>hottest</dt>
          <dd className="hot">{bundle.meta.hottest}</dd>
          {bundle.meta.hottestSub && (
            <span className="sub">{bundle.meta.hottestSub}</span>
          )}
        </div>
        <div className="t10-meta-cell">
          <dt>coldest</dt>
          <dd className="cold">{bundle.meta.coldest ?? "—"}</dd>
          {bundle.meta.coldestSub && (
            <span className="sub">{bundle.meta.coldestSub}</span>
          )}
        </div>
      </dl>
    </section>
  );
}
