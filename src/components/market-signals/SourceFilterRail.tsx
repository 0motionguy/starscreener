// SourceFilterRail — left rail with per-source `.src-toggle.on` toggles.
// URL `?src=` carries the comma-separated list of enabled source slugs;
// missing or empty == "all enabled". Server component — link toggling
// is plain navigation (Next router handles the rerender).

import Link from "next/link";

import type { SidebarSourceCounts } from "@/lib/sidebar-source-counts";

interface SourceFilterRailProps {
  selected: Set<string>;
  counts: SidebarSourceCounts | null;
  window: string;
}

interface SourceEntry {
  slug: string;
  label: string;
  cls: string;
  count: number;
}

interface SourceGroup {
  title: string;
  entries: SourceEntry[];
}

function buildGroups(counts: SidebarSourceCounts | null): SourceGroup[] {
  const c = counts ?? {
    hackernewsStories: 0,
    lobstersStories: 0,
    devtoArticles: 0,
    blueskyPosts: 0,
    redditPosts: 0,
    producthuntLaunches: 0,
    fundingSignals: 0,
    npmPackages: 0,
    skillsItems: 0,
    mcpItems: 0,
    agentRepos: 0,
    twitterRepos: 0,
    hfModels: 0,
    hfDatasets: 0,
    hfSpaces: 0,
    arxivPapers: 0,
    citedRepos: 0,
    revenueOverlays: 0,
  };

  return [
    {
      title: "Feed sources",
      entries: [
        { slug: "github", label: "GitHub", cls: "github", count: 0 },
        { slug: "hn", label: "Hacker News", cls: "hn", count: c.hackernewsStories },
        { slug: "x", label: "X / Twitter", cls: "x", count: c.twitterRepos },
        { slug: "reddit", label: "Reddit", cls: "reddit", count: c.redditPosts },
        { slug: "bsky", label: "Bluesky", cls: "bsky", count: c.blueskyPosts },
        { slug: "devto", label: "Dev.to", cls: "devto", count: c.devtoArticles },
        { slug: "lobsters", label: "Lobsters", cls: "lobsters", count: c.lobstersStories },
        { slug: "ph", label: "ProductHunt", cls: "ph", count: c.producthuntLaunches },
      ],
    },
    {
      title: "Data sources",
      entries: [
        { slug: "npm", label: "npm", cls: "npm", count: c.npmPackages },
        { slug: "arxiv", label: "arXiv", cls: "arxiv", count: c.arxivPapers },
        { slug: "hf-models", label: "HF Models", cls: "hf", count: c.hfModels },
        { slug: "hf-datasets", label: "HF Datasets", cls: "hf", count: c.hfDatasets },
        { slug: "hf-spaces", label: "HF Spaces", cls: "hf", count: c.hfSpaces },
        { slug: "funding", label: "Funding", cls: "funding", count: c.fundingSignals },
        { slug: "skills", label: "Skills", cls: "skills", count: c.skillsItems },
        { slug: "mcp", label: "MCP", cls: "mcp", count: c.mcpItems },
      ],
    },
    {
      title: "AI labs",
      entries: [
        { slug: "openai", label: "OpenAI", cls: "openai", count: 0 },
        { slug: "anthropic", label: "Anthropic", cls: "anthropic", count: 0 },
        { slug: "google", label: "Google AI", cls: "google", count: 0 },
        { slug: "meta", label: "Meta AI", cls: "meta", count: 0 },
        { slug: "mistral", label: "Mistral", cls: "mistral", count: 0 },
        { slug: "cohere", label: "Cohere", cls: "cohere", count: 0 },
      ],
    },
  ];
}

function toggleHref(
  slug: string,
  selected: Set<string>,
  window: string,
): string {
  const next = new Set(selected);
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  const params = new URLSearchParams();
  if (window) params.set("window", window);
  if (next.size > 0) params.set("src", Array.from(next).sort().join(","));
  const qs = params.toString();
  return qs ? `/market-signals?${qs}` : `/market-signals`;
}

export function SourceFilterRail({ selected, counts, window }: SourceFilterRailProps) {
  const groups = buildGroups(counts);
  const allOn = selected.size === 0;

  return (
    <aside
      className="src-rail"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: 14,
        background: "var(--surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--fg-faint)",
          }}
        >
          Source filter
        </span>
        <Link
          href={window ? `/market-signals?window=${window}` : "/market-signals"}
          prefetch={false}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: allOn ? "var(--accent)" : "var(--fg-faint)",
            textDecoration: "none",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          All
        </Link>
      </div>
      {groups.map((g) => (
        <div key={g.title} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
            }}
          >
            {g.title}
          </span>
          {g.entries.map((e) => {
            const on = allOn || selected.has(e.slug);
            return (
              <Link
                key={e.slug}
                href={toggleHref(e.slug, selected, window)}
                prefetch={false}
                className={`src-toggle${on ? " on" : ""}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 8px",
                  border: `1px solid ${on ? "var(--accent)" : "var(--border-subtle)"}`,
                  borderRadius: "var(--r-1)",
                  background: on ? "var(--surface-2)" : "transparent",
                  color: on ? "var(--fg-bright)" : "var(--fg-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  textDecoration: "none",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    className={`smark ${e.cls}`}
                    style={{
                      display: "inline-flex",
                      width: 12,
                      height: 12,
                      fontSize: 8,
                      borderRadius: 2,
                    }}
                    aria-hidden="true"
                  />
                  {e.label}
                </span>
                {e.count > 0 && (
                  <span style={{ color: "var(--fg-faint)", fontSize: 10 }}>
                    {e.count.toLocaleString()}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
