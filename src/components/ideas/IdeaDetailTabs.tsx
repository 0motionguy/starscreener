// IdeaDetailTabs — 4 tab buttons + data-tabset wrapper. URL-driven
// (?tab=…) so the tabs stay server-side and survive refresh. The
// data-tabset wrapper hands shell.js the markup contract it needs to
// activate per-tab keyboard navigation + ARIA wiring.

import Link from "next/link";

export const IDEA_TABS = [
  { id: "overview", label: "Overview" },
  { id: "contributions", label: "Contributions" },
  { id: "brief", label: "Build brief" },
  { id: "related", label: "Related repos" },
] as const;

export type IdeaTab = (typeof IDEA_TABS)[number]["id"];

interface IdeaDetailTabsProps {
  ideaId: string;
  active: IdeaTab;
  contributionCount?: number;
}

export function IdeaDetailTabs({
  ideaId,
  active,
  contributionCount = 5,
}: IdeaDetailTabsProps) {
  return (
    <div data-tabset data-panel-group="idea-tabs">
      <nav
        className="idea-tabs tabs"
        role="tablist"
        aria-label="Idea sections"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        {IDEA_TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <Link
              key={t.id}
              id={`idea-tab-${t.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`idea-panel-${t.id}`}
              href={`/ideas/${ideaId}?tab=${t.id}`}
              className={`tab tab-btn ${isActive ? "on active" : ""}`}
              data-tab={t.id}
              prefetch={false}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
