// V2 repo card — paired sibling of IdeaCardV2. Shows owner avatar, repo
// name, language, 24h delta, signal count. Featured (rank 1) gets bracket
// markers.

import Link from "next/link";

import type { Repo } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { BracketMarkers } from "@/components/today-v2/primitives/BracketMarkers";

interface RepoCardV2Props {
  repo: Repo;
  rank?: number;
}

export function RepoCardV2({ repo, rank }: RepoCardV2Props) {
  const isFeatured = rank === 1;
  const delta = repo.starsDelta24h ?? 0;
  const signals = repo.channelsFiring ?? 0;

  // Map movementStatus to V2 tag tone.
  const status = repo.movementStatus;
  const statusTone =
    status === "breakout" || status === "hot"
      ? "v2-tag-acc"
      : status === "rising" || status === "quiet_killer"
        ? "v2-tag-green"
        : "";

  const statusLabel = status ? status.replace(/_/g, " ").toUpperCase() : "STABLE";

  return (
    <Link
      href={`/repo/${repo.owner}/${repo.name}`}
      className={cn(
        "v2-card v2-card-hover overflow-hidden block group relative",
        isFeatured && "v2-bracket",
      )}
    >
      {isFeatured ? <BracketMarkers /> : null}

      <TerminalBar
        label={
          <span className="flex items-center gap-2">
            <span className="text-[color:var(--v2-ink-200)]">
              REPO-{String(rank ?? 0).padStart(2, "0")}
            </span>
            <span className="text-[color:var(--v2-ink-500)]">·</span>
            <span className={cn("v2-tag", statusTone)}>
              <span className="v2-tag-dot" />
              {statusLabel}
            </span>
          </span>
        }
        status={
          delta > 0 ? (
            <span className="text-[color:var(--v2-sig-green)] tabular-nums">
              +{formatNumber(delta)} /24H
            </span>
          ) : null
        }
      />

      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          {/* Avatar — 28px square with hairline border. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={repo.ownerAvatarUrl}
            alt=""
            width={32}
            height={32}
            loading="lazy"
            className="size-8 shrink-0 rounded-sm border border-[color:var(--v2-line-200)] bg-[color:var(--v2-bg-100)]"
          />
          <div className="flex-1 min-w-0">
            <h3
              className="truncate text-[color:var(--v2-ink-000)]"
              style={{
                fontFamily: "var(--font-geist), Inter, sans-serif",
                fontWeight: 510,
                fontSize: 16,
                lineHeight: 1.2,
                letterSpacing: "-0.012em",
              }}
            >
              {repo.fullName}
            </h3>
            <p className="mt-1 line-clamp-1 text-[color:var(--v2-ink-300)] text-[12px] leading-relaxed">
              {repo.description || "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 v2-mono">
          <span className="text-[color:var(--v2-ink-200)]">
            <span className="tabular-nums">{formatNumber(repo.stars)}</span>{" "}
            <span className="text-[color:var(--v2-ink-400)]">★</span>
          </span>
          {repo.language ? (
            <>
              <span aria-hidden className="text-[color:var(--v2-line-300)]">
                ·
              </span>
              <span>{repo.language.toUpperCase()}</span>
            </>
          ) : null}
          {signals > 0 ? (
            <>
              <span aria-hidden className="text-[color:var(--v2-line-300)] ml-auto">
                →
              </span>
              <span className="text-[color:var(--v2-acc)] tabular-nums">
                {signals}/5 SIGNALS
              </span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
