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
      className="v2-card overflow-hidden"
    >
      <div className="v2-term-bar">
        <span aria-hidden className="flex items-center gap-1.5">
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-acc)" }}
          />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
        </span>
        <Network
          size={12}
          className="shrink-0"
          style={{ color: "var(--v2-acc)" }}
          aria-hidden
        />
        <span
          className="flex-1 truncate"
          style={{ color: "var(--v2-ink-200)" }}
        >
          {"// RELATED REPOS"}
        </span>
        <span
          className="v2-stat shrink-0"
          style={{ color: "var(--v2-ink-300)" }}
        >
          {items.length} {items.length === 1 ? "REPO" : "REPOS"}
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-2 p-3 lg:grid-cols-3">
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
    <li
      className="transition-colors v2-row"
      style={{
        background: "var(--v2-bg-050)",
        border: "1px solid var(--v2-line-std)",
        borderRadius: 2,
        padding: 12,
      }}
    >
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
              className="size-5 shrink-0"
              style={{
                borderRadius: 2,
                border: "1px solid var(--v2-line-200)",
              }}
              unoptimized
            />
          ) : (
            <span
              aria-hidden
              className="size-5 shrink-0"
              style={{
                background: "var(--v2-bg-100)",
                border: "1px solid var(--v2-line-200)",
                borderRadius: 2,
              }}
            />
          )}
          <span
            className="truncate"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 13,
              color: "var(--v2-ink-100)",
            }}
          >
            {item.fullName}
          </span>
          {relationLabel ? (
            <span className="v2-tag ml-auto shrink-0">{relationLabel}</span>
          ) : null}
        </div>

        <div
          className="mt-1.5 v2-mono-tight tabular-nums"
          style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
        >
          {meta.join(" · ")}
        </div>

        {item.description ? (
          <p
            className="mt-1 truncate"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              color: "var(--v2-ink-300)",
            }}
          >
            {item.description}
          </p>
        ) : null}
      </Link>
    </li>
  );
}

export default RelatedReposPanel;
