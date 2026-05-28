// RankedRepoList — server-rendered, ordered editorial list of repos with a
// prose "why it ranks" blurb per entry. The verdict-forward counterpart to
// the dense TrendingTable: used by /best/[topic] (and reusable by future
// listicle surfaces). Semantic <ol> so the ranking is machine-readable; each
// entry links to the repo detail page (internal-link equity) and carries the
// blurb that the ItemList JSON-LD also publishes.
//
// Uses only existing shell.css primitives (.card, .chip, helpers) — no new CSS.

import Link from "next/link";

import type { Repo } from "@/lib/types";

export interface RankedEntry {
  repo: Repo;
  /** "Why it ranks" — verdict tagline/summary or a data-grounded fallback. */
  blurb: string;
}

function compact(value: number): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function RankedRepoList({ entries }: { entries: RankedEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="card">
        <div className="card-body muted">
          The ranked list is refreshing — check back in a moment.
        </div>
      </div>
    );
  }

  return (
    <ol className="col gap-3" style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
      {entries.map(({ repo, blurb }, idx) => {
        const detailHref = `/repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
        const delta = repo.starsDelta24h ?? 0;
        const deltaCls = delta > 0 ? "chip up" : delta < 0 ? "chip dn" : "chip";
        return (
          <li key={repo.id}>
            <article className="card">
              <div className="card-body">
                <div className="row gap-3" style={{ alignItems: "flex-start" }}>
                  <span className="chip num" aria-hidden="true">
                    #{idx + 1}
                  </span>
                  {repo.ownerAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={repo.ownerAvatarUrl}
                      alt=""
                      loading="lazy"
                      width={32}
                      height={32}
                      style={{ borderRadius: "var(--r-sm)" }}
                    />
                  ) : null}
                  <div className="col grow gap-2">
                    <h3 className="repo-name" style={{ margin: 0 }}>
                      <Link href={detailHref} prefetch={false}>
                        {repo.fullName}
                      </Link>
                    </h3>
                    <p className="muted" style={{ margin: 0 }}>
                      {blurb}
                    </p>
                    <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                      <span className="chip num" title="GitHub stars">
                        ★ {compact(repo.stars ?? 0)}
                      </span>
                      <span className={deltaCls} title="Stars in the last 24h">
                        {delta > 0 ? `+${compact(delta)}` : compact(delta)} · 24h
                      </span>
                      <span className="chip num" title="Momentum score (0-100)">
                        momentum {Math.round(repo.momentumScore ?? 0)}
                      </span>
                      {repo.language ? <span className="chip">{repo.language}</span> : null}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
