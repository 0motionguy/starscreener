// /compare/[owner]/[name]/vs/[owner]/[name] — head-to-head repo comparison.
//
// Catch-all so the owner/name slashes survive in the URL. The page 200s only
// when BOTH repos exist in our index (else 404) — that gate bounds the
// surface to real, comparable pairs. Each page is differentiated: side-by-side
// live metrics, each repo's consensus verdict, a data-grounded "which leads"
// call, and a "Should I use X or Y?" FAQ. ISR; data-store reads only.

import { notFound } from "next/navigation";
import Link from "next/link";

import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshAllMentionStores } from "@/lib/refresh-mentions";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import {
  refreshConsensusVerdictsFromStore,
  getConsensusItemReport,
} from "@/lib/consensus-verdicts";
import {
  parseComparePath,
  comparePath,
  buildCompareFaq,
  compareLeader,
} from "@/lib/compare-pairs";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { buildBreadcrumbJsonLd, buildFaqJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { SeoFaq } from "@/components/seo/SeoFaq";
import { Icon } from "@/components/icon/Icon";
import type { Repo } from "@/lib/types";

export const revalidate = 1800;

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

function fmt(n: number | undefined): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n ?? 0);
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}
function mentions(r: Repo): number {
  return r.mentions?.total24h ?? r.mentionCount24h ?? 0;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const pair = parseComparePath(slug);
  if (!pair) return { title: `Compare repos — ${SITE_NAME}` };
  const aName = pair.a.split("/")[1] ?? pair.a;
  const bName = pair.b.split("/")[1] ?? pair.b;
  const title = `${pair.a} vs ${pair.b}: momentum, stars & trend comparison | ${SITE_NAME}`;
  const description = `${aName} vs ${bName} — compare GitHub stars, momentum, star velocity and cross-source mentions side by side. Live data from TrendingRepo.`;
  const canonicalPath = comparePath(pair.a, pair.b);
  const canonical = absoluteUrl(canonicalPath);
  const ogPath = `/api/og/compare${canonicalPath.replace(/^\/compare/, "")}`;
  return {
    title: `${aName} vs ${bName}: stars, momentum & trends | ${SITE_NAME}`,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: [{ url: ogPath, width: 1200, height: 630, alt: `${pair.a} vs ${pair.b}` }],
    },
    twitter: { card: "summary_large_image" as const, title, description, images: [ogPath] },
  };
}

function MetricRow({
  label,
  aVal,
  bVal,
  aWins,
  bWins,
}: {
  label: string;
  aVal: string;
  bVal: string;
  aWins?: boolean;
  bWins?: boolean;
}) {
  return (
    <tr>
      <td>{label}</td>
      <td className={`num${aWins ? " up-text" : ""}`}>{aVal}</td>
      <td className={`num${bWins ? " up-text" : ""}`}>{bVal}</td>
    </tr>
  );
}

