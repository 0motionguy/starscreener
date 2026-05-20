// IdeasBoardToolbar — sticky filter row. All state lives in the URL so the
// toolbar can stay a server component. The <form> submits to the same
// route which re-renders with the new ?q=. Sort/filter chips are <Link>s.

import Link from "next/link";

export const IDEA_SORTS = [
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "easy", label: "Easy wins" },
  { id: "launch", label: "Launch-ready" },
  { id: "saved", label: "Saved" },
] as const;

export const IDEA_FILTERS = [
  { id: "all", label: "All" },
  { id: "trending", label: "Trending" },
  { id: "high-demand", label: "High demand" },
  { id: "fresh", label: "Fresh < 24h" },
  { id: "easy", label: "Easy wins" },
  { id: "unclaimed", label: "Unclaimed" },
  { id: "shipped", label: "Shipped" },
] as const;

export type IdeaSort = (typeof IDEA_SORTS)[number]["id"];
export type IdeaFilter = (typeof IDEA_FILTERS)[number]["id"];

interface IdeasBoardToolbarProps {
  q: string;
  sort: IdeaSort;
  filter: IdeaFilter;
}

function buildHref(params: Record<string, string | null>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v) out[k] = v;
  return { query: out };
}

export function IdeasBoardToolbar({ q, sort, filter }: IdeasBoardToolbarProps) {
  return (
    <div className="ideas-toolbar" role="search" aria-label="Idea filters">
      <form
        action="/ideas"
        method="GET"
        className="ideas-search"
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by title, repo, tag…"
          className="ideas-search-input"
          aria-label="Search ideas"
        />
        {sort ? <input type="hidden" name="sort" value={sort} /> : null}
        {filter ? <input type="hidden" name="filter" value={filter} /> : null}
        <button type="submit" className="ideas-search-go">
          Search
        </button>
      </form>

      <div
        className="ideas-sort"
        role="group"
        aria-label="Sort ideas"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        {IDEA_SORTS.map((s) => (
          <Link
            key={s.id}
            href={buildHref({ q, sort: s.id, filter })}
            className={`chip ${s.id === sort ? "on" : ""}`}
            prefetch={false}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div
        className="ideas-filter"
        role="tablist"
        aria-label="Filter ideas"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        {IDEA_FILTERS.map((f) => {
          const isActive =
            (f.id === "all" && (!filter || filter === "all")) || f.id === filter;
          return (
            <Link
              key={f.id}
              href={buildHref({ q, sort, filter: f.id === "all" ? null : f.id })}
              className={`chip-sm ${isActive ? "on" : ""}`}
              prefetch={false}
              role="tab"
              aria-selected={isActive}
              aria-controls="ideas-board-panel"
              id={`ideas-filter-${f.id}`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
