// WatchlistSuggestions — server-rendered grid of curated repos to pin.
//
// Server picks top-6 by 7d star delta from the derived corpus so the page
// always has a meaningful CTA even when the user's watchlist is empty.
// Each tile carries a small `<PinButton>` client island wired to the
// Zustand store via `useWatchlistStore.addRepo`. The tile body itself
// stays server so the LCP / metadata pass doesn't churn on hydration.

import Link from "next/link";
import Image from "next/image";

import type { Repo } from "@/lib/types";
import { slugToId } from "@/lib/utils";

import { PinButton } from "./PinButton";

interface WatchlistSuggestionsProps {
  repos: Repo[];
}

function formatStars(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN) || n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function formatSignedDelta(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN) || n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  const compact =
    abs >= 1_000 ? `${(abs / 1_000).toFixed(1)}K` : Math.round(abs).toLocaleString();
  if (n > 0) return `+${compact}`;
  if (n < 0) return `-${compact}`;
  return "0";
}

export function WatchlistSuggestions({ repos }: WatchlistSuggestionsProps) {
  return (
    <section className="wl-suggestions" aria-labelledby="wl-suggestions-head">
      <div className="wl-eyebrow">
        <span className="num">{"// 02"}</span>
        <span className="title" id="wl-suggestions-head">
          Suggested pins
        </span>
        <span className="meta">
          top <b>{repos.length}</b> by 7-day star delta
        </span>
      </div>
      {repos.length === 0 ? (
        <div className="wl-suggestions-empty">
          No suggestions available right now. Check back once the trending
          pipeline has surfaced movers.
        </div>
      ) : (
        <div className="wl-suggestions-grid">
          {repos.map((repo) => {
            const href = `/repo/${repo.owner}/${repo.name}`;
            const repoId = slugToId(repo.fullName);
            return (
              <article key={repo.fullName} className="wl-tile">
                <header className="wl-tile-head">
                  <div className="wl-tile-avatar" aria-hidden="true">
                    {repo.ownerAvatarUrl ? (
                      <Image
                        src={repo.ownerAvatarUrl}
                        alt=""
                        width={28}
                        height={28}
                        unoptimized
                        style={{
                          borderRadius: 2,
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <span className="wl-tile-avatar-fallback">
                        {repo.owner.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="wl-tile-id">
                    <Link
                      href={href}
                      prefetch={false}
                      className="wl-tile-name"
                    >
                      <span className="muted">{repo.owner}/</span>
                      {repo.name}
                    </Link>
                    <span className="wl-tile-lang">
                      {repo.language ?? "—"}
                    </span>
                  </div>
                  <PinButton
                    repoId={repoId}
                    fullName={repo.fullName}
                    stars={repo.stars ?? 0}
                  />
                </header>
                {repo.description ? (
                  <p className="wl-tile-desc">{repo.description}</p>
                ) : null}
                <dl className="wl-tile-stats">
                  <div>
                    <dt>Stars</dt>
                    <dd>{formatStars(repo.stars)}</dd>
                  </div>
                  <div>
                    <dt>24h</dt>
                    <dd className={(repo.starsDelta24h ?? 0) > 0 ? "up" : "muted"}>
                      {formatSignedDelta(repo.starsDelta24h)}
                    </dd>
                  </div>
                  <div>
                    <dt>7d</dt>
                    <dd className={(repo.starsDelta7d ?? 0) > 0 ? "up" : "muted"}>
                      {formatSignedDelta(repo.starsDelta7d)}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
