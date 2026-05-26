// Top10RankRow — one row in the daily archive board.
//
// Reads:
// - rank, title/slug, score, badges, sparkline from the frozen Top10Item.
// - live Repo via getDerivedRepoByFullName(slug) for stars + Δ7d + mentions.
//   When the live repo is missing (deleted/archived since snapshot), the row
//   falls back to whatever the snapshot froze.
//
// Layout (left → right):
//   rank · avatar · owner/name · 24h · 7d · ★ stars · sparkline · mentions
//
// 2026-05-23: removed SCORE + TIER per design pass.
// 2026-05-24: removed velocity pill (HOT/WARM) + description per share-card
// parity pass — the OG image and the on-screen row now share one vocabulary,
// and the row uses its full horizontal budget instead of feeling chopped.
// 2026-05-24 (round 2): split stars cell into 24h delta + 7d delta + total
// stars so each row carries the three numbers that justify the rank. The
// column header lives in Top10Board's `.t10-row-head`.

import Image from "next/image";
import Link from "next/link";

import { Icon } from "@/components/icon/Icon";
import { MentionCell } from "@/components/trending/MentionSourcePips";
import { RepoSparkline } from "@/components/trending/RepoSparkline";
import { formatDelta, formatStars } from "@/lib/top10/format";
import type { Top10Item } from "@/lib/top10/types";
import type { Repo } from "@/lib/types";

interface Top10RankRowProps {
  item: Top10Item;
  repo: Repo | null;
}

function trendDirectionForSpark(points: number[]): "up" | "down" | "muted" {
  if (points.length < 2) return "muted";
  const first = points[0];
  const last = points[points.length - 1];
  if (last > first) return "up";
  if (last < first) return "down";
  return "muted";
}

export function Top10RankRow({ item, repo }: Top10RankRowProps) {
  const isTop3 = item.rank <= 3;

  // Snapshot-frozen identity: prefer Top10Item.owner + (title - "/" - everything),
  // but if owner is missing fall back to splitting the slug on "/" once.
  const slugParts = item.slug.split("/");
  const owner = item.owner ?? (slugParts.length === 2 ? slugParts[0] : "");
  const name = slugParts.length === 2 ? slugParts[1] : item.title;
  const isRepoLink = owner !== "" && name !== "";
  const detailHref = isRepoLink ? `/repo/${owner}/${name}` : item.href;

  const stars = repo?.stars ?? 0;
  const delta24h = formatDelta(repo?.starsDelta24h ?? 0, !repo);
  const delta7d = formatDelta(
    repo?.starsDelta7d ?? 0,
    repo?.starsDelta7dMissing ?? !repo,
  );

  const avatarUrl = repo?.ownerAvatarUrl;
  const initial = item.avatarLetter || (owner ? owner[0] : item.title[0] || "?");
  const gradient = `linear-gradient(135deg, ${item.avatarGradient[0]}, ${item.avatarGradient[1]})`;

  // Sparkline: prefer Top10Item.sparkline (snapshot-frozen), fallback to live repo.
  const sparkPoints =
    item.sparkline && item.sparkline.length > 1
      ? item.sparkline
      : repo?.sparklineData?.slice(-30) ?? [];
  const sparkDir = trendDirectionForSpark(sparkPoints);
  const hasSpark = sparkPoints.length > 1;

  return (
    <li className={`t10-row${isTop3 ? " top3" : ""}`}>
      <span className="t10-rank">
        <span className="t10-rank-num">{String(item.rank).padStart(2, "0")}</span>
      </span>

      <span className="t10-avatar" aria-hidden="true">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={32}
            height={32}
            className="t10-logo"
            unoptimized
          />
        ) : (
          <span className="t10-logo-fallback" style={{ background: gradient }}>
            {initial.toUpperCase()}
          </span>
        )}
      </span>

      <span className="t10-id">
        <span className="t10-id-top">
          <Link href={detailHref} className="t10-id-link" prefetch={false}>
            {isRepoLink ? (
              <>
                <span className="t10-owner">{owner}</span>
                <span className="t10-slash">/</span>
                <span className="t10-name">{name}</span>
              </>
            ) : (
              <span className="t10-name">{item.title}</span>
            )}
          </Link>
        </span>
      </span>

      <span className={`t10-d24 t10-delta-${delta24h.sign}`}>{delta24h.text}</span>
      <span className={`t10-d7d t10-delta-${delta7d.sign}`}>{delta7d.text}</span>

      <span className="t10-stars">
        <Icon name="star-fill" size="sm" className="t10-star-icon" aria-hidden="true" />
        <span className="t10-stars-num">{formatStars(stars)}</span>
      </span>

      <span className="t10-spark-cell" aria-hidden="true">
        {hasSpark ? (
          <RepoSparkline data={sparkPoints} variant={sparkDir} />
        ) : (
          <span className="t10-spark-empty">·</span>
        )}
      </span>

      <span className="t10-mentions">
        {repo ? (
          <MentionCell repo={repo} />
        ) : (
          <span className="t10-mentions-empty">—</span>
        )}
      </span>
    </li>
  );
}
