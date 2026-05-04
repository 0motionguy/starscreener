// /mcp/[slug] — V4 per-MCP detail page (ProfileTemplate consumer).
//
// Server component. Resolves the MCP from the same publish payload the
// /mcp leaderboard uses, via `getMcpDetailBySlug`. 404 when the slug
// doesn't match any item in the current roster.
//
// Layout (ProfileTemplate slots):
//   identity   — MCP name + author + tags + install command
//   kpiBand    — Stars · Forks (or Tools) · Tools count · Mentions
//   mainPanels — README/description + tools list + mentions
//   rightRail  — install instructions + related signals

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  getMcpDetailBySlug,
  readMcpManifestTools,
} from "@/lib/mcp-detail";
import type { EcosystemLeaderboardItem } from "@/lib/ecosystem-leaderboards";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

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
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {item.tags.slice(0, 8).map((tag) => (
            <span
              key={tag}
              style={{
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
      {installCommand ? (
        <pre
          style={{
            marginTop: 8,
            padding: "8px 10px",
            background: "var(--v4-bg-100)",
            border: "1px solid var(--v4-line-200)",
            color: "var(--v4-ink-100)",
            fontSize: 12,
            overflowX: "auto",
          }}
        >
          <code>{installCommand}</code>
        </pre>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section
        style={{
          padding: 16,
          border: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-025)",
        }}
      >
        <SectionHead num="// 01" title="Overview" />
        {item.description ? (
          <p style={{ color: "var(--v4-ink-200)", lineHeight: 1.6 }}>
            {item.description}
          </p>
        ) : (
          <p style={{ color: "var(--v4-ink-400)", fontStyle: "italic" }}>
            No description published yet.
          </p>
        )}
        {lastReleaseAt ? (
          <p
            style={{
              marginTop: 12,
              color: "var(--v4-ink-300)",
              fontSize: 12,
            }}
          >
            Last release {formatAge(lastReleaseAt)}
            {isNewThisWeek ? (
              <span
                style={{
                  marginLeft: 8,
                  padding: "1px 6px",
                  border: "1px solid var(--v4-acc)",
                  color: "var(--v4-acc)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                }}
              >
                new
              </span>
            ) : null}
          </p>
        ) : null}
      </section>

      <section
        style={{
          padding: 16,
          border: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-025)",
        }}
      >
        <SectionHead
          num="// 02"
          title={`Tools${tools.length > 0 ? ` · ${tools.length}` : ""}`}
        />
        {tools.length > 0 ? (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tools.map((tool) => (
              <li
                key={tool.name}
                style={{
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--v4-line-200)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--v4-mono)",
                    color: "var(--v4-ink-100)",
                    fontSize: 13,
                  }}
                >
                  {tool.name}
                </span>
                {tool.description ? (
                  <p
                    style={{
                      marginTop: 2,
                      color: "var(--v4-ink-300)",
                      fontSize: 12,
                    }}
                  >
                    {tool.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--v4-ink-400)", fontStyle: "italic" }}>
            Tool list pending — manifest hasn&apos;t been pinged yet.
          </p>
        )}
      </section>

      <section
        style={{
          padding: 16,
          border: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-025)",
        }}
      >
        <SectionHead num="// 03" title="Recent mentions" />
        <p style={{ color: "var(--v4-ink-400)", fontStyle: "italic" }}>
          Coming soon — cross-platform MCP mention tracking is on the
          roadmap. Today&apos;s mentions corpus indexes repos, not MCPs.
        </p>
      </section>
    </div>
  );

  const rightRail = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section
        style={{
          padding: 16,
          border: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-025)",
        }}
      >
        <SectionHead num="// IN" title="Install" as="h3" />
        {installCommand ? (
          <>
            <p
              style={{
                color: "var(--v4-ink-300)",
                fontSize: 12,
                marginBottom: 8,
              }}
            >
              Run via {mcp?.packageRegistry === "npm" ? "npx" : "uvx"}:
            </p>
            <pre
              style={{
                padding: "8px 10px",
                background: "var(--v4-bg-100)",
                border: "1px solid var(--v4-line-200)",
                color: "var(--v4-ink-100)",
                fontSize: 12,
                overflowX: "auto",
              }}
            >
              <code>{installCommand}</code>
            </pre>
          </>
        ) : (
          <p style={{ color: "var(--v4-ink-400)", fontStyle: "italic" }}>
            No package registered.
          </p>
        )}
      </section>

      <section
        style={{
          padding: 16,
          border: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-025)",
        }}
      >
        <SectionHead num="// SO" title="Sources" as="h3" />
        <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sourceLinks.map((link) => (
            <li key={`${link.label}-${link.href}`}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--v4-acc)",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                }}
              >
                {link.label} →
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section
        style={{
          padding: 16,
          border: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-025)",
        }}
      >
        <SectionHead num="// RE" title="Related" as="h3" />
        <Link
          href="/mcp"
          style={{
            color: "var(--v4-acc)",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
          }}
        >
          ← All MCP servers
        </Link>
      </section>
    </div>
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
            <LiveDot label="LIVE" />
          </>
        }
        kpiBand={kpiBand}
        mainPanels={mainPanels}
        rightRail={rightRail}
      />
    </main>
  );
}
