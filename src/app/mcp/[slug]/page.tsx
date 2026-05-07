// /mcp/[slug] — V4 per-MCP detail page (ProfileTemplate consumer).
//
// Server component. Resolves the MCP from the same publish payload the
// /mcp leaderboard uses, via `getMcpDetailBySlug`. 404 when the slug
// doesn't match any item in the current roster.
//
// Layout (ProfileTemplate slots):
//   identity   — MCP name + author + tags + install command
//   verdict    — signal-score stamp + registry consensus highlights
//   kpiBand    — Stars · Downloads 7d · Tools · Registries
//   mainPanels — Overview (// 01) + Tools (// 02) + Downloads chart (// 03)
//   rightRail  — Install (// IN) + Sources (// SO) + Related (// RE)

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  getMcpDetailBySlug,
  readMcpDownloadsHistory,
  readMcpManifestTools,
} from "@/lib/mcp-detail";
import { getMcpSignalData } from "@/lib/ecosystem-leaderboards";
import type { EcosystemLeaderboardItem } from "@/lib/ecosystem-leaderboards";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import McpDownloadsSparklineLazy from "./_components/McpDownloadsSparklineLazy";

// ISR mirrors the /mcp index page's revalidate cadence.
export const revalidate = 1800;

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
// Helpers
// ---------------------------------------------------------------------------

function compactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  if (value === 0) return "0";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatAge(iso: string | null | undefined): string {
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

function buildInstallCommand(item: EcosystemLeaderboardItem): string | null {
  const pkg = item.mcp?.packageName;
  if (!pkg) return null;
  if (item.mcp?.packageRegistry === "npm") {
    return `npx -y ${pkg}`;
  }
  if (item.mcp?.packageRegistry === "pypi") {
    return `uvx ${pkg}`;
  }
  return null;
}

interface SourceLink {
  href: string;
  label: string;
}

function buildSourceLinks(item: EcosystemLeaderboardItem): SourceLink[] {
  const links: SourceLink[] = [];
  links.push({ href: item.url, label: hostnameOf(item.url) ?? "open" });
  if (item.linkedRepo) {
    links.push({
      href: `https://github.com/${item.linkedRepo}`,
      label: "github",
    });
  }
  const pkg = item.mcp?.packageName;
  const reg = item.mcp?.packageRegistry;
  if (pkg && reg === "npm") {
    links.push({
      href: `https://www.npmjs.com/package/${encodeURIComponent(pkg)}`,
      label: "npm",
    });
  } else if (pkg && reg === "pypi") {
    links.push({
      href: `https://pypi.org/project/${encodeURIComponent(pkg)}/`,
      label: "pypi",
    });
  }
  if (item.crossSourceCount >= 2 && item.id.includes("/")) {
    links.push({
      href: `https://smithery.ai/server/${encodeURIComponent(item.id)}`,
      label: "smithery",
    });
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

function slugForMcp(item: EcosystemLeaderboardItem): string {
  return encodeURIComponent((item.id ?? "").toLowerCase());
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function McpDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const item = await getMcpDetailBySlug(slug);
  if (!item) notFound();

  const mcp = item.mcp;

  // Manifest tool list. Today the pinger writes only a count, so the read
  // returns [] for every server. The page renders a placeholder when empty.
  const tools = await readMcpManifestTools(item.id);

  // Downloads history — populated only when the rolling-buffer fetcher is
  // online. Cold-start path: returns null and the chart panel is omitted.
  const downloadsHistory = mcp?.packageName
    ? await readMcpDownloadsHistory(mcp.packageName)
    : null;

  // Related MCPs from the same vendor or sharing tags. Ranked by registry
  // consensus → popularity. Cap at 6 so the rail card stays terse.
  const allMcp = await getMcpSignalData();
  const tagSet = new Set((item.tags ?? []).map((t) => t.toLowerCase()));
  const related = allMcp.board.items
    .filter((other) => {
      if (other.id === item.id) return false;
      if (item.vendor && other.vendor === item.vendor) return true;
      if (item.author && other.author === item.author) return true;
      if (tagSet.size > 0) {
        return (other.tags ?? []).some((t) => tagSet.has(t.toLowerCase()));
      }
      return false;
    })
    .sort((a, b) => {
      if ((b.crossSourceCount ?? 1) !== (a.crossSourceCount ?? 1)) {
        return (b.crossSourceCount ?? 1) - (a.crossSourceCount ?? 1);
      }
      return (b.popularity ?? 0) - (a.popularity ?? 0);
    })
    .slice(0, 6);

  const installCommand = buildInstallCommand(item);
  const sourceLinks = buildSourceLinks(item);
  const lastReleaseAt = mcp?.lastReleaseAt ?? null;
  const isNewThisWeek =
    lastReleaseAt && Date.now() - Date.parse(lastReleaseAt) < SEVEN_DAYS_MS;

  // KPI cells — Stars · Downloads · Tools · Registries.
  // Forks aren't tracked on MCP items (linked-repo data lives elsewhere),
  // so we surface 7d downloads there as "Mentions" proxy until cross-platform
  // MCP mention tracking lands.
  const stars =
    item.popularityLabel === "Stars" && typeof item.popularity === "number"
      ? item.popularity
      : (mcp?.starsTotal ?? null);
  const toolCount = mcp?.toolCount ?? tools.length;
  const downloads7d = mcp?.downloadsCombined7d ?? null;
  const author = item.vendor ?? item.author ?? item.linkedRepo ?? "MCP server";
  const sourcesArr = mcp?.sources ?? [];

  // VerdictRibbon tone — green for verified or 4-registry consensus, orange
  // by default, amber when only one registry lists this MCP (low confidence).
  const verdictTone: "acc" | "money" | "amber" =
    item.verified || (item.crossSourceCount ?? 1) >= 3
      ? "money"
      : (item.crossSourceCount ?? 1) <= 1
        ? "amber"
        : "acc";
  const consensusLabel =
    (item.crossSourceCount ?? 1) >= 3
      ? "strong consensus"
      : (item.crossSourceCount ?? 1) === 2
        ? "two-source"
        : "single-source";

  const identity = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h1 className="v4-page-head__h1">{item.title}</h1>
      <p className="v4-page-head__lede">
        {author}
        {mcp?.packageName ? (
          <>
            {" · "}
            <span style={{ color: "var(--v4-acc)" }}>{mcp.packageName}</span>
          </>
        ) : null}
      </p>
      {item.description ? (
        <p className="v4-page-head__lede">{item.description}</p>
      ) : null}
      {(item.tags ?? []).length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginTop: 4,
          }}
        >
          {item.tags.slice(0, 8).map((tag) => (
            <span
              key={tag}
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 10,
                padding: "2px 6px",
                border: "1px solid var(--v4-line-200)",
                color: "var(--v4-ink-300)",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  const kpiBand = (
    <KpiBand
      cells={[
        {
          label: "STARS",
          value: compactNumber(stars),
          sub: stars && stars > 0 ? "github" : "—",
          tone: "acc",
          pip: "var(--v4-acc)",
        },
        {
          label: "DOWNLOADS · 7D",
          value: compactNumber(downloads7d),
          sub: downloads7d ? "npm + pypi" : "no data",
          tone: "money",
          pip: "var(--v4-money)",
        },
        {
          label: "TOOLS",
          value:
            typeof toolCount === "number" && toolCount > 0
              ? String(toolCount)
              : "—",
          sub: tools.length > 0 ? "manifest" : "pending",
          pip: "var(--v4-blue)",
        },
        {
          label: "REGISTRIES",
          value: String(item.crossSourceCount ?? 0),
          sub: "cross-source",
          pip: "var(--v4-violet)",
        },
      ]}
    />
  );

  const mainPanels = (
    <>
      <SectionHead num="// 01" title="Overview" />
      <div className="v4-collection-rail-card">
        {item.description ? (
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-geist-sans), sans-serif",
              fontSize: 14,
              color: "var(--v4-ink-200)",
              lineHeight: 1.55,
            }}
          >
            {item.description}
          </p>
        ) : (
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              color: "var(--v4-ink-400)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            // No description published yet.
          </p>
        )}
        {lastReleaseAt ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              color: "var(--v4-ink-300)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            <span>// LAST RELEASE · {formatAge(lastReleaseAt)}</span>
            {isNewThisWeek ? (
              <span
                style={{
                  padding: "1px 6px",
                  border: "1px solid var(--v4-acc)",
                  color: "var(--v4-acc)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                }}
              >
                NEW
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <SectionHead
        num="// 02"
        title={`Tools${tools.length > 0 ? ` · ${tools.length}` : ""}`}
        meta={
          tools.length > 0 ? undefined : (
            <span style={{ color: "var(--v4-ink-400)" }}>// MANIFEST PENDING</span>
          )
        }
      />
      {tools.length > 0 ? (
        <ul className="v4-collection-rail-list">
          {tools.map((tool) => (
            <li key={tool.name} className="v4-collection-rail-list__item">
              <div
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    color: "var(--v4-ink-100)",
                    fontSize: 13,
                  }}
                >
                  {tool.name}
                </span>
                {tool.description ? (
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-geist-sans), sans-serif",
                      color: "var(--v4-ink-300)",
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {tool.description}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="v4-collection-rail-card">
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              color: "var(--v4-ink-400)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            // Tool list pending — manifest hasn&apos;t been pinged yet.
          </p>
        </div>
      )}

      {downloadsHistory && downloadsHistory.length > 0 ? (
        <>
          <SectionHead
            num="// 03"
            title="Downloads · 7d"
            meta={
              <>
                npm + pypi · <b>{compactNumber(downloads7d)}</b>
              </>
            }
          />
          <div className="v4-collection-rail-card" style={{ padding: 14 }}>
            <McpDownloadsSparklineLazy points={downloadsHistory} />
          </div>
        </>
      ) : null}
    </>
  );

  const rightRail = (
    <>
      <SectionHead num="// IN" title="Install" as="h3" />
      {installCommand ? (
        <div className="v4-collection-rail-card">
          <div
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              color: "var(--v4-ink-400)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            // RUN VIA {mcp?.packageRegistry === "npm" ? "NPX" : "UVX"}
          </div>
          <pre
            style={{
              margin: 0,
              padding: "8px 10px",
              background: "var(--v4-bg-100)",
              border: "1px solid var(--v4-line-200)",
              color: "var(--v4-ink-100)",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 12,
              lineHeight: 1.4,
              overflowX: "auto",
            }}
          >
            <code>{installCommand}</code>
          </pre>
        </div>
      ) : (
        <div className="v4-collection-rail-card">
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              color: "var(--v4-ink-400)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            // No package registered.
          </p>
        </div>
      )}

      <SectionHead num="// SO" title="Sources" as="h3" />
      <ul className="v4-collection-rail-list">
        {sourceLinks.map((link) => (
          <li key={`${link.label}-${link.href}`} className="v4-collection-rail-list__item">
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="v4-collection-rail-list__link"
            >
              <span style={{ color: "var(--v4-ink-200)" }}>{link.label}</span>
              <span style={{ color: "var(--v4-acc)" }}>↗</span>
            </a>
          </li>
        ))}
      </ul>

      <SectionHead num="// RG" title="Registries" as="h3" />
      <div className="v4-collection-rail-card">
        <div className="v4-collection-rail-card__row">
          <span className="v4-collection-rail-card__label">Listed in</span>
          <span className="v4-collection-rail-card__value">
            {item.crossSourceCount ?? 0} of 4
          </span>
        </div>
        {sourcesArr.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              marginTop: 4,
            }}
          >
            {sourcesArr.map((src) => (
              <span
                key={src}
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 9,
                  padding: "1px 6px",
                  border: "1px solid var(--v4-line-200)",
                  background: "var(--v4-bg-100)",
                  color: "var(--v4-ink-200)",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                }}
              >
                {src}
              </span>
            ))}
          </div>
        ) : null}
        {item.verified ? (
          <div className="v4-collection-rail-card__row">
            <span className="v4-collection-rail-card__label">Status</span>
            <span
              className="v4-collection-rail-card__value"
              style={{ color: "var(--v4-money)" }}
            >
              ✓ verified
            </span>
          </div>
        ) : null}
      </div>

      {related.length > 0 ? (
        <>
          <SectionHead num="// RE" title="Related" as="h3" />
          <ul className="v4-collection-rail-list">
            {related.map((other) => (
              <li
                key={other.id}
                className="v4-collection-rail-list__item"
              >
                <Link
                  href={`/mcp/${slugForMcp(other)}`}
                  className="v4-collection-rail-list__link"
                >
                  <span
                    style={{
                      color: "var(--v4-ink-200)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {other.title}
                  </span>
                  <span className="v4-collection-rail-list__count">
                    {other.crossSourceCount ?? 1}×
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <SectionHead num="// BACK" title="All MCP" as="h3" />
      <Link
        href="/mcp"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          color: "var(--v4-acc)",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          textDecoration: "none",
        }}
      >
        ← /mcp leaderboard
      </Link>
    </>
  );

  return (
    <main className="home-surface">
      <ProfileTemplate
        crumb={
          <>
            <Link href="/mcp">MCP</Link> · DETAIL · /{item.title}
          </>
        }
        identity={identity}
        clock={
          <>
            <span className="big">{compactNumber(stars)}</span>
            <span className="muted">STARS</span>
          </>
        }
        verdict={
          <VerdictRibbon
            tone={verdictTone}
            stamp={{
              eyebrow: "// MCP",
              headline: `${item.crossSourceCount ?? 0} REGISTRIES`,
              sub: `${consensusLabel} · rank #${item.rank ?? "—"}`,
            }}
            text={
              <>
                <b>{item.title}</b>
                {item.vendor ? (
                  <>
                    {" by "}
                    <span style={{ color: "var(--v4-ink-100)" }}>
                      {item.vendor}
                    </span>
                  </>
                ) : null}{" "}
                — listed in{" "}
                <span style={{ color: "var(--v4-acc)" }}>
                  {item.crossSourceCount ?? 0} registr
                  {(item.crossSourceCount ?? 0) === 1 ? "y" : "ies"}
                </span>
                {downloads7d ? (
                  <>
                    {" with "}
                    <span style={{ color: "var(--v4-money)" }}>
                      {compactNumber(downloads7d)}
                    </span>{" "}
                    downloads · 7d
                  </>
                ) : null}
                {isNewThisWeek ? <> · shipped this week.</> : "."}
              </>
            }
            actionHref={item.url}
            actionLabel="OPEN ↗"
          />
        }
        kpiBand={kpiBand}
        mainPanels={mainPanels}
        rightRail={rightRail}
      />
    </main>
  );
}
