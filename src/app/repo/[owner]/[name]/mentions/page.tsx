import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { buildCanonicalRepoProfile } from "@/lib/api/repo-profile";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { safeJsonLd } from "@/lib/seo";
import { buildRepoSubpageSchema } from "@/lib/seo-repo-schemas";
import { formatNumber } from "@/lib/utils";
import { MENTION_SOURCE_LABELS, toMentionItem, type MentionItem } from "@/components/repo-detail/MentionMeta";

export const revalidate = 300;

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

interface PageProps {
  params: Promise<{ owner: string; name: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { owner, name } = await params;
  return {
    title: `${owner}/${name} mentions`,
    description: `Timeline and per-source mention breakdown for ${owner}/${name}.`,
  };
}

function buildTimeline(mentions: MentionItem[]): Array<{ day: string; count: number }> {
  const now = new Date();
  const out: Array<{ day: string; count: number }> = [];
  const dayMap = new Map<string, number>();
  for (const mention of mentions) {
    const key = mention.createdAt.slice(0, 10);
    dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
  }
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: dayMap.get(key) ?? 0 });
  }
  return out;
}

export default async function RepoMentionsPage({ params }: PageProps) {
  const { owner, name } = await params;
  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) notFound();

  const baseRepo = getDerivedRepoByFullName(`${owner}/${name}`);
  if (!baseRepo) notFound();

  const profile = await buildCanonicalRepoProfile(baseRepo.fullName);
  if (!profile) notFound();

  const mentions = profile.mentions.recent
    .map(toMentionItem)
    .filter((item): item is MentionItem => item !== null);

  const timeline = buildTimeline(mentions);
  const timelineMax = Math.max(1, ...timeline.map((point) => point.count));
  const countsBySource = Object.entries(profile.mentions.countsBySource)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const pageTitle = `${profile.repo.fullName} mentions`;
  const pageDescription = `Timeline and per-source mention breakdown for ${profile.repo.fullName}.`;
  const jsonLd = buildRepoSubpageSchema({
    owner: profile.repo.owner,
    name: profile.repo.name,
    pagePath: `/repo/${profile.repo.owner}/${profile.repo.name}/mentions`,
    pageTitle,
    description: pageDescription,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <main className="home-surface mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
        <section className="v2-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="v2-mono text-[10px] text-text-tertiary">{`// ${profile.repo.fullName.toUpperCase()} · MENTIONS`}</div>
            <h1 className="mt-1 text-2xl font-semibold text-text-primary">Mentions Timeline</h1>
            <p className="mt-1 text-sm text-text-secondary">30-day trend plus per-source breakdown.</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/repo/${owner}/${name}`} className="btn">Back to repo</Link>
            <Link href={`/repo/${owner}/${name}/star-activity`} className="btn">Star activity</Link>
          </div>
        </div>
      </section>

      <section className="v2-card mt-4 p-4 md:p-5">
        <div className="v2-mono text-[10px] text-text-tertiary">{"// LAST 30 DAYS"}</div>
        {mentions.length === 0 ? (
          <div className="mt-3 rounded-card border border-border-primary bg-bg-secondary p-4 text-sm text-text-secondary">
            No mentions found for this repo yet. Data will appear here once the mention pipeline ingests matching signals.
          </div>
        ) : (
          <div className="mt-3">
            <div className="flex h-40 items-end gap-1 overflow-x-auto rounded-card border border-border-primary bg-bg-secondary p-2">
              {timeline.map((point) => (
                <div key={point.day} className="flex min-w-[10px] flex-1 flex-col justify-end" title={`${point.day}: ${point.count}`}>
                  <div
                    className="rounded-sm bg-brand"
                    style={{ height: `${Math.max(4, (point.count / timelineMax) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-text-tertiary">
              <span>{timeline[0]?.day}</span>
              <span>{timeline[timeline.length - 1]?.day}</span>
            </div>
          </div>
        )}
      </section>

      <section className="v2-card mt-4 p-4 md:p-5">
        <div className="v2-mono text-[10px] text-text-tertiary">{"// PER-SOURCE BREAKDOWN"}</div>
        {countsBySource.length === 0 ? (
          <div className="mt-3 rounded-card border border-border-primary bg-bg-secondary p-4 text-sm text-text-secondary">
            No source counts available yet.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {countsBySource.map(([source, count]) => (
              <article key={source} className="rounded-card border border-border-primary bg-bg-secondary p-3">
                <div className="text-xs text-text-tertiary">{MENTION_SOURCE_LABELS[source as keyof typeof MENTION_SOURCE_LABELS] ?? source}</div>
                <div className="mt-1 text-xl font-semibold text-text-primary tabular-nums">{formatNumber(count)}</div>
              </article>
            ))}
          </div>
        )}
        </section>
      </main>
    </>
  );
}
