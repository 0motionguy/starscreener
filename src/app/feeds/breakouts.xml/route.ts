// StarScreener — /feeds/breakouts.xml
//
// RSS 2.0 feed of the top cross-signal breakout repos. Matches the default
// filter on /breakouts: `channelsFiring >= 2` (multi-channel signal — the
// page's "multi" tab), sorted by crossSignalScore descending. Top 30.
// Repos in `movementStatus === "breakout"` are surfaced first (they jump to
// the top of the sort via an epsilon boost), but we don't hard-require the
// status label because it can temporarily drop to `rising`/`hot` between
// recomputes while the cross-signal score stays elevated.
//
// Static with hourly-ish revalidation — breakouts change infrequently and
// feeds are usually polled by aggregators every few minutes, so cache
// headers handle the bulk of traffic without hitting derived-repos.

import { getDerivedRepos } from "@/lib/derived-repos";
import { getRepoReasons } from "@/lib/repo-reasons";
import { renderRssFeed, type RssItem } from "@/lib/feeds/rss";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const revalidate = 1800; // 30 minutes

const MAX_ITEMS = 30;

function pickPubDate(lastCommitAt: string, lastReleaseAt: string | null): string {
  const commit = Date.parse(lastCommitAt);
  const release = lastReleaseAt ? Date.parse(lastReleaseAt) : NaN;
  const candidates: number[] = [];
  if (Number.isFinite(commit)) candidates.push(commit);
  if (Number.isFinite(release)) candidates.push(release);
  if (candidates.length === 0) return new Date().toISOString();
  return new Date(Math.max(...candidates)).toISOString();
}

function buildDescription(
  description: string,
  reasonHeadline: string | null,
  stars: number,
  score: number,
): string {
  const lines: string[] = [];
  if (reasonHeadline) {
    lines.push(`<p><strong>Why trending:</strong> ${reasonHeadline}</p>`);
  }
  if (description && description.trim().length > 0) {
    lines.push(`<p>${description}</p>`);
  }
  lines.push(
    `<p><em>${stars.toLocaleString("en-US")} stars · cross-signal score ${score.toFixed(2)}</em></p>`,
  );
  return lines.join("\n");
}

export async function GET(): Promise<Response> {
  const all = getDerivedRepos();

  // Primary gate: multi-channel firing (matches the /breakouts default tab).
  // Secondary sort: cross-signal score descending, with a tiny boost for
  // repos already labeled `breakout` so they rank above tied `hot`/`rising`
  // rows when the scores are close.
  const BREAKOUT_BOOST = 0.01;
  const scoreFor = (r: (typeof all)[number]): number =>
    (r.crossSignalScore ?? 0) +
    (r.movementStatus === "breakout" ? BREAKOUT_BOOST : 0);

  const breakouts = all
    .filter((r) => (r.channelsFiring ?? 0) >= 2)
    .sort((a, b) => scoreFor(b) - scoreFor(a))
    .slice(0, MAX_ITEMS);

  const items: RssItem[] = breakouts.map((repo) => {
    const reasons = getRepoReasons(repo.fullName);
    const topReason = reasons[0]?.headline ?? null;
    const link = absoluteUrl(`/repo/${repo.owner}/${repo.name}`);
    const pubDate = pickPubDate(repo.lastCommitAt, repo.lastReleaseAt);
    const firing = repo.channelsFiring ?? 0;
    const statusLabel =
      repo.movementStatus === "breakout"
        ? "breakout"
        : `${firing}-channel signal`;
    return {
      title: `${repo.fullName} — ${statusLabel}`,
      link,
      guid: link,
      pubDate,
      description: buildDescription(
        repo.description ?? "",
        topReason,
        repo.stars,
        repo.crossSignalScore ?? 0,
      ),
      author: repo.owner,
      categories: [repo.categoryId, repo.language ?? ""].filter(Boolean),
    };
  });

  const feedLink = absoluteUrl("/feeds/breakouts.xml");
  const xml = renderRssFeed({
    title: `${SITE_NAME} — Cross-Signal Breakouts`,
    link: feedLink,
    description:
      "Top open-source repos firing across multiple signals (GitHub momentum + Reddit + Hacker News).",
    lastBuildDate: new Date().toISOString(),
    items,
  });

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
