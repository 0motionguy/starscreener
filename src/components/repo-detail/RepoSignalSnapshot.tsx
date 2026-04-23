import type { JSX } from "react";
import {
  Activity,
  GitCommit,
  Globe2,
  Package,
  Radio,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Repo } from "@/lib/types";
import type { NpmPackageRow } from "@/lib/npm";
import type { Launch } from "@/lib/producthunt";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import type { MentionItem } from "./MentionMeta";

interface RepoSignalSnapshotProps {
  repo: Repo;
  mentions: MentionItem[];
  npmPackages: NpmPackageRow[];
  productHuntLaunch: Launch | null;
}

interface SnapshotCard {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "up" | "warning" | "default";
}

const DAY_MS = 86_400_000;

function countSince(mentions: MentionItem[], cutoffMs: number): number {
  return mentions.filter((mention) => Date.parse(mention.createdAt) >= cutoffMs)
    .length;
}

function formatDelta(value: number): string {
  if (value === 0) return "0";
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function packageDownloads(
  packages: NpmPackageRow[],
  selector: (pkg: NpmPackageRow) => number,
): number {
  return packages.reduce((sum, pkg) => sum + Math.max(0, selector(pkg)), 0);
}

export function RepoSignalSnapshot({
  repo,
  mentions,
  npmPackages,
  productHuntLaunch,
}: RepoSignalSnapshotProps): JSX.Element {
  const nowMs = Date.now();
  const mentions24h = countSince(mentions, nowMs - DAY_MS);
  const mentions7d = countSince(mentions, nowMs - 7 * DAY_MS);
  const sourceCount = new Set(mentions.map((mention) => mention.source)).size;
  const downloads24h = packageDownloads(npmPackages, (pkg) => pkg.downloads24h);
  const downloads7d = packageDownloads(npmPackages, (pkg) => pkg.downloads7d);
  const downloads30d = packageDownloads(npmPackages, (pkg) => pkg.downloads30d);
  const hasProjectSurface = npmPackages.length > 0 || productHuntLaunch != null;

  const cards: SnapshotCard[] = [
    {
      label: "GitHub momentum",
      value: repo.momentumScore.toFixed(1),
      detail: `${formatDelta(repo.starsDelta24h)} stars 24h | ${formatDelta(repo.starsDelta7d)} 7d`,
      icon: Activity,
      tone: repo.starsDelta24h > 0 ? "up" : "default",
    },
    {
      label: "Mentions",
      value: formatNumber(mentions7d),
      detail: `${formatNumber(mentions24h)} in 24h | ${sourceCount} source${sourceCount === 1 ? "" : "s"}`,
      icon: Radio,
      tone: mentions7d > 0 ? "up" : "default",
    },
    {
      label: "Cross-signal",
      value: (repo.crossSignalScore ?? 0).toFixed(2),
      detail: `${repo.channelsFiring ?? 0}/5 channels firing`,
      icon: Activity,
      tone: (repo.channelsFiring ?? 0) >= 2 ? "up" : "default",
    },
    {
      label: "Package adoption",
      value: npmPackages.length > 0 ? formatNumber(downloads7d) : "-",
      detail:
        npmPackages.length > 0
          ? `${formatNumber(downloads24h)} 24h | ${formatNumber(downloads30d)} 30d`
          : "no linked package yet",
      icon: Package,
      tone: npmPackages.length > 0 ? "up" : "default",
    },
    {
      label: "Project surface",
      value: hasProjectSurface ? "linked" : "thin",
      detail: productHuntLaunch
        ? "ProductHunt launch attached"
        : repo.lastCommitAt
          ? `last commit ${getRelativeTime(repo.lastCommitAt)}`
          : "website/package scan pending",
      icon: hasProjectSurface ? Globe2 : GitCommit,
      tone: hasProjectSurface ? "up" : "warning",
    },
  ];

  return (
    <section
      aria-label="Signal snapshot"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-card border border-border-primary bg-bg-card p-3 shadow-card"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                {card.label}
              </span>
              <Icon
                className={
                  card.tone === "up"
                    ? "size-3.5 text-up"
                    : card.tone === "warning"
                      ? "size-3.5 text-warning"
                      : "size-3.5 text-text-tertiary"
                }
                aria-hidden
              />
            </div>
            <div
              className={
                card.tone === "up"
                  ? "mt-2 font-mono text-2xl font-semibold leading-none text-up tabular-nums"
                  : "mt-2 font-mono text-2xl font-semibold leading-none text-text-primary tabular-nums"
              }
            >
              {card.value}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-text-tertiary">
              {card.detail}
            </p>
          </div>
        );
      })}
    </section>
  );
}

export default RepoSignalSnapshot;
