// RepoLanguageBreakdown — horizontal stacked bar + legend showing the
// language composition of the repo. Source of truth is `community.languages`
// (RepoLanguagesBreakdown) populated by the live GitHub `/languages` fetch
// cached in Redis for 24h by `fetchRepoCommunityProfileLive`. No new
// fetcher — this is a pure render over existing data.
//
// Empty / pending posture: when the community profile hasn't landed yet
// (or the repo has no detected languages), the component returns null so
// the page layout doesn't show an empty card. The page-level Suspense /
// activity feed below it carries the silence.

import type { JSX } from "react";

import type { RepoCommunityProfile } from "@/lib/repo-community-profile";

interface RepoLanguageBreakdownProps {
  community: RepoCommunityProfile | null;
}

// GitHub's canonical language colors (subset, top 30 — public domain via
// github/linguist). Unlisted langs fall back to one of our `--src-*` brand
// tokens via a stable hash so the same lang always picks the same color.
const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Scala: "#c22d40",
  Dart: "#00B4AB",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Lua: "#000080",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
  Clojure: "#db5855",
  Zig: "#ec915c",
  OCaml: "#3be133",
  R: "#198CE7",
  Perl: "#0298c3",
  Julia: "#a270ba",
  MDX: "#fcb32c",
  Astro: "#ff5a03",
};

// Stable fallback color from one of our brand tokens for unknown languages.
const FALLBACK_BRAND_TOKENS = [
  "var(--src-x)",
  "var(--src-bluesky)",
  "var(--src-dev)",
  "var(--src-openai)",
  "var(--src-claude)",
  "var(--src-huggingface)",
  "var(--src-arxiv)",
  "var(--cyan)",
  "var(--violet)",
  "var(--pink)",
  "var(--gold)",
] as const;

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

function colorFor(lang: string): string {
  const canonical = LANG_COLORS[lang];
  if (canonical) return canonical;
  return FALLBACK_BRAND_TOKENS[hashString(lang) % FALLBACK_BRAND_TOKENS.length]!;
}

export function RepoLanguageBreakdown({
  community,
}: RepoLanguageBreakdownProps): JSX.Element | null {
  const languages = community?.languages?.languages ?? [];
  if (languages.length === 0) return null;

  // Cap to top 8 — long-tail langs roll into "Other" so the bar stays legible.
  const top = languages.slice(0, 8);
  const otherPercent = languages
    .slice(8)
    .reduce((sum, l) => sum + l.percent, 0);
  const totalShown = top.reduce((sum, l) => sum + l.percent, 0) + otherPercent;

  return (
    <section className="card pf-card pf-languages" aria-labelledby="pf-lang-head">
      <div className="card-head">
        <h2 className="card-title" id="pf-lang-head">
          {"▌"} <b>Languages</b> {"·"} composition by bytes
        </h2>
      </div>
      <div className="pf-lang-body">
        <div
          className="pf-lang-bar"
          role="img"
          aria-label={`Language composition: ${top
            .map((l) => `${l.name} ${l.percent}%`)
            .join(", ")}`}
        >
          {top.map((lang) => (
            <span
              key={lang.name}
              className="pf-lang-bar-seg"
              style={{
                width: `${(lang.percent / Math.max(totalShown, 0.0001)) * 100}%`,
                background: colorFor(lang.name),
              }}
              title={`${lang.name} · ${lang.percent}%`}
            />
          ))}
          {otherPercent > 0 ? (
            <span
              className="pf-lang-bar-seg"
              style={{
                width: `${(otherPercent / Math.max(totalShown, 0.0001)) * 100}%`,
                background: "var(--fg-faint)",
              }}
              title={`Other · ${otherPercent.toFixed(1)}%`}
            />
          ) : null}
        </div>
        <ul className="pf-lang-legend">
          {top.map((lang) => (
            <li key={lang.name} className="pf-lang-legend-item">
              <span
                className="pf-lang-chip"
                style={{ background: colorFor(lang.name) }}
                aria-hidden="true"
              />
              <span className="pf-lang-legend-name">{lang.name}</span>
              <span className="pf-lang-legend-pct mono">
                {lang.percent.toFixed(1)}%
              </span>
            </li>
          ))}
          {otherPercent > 0 ? (
            <li className="pf-lang-legend-item">
              <span
                className="pf-lang-chip"
                style={{ background: "var(--fg-faint)" }}
                aria-hidden="true"
              />
              <span className="pf-lang-legend-name">Other</span>
              <span className="pf-lang-legend-pct mono">
                {otherPercent.toFixed(1)}%
              </span>
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
