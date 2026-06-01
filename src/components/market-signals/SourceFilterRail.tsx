// SourceFilterRail — source toggles using the shell .src-toggle contract.
// URL ?src= carries comma-separated enabled source slugs; missing or empty
// means all enabled.
//
// 2026-05-23: swapped colored dots for real /brand/sources/*.svg logos where
// available. Sources without a brand SVG (lobsters, google, meta, mistral,
// cohere, xai, perplexity, qwen, skills, mcp custom, agent-repos, funding,
// revenue, pypi, openrouter) keep the colored dot.

import Link from "next/link";

import { SourceLogo, type SourceName } from "@/components/icon/Icon";

export type MarketSourceTotals = Record<string, number>;

interface SourceFilterRailProps {
  selected: Set<string>;
  sourceTotals: MarketSourceTotals;
  window: string;
}

interface SourceEntry {
  slug: string;
  label: string;
  colorVar: string;
}

interface SourceGroup {
  title: string;
  entries: SourceEntry[];
}

const SOURCE_GROUPS: SourceGroup[] = [
  {
    title: "Social feeds",
    entries: [
      { slug: "github", label: "GitHub", colorVar: "var(--src-github)" },
      { slug: "hn", label: "Hacker News", colorVar: "var(--src-hackernews)" },
      { slug: "x", label: "X / Twitter", colorVar: "var(--src-x)" },
      { slug: "bsky", label: "Bluesky", colorVar: "var(--src-bluesky)" },
      { slug: "ph", label: "ProductHunt", colorVar: "var(--src-producthunt)" },
      { slug: "devto", label: "Dev.to", colorVar: "var(--src-dev)" },
      { slug: "lobsters", label: "Lobsters", colorVar: "var(--src-lobsters)" },
    ],
  },
  {
    title: "Data sources",
    entries: [
      { slug: "npm", label: "NPM downloads", colorVar: "var(--src-npm)" },
      { slug: "hf-models", label: "HF models", colorVar: "var(--src-huggingface)" },
      { slug: "hf-datasets", label: "HF datasets", colorVar: "var(--src-huggingface)" },
      { slug: "hf-spaces", label: "HF spaces", colorVar: "var(--src-huggingface)" },
      { slug: "skills", label: "Skills", colorVar: "var(--violet)" },
      { slug: "mcp", label: "MCP registries", colorVar: "var(--cyan)" },
      { slug: "agent-repos", label: "Agent repos", colorVar: "var(--up)" },
      { slug: "funding", label: "Funding news", colorVar: "var(--warning)" },
      { slug: "revenue", label: "Revenue overlays", colorVar: "var(--gold)" },
      { slug: "pypi", label: "PyPI", colorVar: "var(--violet)" },
      { slug: "openrouter", label: "OpenRouter", colorVar: "var(--info)" },
    ],
  },
  {
    title: "AI labs",
    entries: [
      { slug: "google", label: "Google AI", colorVar: "var(--info)" },
      { slug: "meta", label: "Meta AI", colorVar: "var(--cyan)" },
      { slug: "mistral", label: "Mistral", colorVar: "var(--warning)" },
      { slug: "cohere", label: "Cohere", colorVar: "var(--up)" },
      { slug: "deepseek", label: "DeepSeek", colorVar: "var(--src-arxiv)" },
      { slug: "xai", label: "xAI", colorVar: "var(--src-x)" },
      { slug: "perplexity", label: "Perplexity", colorVar: "var(--violet)" },
      { slug: "qwen", label: "Qwen", colorVar: "var(--src-huggingface)" },
    ],
  },
];

const SOURCE_TOTAL = SOURCE_GROUPS.reduce((sum, group) => sum + group.entries.length, 0);

// slug → brand logo file under /brand/sources/. Slugs not mapped here fall
// back to the colored dot indicator.
const SOURCE_LOGO_MAP: Partial<Record<string, SourceName>> = {
  github: "github",
  hn: "hackernews",
  x: "x-twitter",
  bsky: "bluesky",
  ph: "producthunt",
  devto: "devto",
  npm: "npm",
  "hf-models": "huggingface",
  "hf-datasets": "huggingface",
  "hf-spaces": "huggingface",
  deepseek: "deepseek",
  mcp: "modelcontextprotocol",
};

function toggleHref(slug: string, selected: Set<string>, window: string): string {
  const next = new Set(selected);
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  const params = new URLSearchParams();
  if (window) params.set("window", window);
  if (next.size > 0) params.set("src", Array.from(next).sort().join(","));
  const qs = params.toString();
  return qs ? `/market-signals?${qs}` : "/market-signals";
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.max(0, Math.round(n)).toLocaleString();
}

export function SourceFilterRail({ selected, sourceTotals, window }: SourceFilterRailProps) {
  const allOn = selected.size === 0;

  return (
    <aside className="card src-rail">
      <div className="card-title" style={{ paddingBottom: 10 }}>
        <b>Mention sources</b> - {SOURCE_TOTAL}
      </div>

      {SOURCE_GROUPS.map((group, groupIndex) => (
        <div key={group.title}>
          {groupIndex > 0 && <div className="divider" />}
          {groupIndex > 0 && (
            <div className="card-title" style={{ paddingBottom: 8 }}>
              {group.title}
            </div>
          )}
          {groupIndex === 0 && (
            <div className="card-title" style={{ paddingBottom: 8 }}>
              {group.title}
            </div>
          )}
          <div className="col" style={{ gap: 2 }} role="group" aria-label={group.title}>
            {group.entries.map((entry) => {
              const on = allOn || selected.has(entry.slug);
              const logo = SOURCE_LOGO_MAP[entry.slug];
              return (
                <Link
                  key={entry.slug}
                  href={toggleHref(entry.slug, selected, window)}
                  prefetch={false}
                  className={`src-toggle ${on ? "on" : "off"}`}
                  aria-current={on ? "true" : undefined}
                  data-source={entry.slug}
                >
                  {logo ? (
                    <span className="src-logo" aria-hidden="true" style={{ display: "inline-grid", placeItems: "center", width: 14, height: 14 }}>
                      <SourceLogo source={logo} size="sm" alt="" />
                    </span>
                  ) : (
                    <span className="src-dot" style={{ background: entry.colorVar }} />
                  )}
                  <span>{entry.label}</span>
                  <span className="src-count">{formatCount(sourceTotals[entry.slug] ?? 0)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div className="divider" />
      <Link
        href={window ? `/market-signals?window=${window}` : "/market-signals"}
        prefetch={false}
        className="btn ghost sm"
        style={{ justifyContent: "center", textDecoration: "none" }}
      >
        Reset sources
      </Link>
    </aside>
  );
}
