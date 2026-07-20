"use client";

// MobileRepoCard — dense app-list row (~56px), tuned so ~10 repos fit on one
// screen. Two tight lines: [rank · avatar · owner/repo · signal | delta ·
// stars] then [description | sources · watch/compare/github]. Tapping line 1
// opens the repo; the action buttons don't navigate. Watch/compare use the
// same Zustand stores as desktop. The full sparkline/chart lives on the repo
// detail screen — the color-coded delta carries the trend here.

import Link from "next/link";
import { Icon, SourceLogo, type SourceName } from "@/components/icon/Icon";
import { useWatchlistStore, useCompareStore } from "@/lib/store";
import type { RepoCardModel } from "@/lib/mobile/repo-card-model";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
function fmt(n: number): string {
  return compact.format(Math.round(n)).toLowerCase();
}

export function MobileRepoCard({ model }: { model: RepoCardModel }) {
  const watched = useWatchlistStore((s) => s.repos.some((r) => r.repoId === model.id));
  const toggleWatch = useWatchlistStore((s) => s.toggleWatch);
  const comparing = useCompareStore((s) => s.repos.includes(model.id));
  const addCompare = useCompareStore((s) => s.addRepo);
  const removeCompare = useCompareStore((s) => s.removeRepo);

  const up = model.delta >= 0;
  const pct =
    model.deltaPct !== null && Math.abs(model.deltaPct) >= 1
      ? `${up ? "+" : ""}${model.deltaPct}%`
      : model.windowLabel;

  return (
    <article className="mapp-card">
      <Link href={model.href} className="mapp-card-r1" aria-label={`${model.fullName} details`}>
        <span className="mapp-card-rank">{String(model.rank).padStart(2, "0")}</span>
        {model.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small avatar
          <img
            className="mapp-card-avatar"
            src={model.avatarUrl}
            alt=""
            width={20}
            height={20}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="mapp-card-avatar mapp-card-avatar-fallback" aria-hidden="true" />
        )}
        <span className="mapp-card-name">
          {model.signal ? (
            <span className={`mapp-card-signal mapp-card-signal-${model.signal}`}>
              {model.signal === "new" ? "NEW" : "HOT"}
            </span>
          ) : null}
          <span className="mapp-card-owner">{model.owner}/</span>
          <b className="mapp-card-repo">{model.name}</b>
        </span>
        <span className="mapp-card-r1r">
          <span className={`mapp-card-delta ${up ? "up" : "dn"}`}>
            {up ? "+" : ""}{fmt(model.delta)}
            <i>{pct}</i>
          </span>
          <span className="mapp-card-stars">★{fmt(model.stars)}</span>
        </span>
      </Link>

      <div className="mapp-card-r2">
        <span className="mapp-card-desc">{model.description || model.category}</span>
        <span className="mapp-card-r2r">
          <span className="mapp-card-sources" aria-label={`${model.sources.length} sources`}>
            {model.sources.slice(0, 3).map((s) => (
              <SourceLogo key={s} source={s as SourceName} size={11} />
            ))}
            {model.mentions > 0 ? <span className="mapp-card-mentions">{fmt(model.mentions)}</span> : null}
          </span>
          <span className="mapp-card-actions">
            <button
              type="button"
              className={`mapp-card-act${watched ? " on" : ""}`}
              aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
              aria-pressed={watched}
              onClick={() => toggleWatch(model.id, model.stars, model.fullName)}
            >
              <Icon name={watched ? "bookmark-fill" : "bookmark"} size={14} />
            </button>
            <button
              type="button"
              className={`mapp-card-act${comparing ? " on" : ""}`}
              aria-label={comparing ? "Remove from compare" : "Add to compare"}
              aria-pressed={comparing}
              onClick={() => (comparing ? removeCompare(model.id) : addCompare(model.id, model.fullName))}
            >
              <Icon name="diff" size={14} />
            </button>
            <a
              className="mapp-card-act"
              href={`https://github.com/${model.fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open on GitHub"
            >
              <Icon name="external" size={14} />
            </a>
          </span>
        </span>
      </div>
    </article>
  );
}
