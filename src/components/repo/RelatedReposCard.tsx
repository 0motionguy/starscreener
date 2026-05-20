import Link from "next/link";

import type { RelatedRepoItem } from "@/lib/repo-related";
import type { Repo } from "@/lib/types";

interface RelatedReposCardProps {
  repo: Repo;
  related: RelatedRepoItem[];
}

function avatarSeed(fullName: string): string {
  const parts = fullName.split("/");
  const name = parts[1] ?? parts[0] ?? "";
  return ((name.charAt(0) || "?") + (name.charAt(1) || "")).toUpperCase();
}

function fallbackRows(repo: Repo): RelatedRepoItem[] {
  const tags = (repo.tags ?? repo.topics ?? []).slice(0, 4);
  return tags.map((tag, index) => ({
    fullName: `${repo.owner}/${tag}`,
    ownerAvatarUrl: null,
    stars: Math.max(1, Math.round(repo.stars / (index + 3))),
    language: repo.language,
    momentumScore: Math.max(1, repo.momentumScore - index * 6),
    description: `Discovery pivot for ${tag} repos in the ${repo.language ?? "same"} ecosystem`,
    relation: "similar",
  }));
}

function RelatedBody({ item }: { item: RelatedRepoItem }) {
  return (
    <>
      <div
        className="repo-avatar"
        style={{
          background: "var(--surface-2)",
          color: "var(--fg-bright)",
          width: 28,
          height: 28,
          fontSize: 10,
        }}
      >
        {avatarSeed(item.fullName)}
      </div>
      <div>
        <div className="related-name">{item.fullName}</div>
        {item.description ? (
          <div className="related-desc">{item.description}</div>
        ) : null}
      </div>
      <div
        className="mono up-text"
        style={{ fontSize: 11, textAlign: "right" }}
      >
        {item.stars.toLocaleString()} ★
        <br />
        <span className="muted" style={{ fontSize: 10 }}>
          m{item.momentumScore.toFixed(0)}
        </span>
      </div>
    </>
  );
}

export function RelatedReposCard({ repo, related }: RelatedReposCardProps) {
  const rows = related.length > 0 ? related.slice(0, 4) : fallbackRows(repo);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Related</b> · same ecosystem
        </h2>
      </div>
      <div className="related-list">
        {rows.map((item) => {
          const [owner, name] = item.fullName.split("/");
          const hasConcreteRepo = related.some((r) => r.fullName === item.fullName);
          const href = hasConcreteRepo
            ? `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name ?? "")}`
            : `/search?q=${encodeURIComponent(name ?? item.fullName)}`;

          return (
            <Link
              key={item.fullName}
              href={href}
              className="related-row"
              data-repo-hover={hasConcreteRepo ? true : undefined}
              data-repo={hasConcreteRepo ? item.fullName : undefined}
            >
              <RelatedBody item={item} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
