// IdeaDetailTabs — 4 tab buttons. URL-driven (?tab=…) so the tabs stay
// server-side and survive refresh.

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
}

export function IdeaDetailTabs({ ideaId, active }: IdeaDetailTabsProps) {
  return (
    <nav
      className="idea-tabs"
      role="tablist"
      aria-label="Idea sections"
      style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
    >
      {IDEA_TABS.map((t) => (
        <Link
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          href={`/ideas/${ideaId}?tab=${t.id}`}
          className={`tab ${t.id === active ? "on" : ""}`}
          prefetch={false}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
