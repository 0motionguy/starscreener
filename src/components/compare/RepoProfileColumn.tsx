"use client";

// StarScreener — Single column inside CompareProfileGrid.
//
// Header + stack of mini-modules, driven by one CanonicalRepoProfile. Each
// mini-module lives in its own sibling file so the import list tells the
// grid's story at a glance. A column whose `profile` is null renders an
// error placeholder — the grid keeps every slot populated so the layout
// doesn't jitter when one lookup fails.

import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import type { CompareRepoRow, DiffTone } from "./CompareProfileGrid";
import { MomentumRow } from "./MomentumRow";
import { WhyTrendingCompact } from "./WhyTrendingCompact";
import { CrossSignalStrip } from "./CrossSignalStrip";
import { RevenueCompact } from "./RevenueCompact";
import { FundingCompact } from "./FundingCompact";
import { NpmCompact } from "./NpmCompact";
import { MentionsRecentCompact } from "./MentionsRecentCompact";
import { cn } from "@/lib/utils";
import { COMPARE_PALETTE as PALETTE } from "./palette";

interface RepoProfileColumnProps {
  row: CompareRepoRow;
  columnIndex: number;
  loading: boolean;
  diffFlags: {
    starsDelta24h: DiffTone;
    starsDelta7d: DiffTone;
    momentumScore: DiffTone;
    npmDownloads7d: DiffTone;
  };
}

function formatCompact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function RepoProfileColumn({
  row,
  columnIndex,
  loading,
  diffFlags,
}: RepoProfileColumnProps) {
  const accent = PALETTE[columnIndex] ?? PALETTE[0];
  const { profile, error, fullName } = row;

  if (loading && !profile) {
    return <ColumnSkeleton accent={accent} />;
  }

  if (!profile) {
    return (
      <article
        className="v2-card p-4 space-y-2 min-h-[140px]"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        <p className="text-sm font-medium text-text-primary truncate">
          {fullName || "—"}
        </p>
        <p className="text-xs text-text-tertiary">
          {error === "not_found"
            ? "Repo not in the TrendingRepo index yet."
            : "Couldn't load this repo."}
        </p>
      </article>
    );
  }

  const { repo } = profile;
  const [owner, name] = (repo.fullName || fullName).split("/");

  return (
    <article
      className="v2-card p-4 space-y-4"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      {/* Header */}
      <header className="flex items-center gap-2 min-w-0">
        {repo.ownerAvatarUrl ? (
          <Image
            src={repo.ownerAvatarUrl}
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-full bg-bg-card-hover shrink-0"
          />
        ) : (
          <div className="size-7 rounded-full bg-bg-card-hover shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/repo/${owner}/${name}`}
            className="text-sm font-medium text-text-primary truncate hover:underline block"
          >
            {repo.fullName}
          </Link>
          <div className="flex items-center gap-2 text-xs text-text-tertiary min-w-0">
            <span className="font-mono truncate">
              {repo.language ?? "—"}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-mono shrink-0">
              <Star size={10} className="shrink-0" />
              {formatCompact(repo.stars)}
            </span>
          </div>
        </div>
      </header>

      {/* Modules */}
      <MomentumRow
        repo={repo}
        score={profile.score}
        delta24hTone={diffFlags.starsDelta24h}
        delta7dTone={diffFlags.starsDelta7d}
        momentumTone={diffFlags.momentumScore}
      />
      <Divider />
      <WhyTrendingCompact reasons={profile.reasons} />
      <Divider />
      <CrossSignalStrip
        mentions={profile.mentions.countsBySource}
      />
      <Divider />
      <div className="grid grid-cols-2 gap-3">
        <RevenueCompact revenue={profile.revenue} />
        <FundingCompact funding={profile.funding} />
      </div>
      <Divider />
      <NpmCompact
        packages={profile.npm.packages}
        downloadsTone={diffFlags.npmDownloads7d}
      />
      <Divider />
      <MentionsRecentCompact mentions={profile.mentions.recent} />
    </article>
  );
}

function Divider() {
  return (
    <div
      className="h-px bg-border-primary/60"
      aria-hidden="true"
    />
  );
}

function ColumnSkeleton({ accent }: { accent: string }) {
  return (
    <div
      className={cn(
        "v2-card p-4 space-y-4",
      )}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-2">
        <div className="skeleton-shimmer size-7 rounded-full shrink-0" />
        <div className="skeleton-shimmer h-4 w-2/3 rounded-sm" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="skeleton-shimmer h-3 w-24 rounded-sm" />
          <div className="skeleton-shimmer h-3 w-full rounded-sm" />
        </div>
      ))}
    </div>
  );
}
