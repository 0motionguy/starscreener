import Link from "next/link";

import type { CategoryId, WindowId } from "./TrendingHubHero";

export interface LanguageStat {
  language: string;
  count: number;
}

interface TrendingFiltersProps {
  activeLanguage: string;
  activeSort: string;
  category: CategoryId;
  window: WindowId;
  languages: LanguageStat[];
}

const SORTS = [
  { id: "momentum", label: "Momentum" },
  { id: "mentions", label: "Mentions" },
  { id: "stars", label: "Stars" },
  { id: "consensus", label: "Consensus" },
] as const;

export function TrendingFilters({ activeLanguage, activeSort, category, window, languages }: TrendingFiltersProps) {
  const topLanguages = languages.slice(0, 5);
  const remaining = Math.max(0, languages.length - topLanguages.length);

  return (
    <div className="filter-strip">
      <div className="filter-langs">
        <Link
          href={{ query: cleanQuery({ cat: category, window, sort: activeSort, lang: "all" }) }}
          className={`lang-pill${activeLanguage === "all" ? " on" : ""}`}
          prefetch={false}
        >
          <span className="lang-dot tone-accent" /> All
        </Link>
        {topLanguages.map((item, index) => {
          const key = item.language.toLowerCase();
          return (
            <Link
              key={item.language}
              href={{ query: cleanQuery({ cat: category, window, sort: activeSort, lang: key }) }}
              className={`lang-pill${activeLanguage === key ? " on" : ""}`}
              prefetch={false}
            >
              <span className={`lang-dot tone-${index % 6}`} />
              {item.language} <span className="muted">· {item.count.toLocaleString()}</span>
            </Link>
          );
        })}
        {remaining > 0 && (
          <span className="lang-pill more">
            <span className="lang-dot tone-more" /> + {remaining} more
          </span>
        )}
      </div>

      <div className="filter-actions" role="group" aria-label="Sort and filters">
        <Link className="btn ghost sm" href={{ query: cleanQuery({ cat: category, window, sort: activeSort, lang: activeLanguage }) }} prefetch={false}>
          Filters
        </Link>
        {SORTS.map((sort) => (
          <Link
            key={sort.id}
            className={`btn ghost sm${activeSort === sort.id ? " on" : ""}`}
            href={{ query: cleanQuery({ cat: category, window, sort: sort.id, lang: activeLanguage }) }}
            prefetch={false}
          >
            {sort.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function cleanQuery(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== "all" && value !== ""));
}
