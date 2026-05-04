// /mcp/[slug] — per-MCP detail page (H3.1-H3.5).
//
// Server component. Resolves the MCP from the same publish payload the
// /mcp leaderboard uses, via `getMcpDetailBySlug`. 404 when the slug
// doesn't match any item in the current roster.
//
// Sections (top → bottom):
//   1. Header                  — name, vendor, package, source links
//   2. Liveness pill           — reuses LivenessPill (4-state classifier)
//   3. Stats strip             — weekly DLs (npm/pypi split), tools, last
//                                release, smithery rank, registries
//   4. Weekly download chart   — sparkline when history exists, else
//                                "Building 7-day chart…" placeholder
//   5. Recent releases         — single most recent release until the
//                                fetcher is extended (TODO inline)
//   6. Manifest preview        — tools list when populated, else placeholder
//   7. Recent mentions panel   — placeholder ("Coming soon") — corpus is
//                                not MCP-specific yet and live scraping in
//                                a server component would be too costly.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  getMcpDetailBySlug,
  readMcpDownloadsHistory,
  readMcpManifestTools,
} from "@/lib/mcp-detail";
import type { EcosystemLeaderboardItem } from "@/lib/ecosystem-leaderboards";
import { LivenessPill, classifyLiveness } from "@/components/signal/LivenessPill";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { TerminalBar } from "@/components/v2";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { mcpEntityLogoUrl } from "@/lib/logos";
import { McpDownloadsSparklineLazy } from "./_components/McpDownloadsSparklineLazy";