export default async function ComparePage({ params }: PageProps) {
  const { slug } = await params;
  const pair = parseComparePath(slug);
  if (!pair) notFound();

  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoRegistryFromStore().catch(() => undefined),
    refreshAllMentionStores().catch(() => undefined),
    refreshConsensusVerdictsFromStore().catch(() => undefined),
  ]);

  const repoA = (() => {
    try {
      return getDerivedRepoByFullName(pair.a);
    } catch {
      return null;
    }
  })();
  const repoB = (() => {
    try {
      return getDerivedRepoByFullName(pair.b);
    } catch {
      return null;
    }
  })();
  if (!repoA || !repoB) notFound();

  const verdictA = (() => {
    try {
      return getConsensusItemReport(repoA.fullName);
    } catch {
      return null;
    }
  })();
  const verdictB = (() => {
    try {
      return getConsensusItemReport(repoB.fullName);
    } catch {
      return null;
    }
  })();

  const leader = compareLeader(repoA, repoB);
  const faq = buildCompareFaq(repoA, repoB);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: "/tools/compare" },
    { name: `${repoA.name} vs ${repoB.name}`, path: comparePath(pair.a, pair.b) },
  ]);
  const faqLd = buildFaqJsonLd(faq);

  const blurbA = verdictA?.tagline?.trim() || verdictA?.summary?.trim() || repoA.description || "";
  const blurbB = verdictB?.tagline?.trim() || verdictB?.summary?.trim() || repoB.description || "";

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      <JsonLd data={faqLd} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">
          {repoA.name} vs {repoB.name}
        </span>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">
          <Icon name="swap" size={14} /> Head-to-head
        </div>
        <h1>
          {repoA.fullName} vs {repoB.fullName}
        </h1>
        <p>
          A live side-by-side comparison of {repoA.name} and {repoB.name} — GitHub stars, momentum
          score, star velocity and cross-source mentions, refreshed continuously.{" "}
          {leader.tie ? (
            <>Both are closely matched on momentum right now.</>
          ) : (
            <>
              <strong>{leader.winnerFullName}</strong> currently leads on cross-source momentum.
            </>
          )}
        </p>
      </header>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{"▌"} <b>Side-by-side metrics</b></h2>
        </div>
        <table className="tdata">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="num">
                <Link href={`/repo/${repoA.owner}/${repoA.name}`} prefetch={false}>
                  {repoA.fullName}
                </Link>
              </th>
              <th className="num">
                <Link href={`/repo/${repoB.owner}/${repoB.name}`} prefetch={false}>
                  {repoB.fullName}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            <MetricRow
              label="GitHub stars"
              aVal={fmt(repoA.stars)}
              bVal={fmt(repoB.stars)}
              aWins={(repoA.stars ?? 0) > (repoB.stars ?? 0)}
              bWins={(repoB.stars ?? 0) > (repoA.stars ?? 0)}
            />
            <MetricRow
              label="Momentum score"
              aVal={String(Math.round(repoA.momentumScore ?? 0))}
              bVal={String(Math.round(repoB.momentumScore ?? 0))}
              aWins={(repoA.momentumScore ?? 0) > (repoB.momentumScore ?? 0)}
              bWins={(repoB.momentumScore ?? 0) > (repoA.momentumScore ?? 0)}
            />
            <MetricRow
              label="Stars · 24h"
              aVal={fmt(repoA.starsDelta24h)}
              bVal={fmt(repoB.starsDelta24h)}
              aWins={(repoA.starsDelta24h ?? 0) > (repoB.starsDelta24h ?? 0)}
              bWins={(repoB.starsDelta24h ?? 0) > (repoA.starsDelta24h ?? 0)}
            />
            <MetricRow
              label="Stars · 7d"
              aVal={fmt(repoA.starsDelta7d)}
              bVal={fmt(repoB.starsDelta7d)}
              aWins={(repoA.starsDelta7d ?? 0) > (repoB.starsDelta7d ?? 0)}
              bWins={(repoB.starsDelta7d ?? 0) > (repoA.starsDelta7d ?? 0)}
            />
            <MetricRow
              label="Mentions · 24h"
              aVal={fmt(mentions(repoA))}
              bVal={fmt(mentions(repoB))}
              aWins={mentions(repoA) > mentions(repoB)}
              bWins={mentions(repoB) > mentions(repoA)}
            />
            <MetricRow label="Language" aVal={repoA.language ?? "—"} bVal={repoB.language ?? "—"} />
            <MetricRow label="Created" aVal={fmtDate(repoA.createdAt)} bVal={fmtDate(repoB.createdAt)} />
          </tbody>
        </table>
      </div>

      <div className="grid g-2">
        <article className="card">
          <div className="card-head">
            <h2 className="card-title">
              <Link href={`/repo/${repoA.owner}/${repoA.name}`} prefetch={false}>{repoA.fullName}</Link>
            </h2>
          </div>
          <div className="card-body">
            <p className="muted">{blurbA || "No analysis available yet."}</p>
          </div>
        </article>
        <article className="card">
          <div className="card-head">
            <h2 className="card-title">
              <Link href={`/repo/${repoB.owner}/${repoB.name}`} prefetch={false}>{repoB.fullName}</Link>
            </h2>
          </div>
          <div className="card-body">
            <p className="muted">{blurbB || "No analysis available yet."}</p>
          </div>
        </article>
      </div>

      <SeoFaq entries={faq} title={`${repoA.name} vs ${repoB.name} — FAQ`} headingId="compare-faq-head" />
    </div>
  );
}
