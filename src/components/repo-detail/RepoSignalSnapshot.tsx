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
  /** Long-form explanation surfaced via `title` on the card. */
  explainer: string;
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
      explainer:
        "Momentum score (0-100): recent star velocity normalized against the repo's own 30-day baseline and language-tier peers. 80+ breakout · 50+ rising · 25+ active · <25 stable/declining.",
    },
    {
      label: "Mentions",
      value: formatNumber(mentions7d),
      detail: `${formatNumber(mentions24h)} in 24h | ${sourceCount} source${sourceCount === 1 ? "" : "s"}`,
      icon: Radio,
      tone: mentions7d > 0 ? "up" : "default",
      explainer:
        "7-day mentions: unique posts across Reddit, HackerNews, Bluesky, dev.to, ProductHunt, and tracked Twitter/X accounts that reference this repo. Dedup by URL + source id.",
    },
    {
      label: "Cross-signal",
      value: (repo.crossSignalScore ?? 0).toFixed(2),
      detail: `${repo.channelsFiring ?? 0}/5 channels firing`,
      icon: Activity,
      tone: (repo.channelsFiring ?? 0) >= 2 ? "up" : "default",
      explainer:
        "Cross-signal score (0-5): weighted sum of GitHub + Reddit + HN + Bluesky + dev.to components, each 0-1. 5.0 = strong signal across >=4 channels in 7d. 4.0 = strong on >=3. 3.0 = strong on >=2. 2.0+ = active on 1+. Below 1.0 = low or no cross-channel activity.",
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
      explainer:
        "npm weekly downloads summed across every package linked to this repo (0 when no package has been tied to the repo yet).",
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
      explainer:
        "Project surface: whether we've linked an npm package or ProductHunt launch to this repo. 'thin' means we only have the GitHub repository to go on.",
    },
  ];

  return (
    <section
      aria-label="Signal snapshot"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2"
    >
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const valueColor =
          card.tone === "up"
            ? "var(--v4-acc)"
            : card.tone === "warning"
              ? "var(--v4-amber)"
              : "var(--v4-ink-100)";
        const iconColor =
          card.tone === "up"
            ? "var(--v4-acc)"
            : card.tone === "warning"
              ? "var(--v4-amber)"
              : "var(--v4-ink-400)";
        return (
          <div
            key={card.label}
            title={card.explainer}
            style={{
              border: "1px solid var(--v4-line-200)",
              background: "var(--v4-bg-025)",
              borderRadius: 2,
              overflow: "hidden",
              padding: 12,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 10,
                  color: "var(--v4-ink-400)",
                }}
              >
                {`// 0${idx + 1} · ${card.label.toUpperCase()}`}
              </span>
              <Icon
                size={14}
                style={{ color: iconColor }}
                aria-hidden
              />
            </div>
            <div
              className="tabular-nums leading-none mt-2"
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 24,
                fontWeight: 510,
                color: valueColor,
              }}
            >
              {card.value}
            </div>
            <p
              className="mt-2 leading-snug"
              style={{
                fontSize: 11,
                color: "var(--v4-ink-300)",
              }}
            >
              {card.detail}
            </p>
          </div>
        );
      })}
    </section>
  );
}

export default RepoSignalSnapshot;