// force-dynamic mirrors the /mcp index page's posture: data is read at
// request time from the publish payload, which is small (~few KB) and
// cheap to refresh.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = await getMcpDetailBySlug(slug);
  const canonical = absoluteUrl(`/mcp/${slug}`);

  if (!item) {
    return {
      title: `MCP Not Found — ${SITE_NAME}`,
      description: `We don't have this MCP server in the ${SITE_NAME} terminal yet.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const title = `${item.title} — ${SITE_NAME}`;
  const description =
    item.description?.trim() ||
    `${item.title}${item.vendor ? ` by ${item.vendor}` : ""} — Model Context Protocol server tracked on ${SITE_NAME}.`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function McpDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const item = await getMcpDetailBySlug(slug);
  if (!item) notFound();

  const mcp = item.mcp;
  const livenessClass = classifyLiveness(item.liveness);

  // Manifest tool list. Today the pinger writes only a count, so the read
  // returns [] for every server. The page renders a placeholder when empty.
  const tools = await readMcpManifestTools(item.id);

  // Downloads history. Reader returns null when the rolling-buffer key
  // isn't populated (which is the case today — npm-downloads writes a
  // single point-in-time, not history).
  const history = mcp?.packageName
    ? await readMcpDownloadsHistory(mcp.packageName)
    : null;
  const hasHistory = Array.isArray(history) && history.length >= 2;

  // Source links. We surface the canonical url (registry / vendor page),
  // the linked GitHub repo when known, the npm/pypi package page when the
  // package name is known, and the Smithery page when crossSourceCount
  // implies it's listed there.
  const sourceLinks = buildSourceLinks(item);

  // Last release: our cached side-channel only carries the most recent
  // ISO timestamp. TODO: extend `apps/trendingrepo-worker/src/fetchers/npm-downloads/`
  // to capture the last 5 releases so we can render a real list here.
  const lastReleaseAt = mcp?.lastReleaseAt ?? null;
  const isNewThisWeek =
    lastReleaseAt &&
    Date.now() - Date.parse(lastReleaseAt) < SEVEN_DAYS_MS;

  return (
    <main className="v4-root font-mono">
      <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-[11px] text-text-tertiary"
        >
          <Link href="/" className="hover:text-text-primary">
            Home
          </Link>
          <span aria-hidden>/</span>
          <Link href="/mcp" className="hover:text-text-primary">
            MCP
          </Link>
          <span aria-hidden>/</span>
          <span className="truncate text-text-primary">{item.title}</span>
        </nav>

        {/* V2 terminal-bar header */}
        <div className="v2-frame overflow-hidden">
          <TerminalBar
            label={`// MCP · ${item.title.toUpperCase()}`}
            status={
              <span className="inline-flex items-center gap-2">
                <LivenessPill liveness={item.liveness} />
                <span>{livenessClass.uptime7d !== null
                  ? `${(livenessClass.uptime7d * 100).toFixed(1)}% UPTIME`
                  : "STATUS"}</span>
              </span>
            }
            live={livenessClass.state === "live"}
          />
        </div>

        {/* 1. Header */}
        <Header item={item} sourceLinks={sourceLinks} />

        {/* 3. Stats strip */}
        <StatsStrip item={item} />

        {/* 4. Weekly download sparkline */}
        <Section title="Weekly Downloads · 7d">
          {hasHistory ? (
            <McpDownloadsSparklineLazy points={history!} />
          ) : (
            <Placeholder>Building 7-day chart…</Placeholder>
          )}
        </Section>

        {/* 5. Recent releases */}
        <Section title="Recent Releases">
          {lastReleaseAt ? (
            <ul className="space-y-1.5 text-[12px]">
              <li className="flex items-center justify-between border-b border-border-primary/60 py-1.5">
                <span className="text-text-secondary">
                  {mcp?.packageName ? mcp.packageName : item.title}
                </span>
                <div className="flex items-center gap-2 text-[11px] tabular-nums text-text-tertiary">
                  <time dateTime={lastReleaseAt} title={lastReleaseAt}>
                    {fmtRelativeAge(lastReleaseAt)}
                  </time>
                  {isNewThisWeek ? (
                    <span
                      className="v2-mono inline-flex items-center px-1.5 py-px text-[9px] uppercase tracking-[0.14em]"
                      style={{
                        border: "1px solid var(--v4-acc)66",
                        background: "var(--v4-acc)1A",
                        color: "var(--v4-acc)",
                        borderRadius: 2,
                      }}
                    >
                      new
                    </span>
                  ) : null}
                </div>
              </li>
              {/* TODO: extend apps/trendingrepo-worker/src/fetchers/npm-downloads
                  to capture the last 5 releases so this list can render real
                  history. Today the side-channel carries only `lastReleaseAt`. */}
            </ul>
          ) : (
            <Placeholder>No release information yet.</Placeholder>
          )}
        </Section>

        {/* 6. Manifest preview */}
        <Section title={`Manifest Preview${tools.length > 0 ? ` · ${tools.length} tools` : ""}`}>
          {tools.length > 0 ? (
            <ul className="divide-y divide-border-primary/60 text-[12px]">
              {tools.map((tool) => (
                <li key={tool.name} className="flex flex-col gap-0.5 py-1.5">
                  <span
                    className="font-mono"
                    style={{ color: "var(--v4-ink-100)" }}
                  >
                    {tool.name}
                  </span>
                  {tool.description ? (
                    <span className="text-[11px] text-text-tertiary">
                      {tool.description}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Placeholder>
              Tool list pending — manifest hasn&apos;t been pinged yet.
            </Placeholder>
          )}
        </Section>

        {/* 7. Recent mentions */}
        <Section title="Recent Mentions">
          <Placeholder>
            Coming soon — cross-platform MCP mention tracking is on the
            roadmap. Today&apos;s mentions corpus indexes repos, not MCPs.
          </Placeholder>
        </Section>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Local components
// ---------------------------------------------------------------------------

interface SourceLinks {
  canonical: { href: string; label: string };
  github?: { href: string; label: string };
  npm?: { href: string; label: string };
  pypi?: { href: string; label: string };
  smithery?: { href: string; label: string };
}

function buildSourceLinks(item: EcosystemLeaderboardItem): SourceLinks {
  const links: SourceLinks = {
    canonical: { href: item.url, label: hostnameOf(item.url) ?? "open" },
  };
  if (item.linkedRepo) {
    links.github = {
      href: `https://github.com/${item.linkedRepo}`,
      label: "github",
    };
  }
  const pkg = item.mcp?.packageName;
  const reg = item.mcp?.packageRegistry;
  if (pkg && reg === "npm") {
    links.npm = {
      href: `https://www.npmjs.com/package/${encodeURIComponent(pkg)}`,
      label: "npm",
    };
  } else if (pkg && reg === "pypi") {
    links.pypi = {
      href: `https://pypi.org/project/${encodeURIComponent(pkg)}/`,
      label: "pypi",
    };
  }
  // Smithery presence is implied by crossSourceCount >= 2 OR by the slug
  // shape (vendor/package). Surface the directory page when applicable.
  if (item.crossSourceCount >= 2 && item.id.includes("/")) {
    links.smithery = {
      href: `https://smithery.ai/server/${encodeURIComponent(item.id)}`,
      label: "smithery",
    };
  }
  return links;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function Header({
  item,
  sourceLinks,
}: {
  item: EcosystemLeaderboardItem;
  sourceLinks: SourceLinks;
}) {
  return (
    <header className="rounded-card border border-border-primary bg-bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <EntityLogo
            src={mcpEntityLogoUrl(item, 40)}
            name={item.title}
            size={40}
            shape="square"
            alt=""
          />
          <div className="min-w-0 flex-1">
            <h1
              className="truncate text-[18px] font-semibold sm:text-[20px]"
              style={{ color: "var(--v4-ink-000)" }}
            >
              {item.title}
            </h1>
            <p className="truncate text-[12px] text-text-tertiary">
              {item.vendor ?? item.linkedRepo ?? "MCP server"}
              {item.mcp?.packageName ? (
                <>
                  <span aria-hidden> · </span>
                  <span className="font-mono">{item.mcp.packageName}</span>
                </>
              ) : null}
            </p>
          </div>
          <LivenessPill liveness={item.liveness} />
        </div>

        {item.description ? (
          <p
            className="text-[13px] leading-relaxed"
            style={{ color: "var(--v4-ink-200)" }}
          >
            {item.description}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {Object.values(sourceLinks)
            .filter((l): l is { href: string; label: string } => Boolean(l))
            .map((link) => (
              <a
                key={`${link.label}-${link.href}`}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="v2-mono inline-flex items-center px-2 py-px uppercase tracking-[0.14em] hover:underline"
                style={{
                  border: "1px solid var(--v4-line-200)",
                  background: "var(--v4-bg-100)",
                  color: "var(--v4-ink-200)",
                  borderRadius: 2,
                  fontSize: 10,
                }}
              >
                {link.label}
              </a>
            ))}
        </div>
      </div>
    </header>
  );
}

function StatsStrip({ item }: { item: EcosystemLeaderboardItem }) {
  const mcp = item.mcp;
  const stats: Array<{ label: string; value: string; title?: string }> = [];

  if (mcp?.downloadsCombined7d !== null && mcp?.downloadsCombined7d !== undefined) {
    const npm = mcp.npmDownloads7d ?? 0;
    const pypi = mcp.pypiDownloads7d ?? 0;
    const split =
      npm > 0 && pypi > 0
        ? `npm ${fmtCompact(npm)} · pypi ${fmtCompact(pypi)}`
        : undefined;
    stats.push({
      label: "Weekly DL",
      value: fmtCompact(mcp.downloadsCombined7d),
      title: split,
    });
  }
  if (mcp?.toolCount !== null && mcp?.toolCount !== undefined) {
    stats.push({ label: "Tools", value: String(mcp.toolCount) });
  }
  if (mcp?.lastReleaseAt) {
    stats.push({
      label: "Last Release",
      value: fmtRelativeAge(mcp.lastReleaseAt),
      title: mcp.lastReleaseAt,
    });
  }
  if (
    mcp?.smitheryRank !== null &&
    mcp?.smitheryRank !== undefined &&
    mcp?.smitheryTotal !== null &&
    mcp?.smitheryTotal !== undefined
  ) {
    stats.push({
      label: "Smithery",
      value: `#${mcp.smitheryRank} / ${mcp.smitheryTotal}`,
    });
  }
  stats.push({
    label: "Registries",
    value: `${item.crossSourceCount}`,
  });
  if (mcp?.npmDependents !== null && mcp?.npmDependents !== undefined) {
    stats.push({
      label: "Dependents",
      value: fmtCompact(mcp.npmDependents),
    });
  }
  if (typeof item.signalScore === "number") {
    stats.push({ label: "Hotness", value: String(Math.round(item.signalScore)) });
  }

  if (stats.length === 0) return null;

  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border-primary bg-border-primary text-[12px] sm:grid-cols-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex flex-col gap-0.5 bg-bg-card px-3 py-2"
          title={s.title}
        >
          <span className="text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
            {s.label}
          </span>
          <span
            className="font-mono tabular-nums"
            style={{ color: "var(--v4-ink-000)" }}
          >
            {s.value}
          </span>
        </div>
      ))}
    </section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border-primary bg-bg-card">
      <header className="flex items-center justify-between border-b border-border-primary px-3 py-2">
        <h2 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
          {title}
        </h2>
      </header>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] italic text-text-tertiary">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Formatters (duplicated from McpCells to keep that file untouched — small
// and stable enough that DRY isn't worth the cross-import).
// ---------------------------------------------------------------------------

function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function fmtRelativeAge(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const days = diff / 86_400_000;
  if (days < 1) {
    const hours = Math.max(1, Math.round(diff / 3_600_000));
    return `${hours}h ago`;
  }
  if (days < 30) return `${Math.round(days)}d ago`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}
