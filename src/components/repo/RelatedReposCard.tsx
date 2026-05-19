// RelatedReposCard — top 4 related repos from the derived scorer.
// `getRelatedReposFor` returns up to 6 — we slice to 4 here to match the
// HTML mockup's vertical density.

import Link from "next/link";

import type { RelatedRepoItem } from "@/lib/repo-related";

interface RelatedReposCardProps {
  related: RelatedRepoItem[];
}

function avatarSeed(fullName: string): string {
  const parts = fullName.split("/");
  const name = parts[1] ?? parts[0] ?? "";
  return (name.charAt(0) || "?").toUpperCase() + (name.charAt(1) || "").toUpperCase();
}

export function RelatedReposCard({ related }: RelatedReposCardProps) {
  const rows = related.slice(0, 4);

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">
            ▌ <b>Related</b>
          </h2>
        </div>
        <div
          style={{
            padding: "16px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-faint)",
          }}
        >
          No related repos surfaced for this entry yet.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Related</b> · same ecosystem
        </h2>
      </div>
      <div className="related-list">
        {rows.map((r) => {
          const [owner, name] = r.fullName.split("/");
          const href = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name ?? "")}`;
          return (
            <Link
              key={r.fullName}
              href={href}
              className="related-row"
              data-repo-hover
              data-repo={r.fullName}
            >
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
                {avatarSeed(r.fullName)}
              </div>
              <div>
                <div className="related-name">{r.fullName}</div>
                {r.description ? (
                  <div className="related-desc">{r.description}</div>
                ) : null}
              </div>
              <div
                className="mono up-text"
                style={{ fontSize: 11, textAlign: "right" }}
              >
                {r.stars.toLocaleString()} ★
                {typeof r.momentumScore === "number" ? (
                  <>
                    <br />
                    <span className="muted" style={{ fontSize: 10 }}>
                      m{r.momentumScore.toFixed(0)}
                    </span>
                  </>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
