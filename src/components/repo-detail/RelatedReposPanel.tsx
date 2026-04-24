// RelatedReposPanel — compact grid of related/competing repos for the
// repo profile page.
//
// Server component. Consumes the narrowed RelatedRepoItem[] shape from
// `@/lib/repo-related`, which delegates to getDerivedRelatedRepos and
// caps the list at 6. Ordering comes from the derived layer — we do not
// resort here.
//
// Chrome matches FundingPanel / NpmAdoptionPanel conventions:
//   - rounded-card + border-border-primary + bg-bg-primary container
//   - font-mono uppercase tracking-wider tertiary-text header label
//   - 3-column grid on lg+, 1-column on mobile
//
// Empty-state rule: if `items.length === 0`, render nothing. The page
// must not show an empty shell — the spec explicitly asks for a clean
// null return so the layout collapses gracefully when the derived
// scorer produces no candidates.

import type { JSX } from "react";
import Image from "next/image";
import Link from "next/link";
import { Network } from "lucide-react";

import { formatNumber } from "@/lib/utils";
import type { RelatedRepoItem } from "@/lib/repo-related";

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
    <section
      aria-label="Related repositories"
      className="rounded-card border border-border-primary bg-bg-primary p-3 sm:p-4"
    >
      <header className="flex items-center gap-2 mb-3">
        <Network className="size-4 text-text-primary" aria-hidden />
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
          Related repos
        </h2>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          {items.length} {items.length === 1 ? "repo" : "repos"}
        </span>
      </header>

      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        {items.map((item) => (
          <RelatedRepoCard key={item.fullName} item={item} />
        ))}
      </ul>
    </section>
  );
}

function RelatedRepoCard({ item }: { item: RelatedRepoItem }): JSX.Element {
  const [owner, name] = item.fullName.split("/");
  const href = owner && name ? `/repo/${owner}/${name}` : "#";
  const relationLabel = item.relation
    ? RELATION_LABELS[item.relation]
    : null;

  const meta: string[] = [];
  if (item.language) meta.push(item.language);
  meta.push(`${formatNumber(item.stars)} stars`);

  return (
    <li className="rounded-card border border-border-primary bg-bg-card p-3 transition-colors hover:bg-bg-card-hover">
      <Link
        href={href}
        className="block"
        aria-label={`Open ${item.fullName}`}
      >
        <div className="flex items-center gap-2">
          {item.ownerAvatarUrl ? (
            <Image
              src={item.ownerAvatarUrl}
              alt=""
              width={20}
              height={20}
              className="size-5 shrink-0 rounded-full border border-border-primary"
              unoptimized
            />
          ) : (
            <span
              aria-hidden
              className="size-5 shrink-0 rounded-full border border-border-primary bg-bg-muted"
            />
          )}
          <span className="font-mono text-sm text-text-primary truncate">
            {item.fullName}
          </span>
          {relationLabel ? (
            <span className="ml-auto inline-flex shrink-0 items-center rounded-full border border-border-primary bg-bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary">
              {relationLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-1 font-mono text-[11px] text-text-tertiary">
          {meta.join(" · ")}
        </div>

        {item.description ? (
          <p className="mt-1 truncate font-mono text-[11px] text-text-secondary">
            {item.description}
          </p>
        ) : null}
      </Link>
    </li>
  );
}

export default RelatedReposPanel;
