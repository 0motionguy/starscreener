// Top10RankRow — one row in the daily archive board.
//
// Reads:
// - rank, title/slug from the frozen Top10Item.
// - live Repo via getDerivedRepoByFullName(slug) for stars + Δ7d + mentions.
//   When the live repo is missing (deleted/archived since snapshot), the row
//   falls back to whatever the snapshot froze.
//
// Tier badge: rank 1-3 = S, 4-7 = A, 8-10 = B. Pure positional inference per
// the brief — no separate tier source is wired through the snapshot.

import Image from "next/image";
import Link from "next/link";

import { MentionCell } from "@/components/trending/MentionSourcePips";
import type { Top10Item } from "@/lib/top10/types";
import type { Repo } from "@/lib/types";

interface Top10RankRowProps {
  item: Top10Item;
  repo: Repo | null;
}

function tierFor(rank: number): "S" | "A" | "B" {
  if (rank <= 3) return "S";
  if (rank <= 7) return "A";
  return "B";
}

function formatStars(value: number): string {
  if (value >= 100_000) return `${Math.round(value / 1000)}k`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString();
}

function formatDelta(value: number, missing: boolean): {
  text: string;
  sign: "up" | "down" | "flat" | "unknown";
} {
  if (missing) return { text: "—", sign: "unknown" };
  if (value === 0) return { text: "·", sign: "flat" };
  const sign = value > 0 ? "up" : "down";
  const prefix = value > 0 ? "+" : "−";
  const abs = Math.abs(value);
  if (abs >= 1000) return { text: `${prefix}${(abs / 1000).toFixed(1)}k`, sign };
  return { text: `${prefix}${abs}`, sign };
}

export function Top10RankRow({ item, repo }: Top10RankRowProps) {
  const tier = tierFor(item.rank);
  const isTop3 = item.rank <= 3;

  // Snapshot-frozen identity: prefer Top10Item.owner + (title - "/" - everything),
  // but if owner is missing fall back to splitting the slug on "/" once.
  const slugParts = item.slug.split("/");
  const owner = item.owner ?? (slugParts.length === 2 ? slugParts[0] : "");
  const name = slugParts.length === 2 ? slugParts[1] : item.title;
  const isRepoLink = owner !== "" && name !== "";
  const detailHref = isRepoLink ? `/repo/${owner}/${name}` : item.href;

  const stars = repo?.stars ?? 0;
  const delta = formatDelta(
    repo?.starsDelta7d ?? 0,
    repo?.starsDelta7dMissing ?? !repo,
  );

  const avatarUrl = repo?.ownerAvatarUrl;
  const initial = item.avatarLetter || (owner ? owner[0] : item.title[0] || "?");
  const gradient = `linear-gradient(135deg, ${item.avatarGradient[0]}, ${item.avatarGradient[1]})`;

  return (
    <li className={`t10-row tier-${tier}${isTop3 ? " top3" : ""}`}>
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
        {item.description && (
          <span className="t10-desc">{item.description}</span>
        )}
      </span>

      <span className="t10-stars">
        <span className="t10-stars-num">{formatStars(stars)}</span>
        <span className={`t10-delta t10-delta-${delta.sign}`}>{delta.text}</span>
      </span>

      <span className="t10-mentions">
        {repo ? (
          <MentionCell repo={repo} />
        ) : (
          <span className="t10-mentions-empty">—</span>
        )}
      </span>

      <span className={`t10-tier tier-badge-${tier}`} aria-label={`Tier ${tier}`}>
        {tier}
      </span>
    </li>
  );
}
