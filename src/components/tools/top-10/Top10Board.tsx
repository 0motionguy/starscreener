// Top10Board — orders the 10 ranked rows + the stats area under the
// ranking. The stats area features the TOP1 prominently (hero card with
// avatar + name + description + 7d delta + ★ stars + sparkline) alongside
// a smaller column of supporting stats (new stars · 7d, total mentions,
// data freshness). Pure presentation; data wiring happens in the parent.

import Image from "next/image";

import { Icon } from "@/components/icon/Icon";
import { RepoSparkline } from "@/components/trending/RepoSparkline";
import { formatDelta, formatStars } from "@/lib/top10/format";
import type { Top10Bundle } from "@/lib/top10/types";
import type { Repo } from "@/lib/types";

import { Top10RankRow } from "./Top10RankRow";

interface Top10BoardProps {
  bundle: Top10Bundle;
  /** Live Repo indexed by lower-cased fullName (slug). Missing -> null row. */
  reposBySlug: Map<string, Repo>;
  /** Kept on the prop interface for back-compat with callers that still pass
   *  it through; the DATA freshness cell was removed from the stats area
   *  2026-05-25 per operator call. */
  lastUpdatedAt?: string | null;
}

export function Top10Board({
  bundle,
  reposBySlug,
}: Top10BoardProps) {
  const items = bundle.items.slice(0, 10);

  // Compute the headline metrics from the LIVE repo data.
  let newStars = 0;
  let totalMentions = 0;
  let resolved = 0;
  let movers = 0;

  for (const item of items) {
    const repo = reposBySlug.get(item.slug.toLowerCase());
    if (!repo) continue;
    resolved += 1;
    const gain = repo.starsDelta7d ?? 0;
    if (!repo.starsDelta7dMissing) newStars += gain;
    if (gain > 0) movers += 1;
    totalMentions +=
      repo.mentions?.total ??
      repo.mentions?.total24h ??
      repo.mentionCount24h ??
      0;
  }

  // TOP 1 hero data — the ranker is already sorted by 7d gain, so items[0]
  // is the champion. Pulls from live repo for avatar + delta + sparkline.
  const top = items[0];
  const topRepo = top ? reposBySlug.get(top.slug.toLowerCase()) ?? null : null;
  const topDelta7d = topRepo
    ? formatDelta(
        topRepo.starsDelta7d ?? 0,
        topRepo.starsDelta7dMissing ?? !topRepo,
      )
    : null;
  const topDelta24h = topRepo
    ? formatDelta(topRepo.starsDelta24h ?? 0, !topRepo)
    : null;
  const topSpark =
    top?.sparkline && top.sparkline.length > 1
      ? top.sparkline
      : topRepo?.sparklineData?.slice(-14) ?? [];
  const topOwner = top?.owner ?? top?.slug.split("/")[0] ?? "";
  const topName = top?.slug.split("/")[1] ?? top?.title ?? "";
  const topDescription = (
    topRepo?.description ??
    top?.description ??
    ""
  ).trim();
  const topAvatar = topRepo?.ownerAvatarUrl ?? null;
  const topGradient = top
    ? `linear-gradient(135deg, ${top.avatarGradient[0]}, ${top.avatarGradient[1]})`
    : undefined;

  const newStarsDelta = formatDelta(newStars, resolved === 0);

  return (
    <section className="t10-board" aria-label="Top 10 ranking">
      <ol className="t10-rows">
        <li className="t10-row-head" aria-hidden="true">
          <span />
          <span />
          <span />
          <span className="t10-h-d24">24H</span>
          <span className="t10-h-d7d">7D</span>
          <span className="t10-h-stars">STARS</span>
          <span className="t10-h-spark" />
          <span className="t10-h-mentions">MENTIONS</span>
        </li>
        {items.map((item) => (
          <Top10RankRow
            key={item.slug || `${item.rank}`}
            item={item}
            repo={reposBySlug.get(item.slug.toLowerCase()) ?? null}
          />
        ))}
      </ol>

      {/* Stats area — TOP 1 hero on the left, supporting metrics stacked
          on the right. The hero is the headline; the right column is the
          context. */}
      <div className="t10-stats-grid" aria-label="Board summary">
        {top ? (
          <article className="t10-champion" aria-label={`Top 1 — ${top.slug}`}>
            <div className="t10-champion-eyebrow">
              <span className="t10-champion-badge">#1</span>
              <span className="t10-champion-label">
                <span className="slash">{"//"}</span> this week&apos;s champion
              </span>
            </div>
            <a
              href={`/repo/${topOwner}/${topName}`}
              className="t10-champion-body"
            >
              <span
                className="t10-champion-avatar"
                aria-hidden="true"
                style={topAvatar ? undefined : { background: topGradient }}
              >
                {topAvatar ? (
                  <Image
                    src={topAvatar}
                    alt=""
                    width={64}
                    height={64}
                    className="t10-champion-logo"
                    unoptimized
                  />
                ) : (
                  <span className="t10-champion-letter">
                    {top.avatarLetter}
                  </span>
                )}
              </span>
              <span className="t10-champion-text">
                <span className="t10-champion-name">
                  <span className="t10-champion-owner">{topOwner}</span>
                  <span className="t10-champion-slash">/</span>
                  <span className="t10-champion-repo">{topName}</span>
                </span>
                {topDescription && topDescription !== "—" ? (
                  <span className="t10-champion-desc">{topDescription}</span>
                ) : null}
                <span className="t10-champion-numbers">
                  <span className="t10-champion-stars">
                    <Icon
                      name="star-fill"
                      size="sm"
                      className="t10-champion-star-icon"
                      aria-hidden="true"
                    />
                    {topRepo ? formatStars(topRepo.stars ?? 0) : "—"}
                  </span>
                  {topDelta7d ? (
                    <span
                      className={`t10-champion-delta t10-delta-${topDelta7d.sign}`}
                    >
                      {topDelta7d.text}
                      <span className="t10-champion-delta-unit"> · 7d</span>
                    </span>
                  ) : null}
                  {topDelta24h ? (
                    <span
                      className={`t10-champion-delta dim t10-delta-${topDelta24h.sign}`}
                    >
                      {topDelta24h.text}
                      <span className="t10-champion-delta-unit"> · 24h</span>
                    </span>
                  ) : null}
                </span>
              </span>
              {topSpark.length > 1 ? (
                <span className="t10-champion-spark" aria-hidden="true">
                  <RepoSparkline data={topSpark} variant="up" />
                </span>
              ) : null}
            </a>
          </article>
        ) : null}

        <dl className="t10-stats-side">
          <div className="t10-meta-cell">
            <dt>new stars · 7d</dt>
            <dd>
              {newStarsDelta.sign === "up" ? "+" : ""}
              {formatStars(Math.abs(newStars))}
            </dd>
            <span className="sub">
              {movers} of {resolved} repo{resolved === 1 ? "" : "s"} climbing
            </span>
          </div>
          <div className="t10-meta-cell">
            <dt>mentions · cross-source</dt>
            <dd>{totalMentions.toLocaleString()}</dd>
            <span className="sub">across HN / X / Bsky / DEV / PH / npm</span>
          </div>
        </dl>
      </div>
    </section>
  );
}
