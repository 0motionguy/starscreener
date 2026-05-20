// SourceFilterRail - 30 source toggles using the shell .src-toggle contract.
// URL ?src= carries comma-separated enabled source slugs; missing or empty
// means all enabled.

import Link from "next/link";

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
      { slug: "reddit", label: "Reddit", colorVar: "var(--src-reddit)" },
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
      { slug: "arxiv", label: "arXiv", colorVar: "var(--src-arxiv)" },
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
      { slug: "openai", label: "OpenAI RSS", colorVar: "var(--src-openai)" },
      { slug: "anthropic", label: "Anthropic RSS", colorVar: "var(--src-claude)" },
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
              return (
                <Link
                  key={entry.slug}
                  href={toggleHref(entry.slug, selected, window)}
                  prefetch={false}
                  className={`src-toggle ${on ? "on" : "off"}`}
                  role="button"
                  aria-pressed={on}
                  aria-label={`Toggle ${entry.label}`}
                  data-source={entry.slug}
                >
                  <span className="src-dot" style={{ background: entry.colorVar }} />
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
