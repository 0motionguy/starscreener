// RelatedReposPanel — compact grid of related/competing repos.
//
// V4. Server component. Consumes the narrowed RelatedRepoItem[] shape from
// `@/lib/repo-related` and renders a SectionHead + 3-column grid of
// RelatedRepoCard primitives.
//
// As of W5 the canonical repo-detail page bypasses this wrapper and slots
// RelatedRepoCard instances directly into <ProfileTemplate>'s `related`
// slot. This panel remains exported so it can be dropped into any page
// that wants the panel-with-its-own-header shape (e.g. a future profile
// surface). Empty-state rule: if `items.length === 0`, render nothing.

import type { JSX } from "react";

import { formatNumber } from "@/lib/utils";
import type { RelatedRepoItem } from "@/lib/repo-related";
import { SectionHead } from "@/components/ui/SectionHead";
import { RelatedRepoCard } from "@/components/repo-detail/RelatedRepoCard";

interface RelatedReposPanelProps {
  items: RelatedRepoItem[];
}

const RELATION_LABELS: Record<
  NonNullable<RelatedRepoItem["relation"]>,
  string
> = {
  fork: "FORK",
  replacement: "REPLACEMENT",
  similar: "SIMILAR",
  sibling: "SIBLING",
};

export function RelatedReposPanel({
  items,
}: RelatedReposPanelProps): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <section aria-label="Related repositories">
      <SectionHead
        num="// REL"
        title="Related repos"
        meta={`${items.length} ${items.length === 1 ? "REPO" : "REPOS"}`}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "var(--v4-grid-gap, 12px)",
        }}
      >
        {items.map((item) => {
          const [owner, name] = item.fullName.split("/");
          const href = owner && name ? `/repo/${owner}/${name}` : undefined;
          const similarity = item.relation
            ? RELATION_LABELS[item.relation]
            : undefined;
          return (
            <RelatedRepoCard
              key={item.fullName}
              fullName={item.fullName}
              description={item.description ?? undefined}
              language={item.language ? item.language.toUpperCase() : undefined}
              stars={formatNumber(item.stars)}
              similarity={similarity}
              href={href}
            />
          );
        })}
      </div>
    </section>
  );
}

export default RelatedReposPanel;
