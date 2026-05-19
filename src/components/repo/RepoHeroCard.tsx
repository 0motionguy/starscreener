// RepoHeroCard — left column of the repo-detail hero. Identity (avatar,
// handle, name, description, tags) + the action row (Watch / Set alert /
// Compare / Tier list / Visit + share menu).
//
// Active state on .watch-btn is owned by <WatchButton/> (client). The other
// buttons are inert — Set Alert / Compare / Tier list will get their own
// client wires in a later phase. Watching count is server-side baseline.

import type { Repo } from "@/lib/types";

import { WatchButton } from "./WatchButton";

interface RepoHeroCardProps {
  repo: Repo;
}

function deriveAvatarSeed(name: string): string {
  const ch = (name || "").trim().charAt(0).toUpperCase();
  return ch || "?";
}

export function RepoHeroCard({ repo }: RepoHeroCardProps) {
  const trendBadgeRank =
    typeof repo.rank === "number" && repo.rank > 0 ? `#${repo.rank}` : null;
  const tags = (repo.tags ?? repo.topics ?? []).slice(0, 5);
  const avatarSeed = deriveAvatarSeed(repo.name || repo.owner);
  const visible = repo.url;

  return (
    <div className="hero-card">
      <div className="hero-row">
        <div
          className="repo-avatar xl"
          style={{
            background: "var(--surface-3)",
            color: "var(--fg-bright)",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
          }}
          aria-hidden="true"
        >
          {avatarSeed}
        </div>
        <div className="hero-meta">
          <div
            className="hero-handle"
            data-repo-hover
            data-repo={repo.fullName}
          >
            <span className="owner">{repo.owner}</span>/
            <span className="name">{repo.name}</span>
            <span className="muted" style={{ marginLeft: 8 }}>
              {repo.language ? `· public · ${repo.language}` : "· public"}
            </span>
          </div>
          <h1 className="hero-name">{repo.name}</h1>
          {repo.description ? (
            <p className="hero-desc">{repo.description}</p>
          ) : null}
          {tags.length > 0 ? (
            <div className="hero-tags">
              {tags.map((t) => (
                <span key={t} className="tag">
                  {t.toUpperCase()}
                </span>
              ))}
              {trendBadgeRank ? (
                <span className="tag up">▲ TRENDING {trendBadgeRank}</span>
              ) : null}
            </div>
          ) : null}
          <div className="hero-actions">
            <WatchButton
              repoId={repo.id}
              fullName={repo.fullName}
              stars={repo.stars}
            />
            <button type="button" className="btn" data-alert-toggle>
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M3 12V8a5 5 0 0110 0v4l1 2H2l1-2zM6 14a2 2 0 004 0" />
              </svg>
              Set alert
            </button>
            <button type="button" className="btn" data-compare>
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M3 8h4l1-3 2 6 1-3h2" />
              </svg>
              Compare
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled
              aria-disabled="true"
              title="Tier list rebuild pending"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <rect x="2.5" y="3" width="11" height="10" rx="1" />
                <path d="M5 6h6m-6 3h6m-6 3h3" />
              </svg>
              Tier list
            </button>
            {visible ? (
              <a
                className="btn ghost"
                href={repo.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d="M3 8a5 5 0 015-5m0 10a5 5 0 005-5M5 8h6M8 5l3 3-3 3" />
                </svg>
                Visit
              </a>
            ) : null}
            <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              <button
                type="button"
                className="btn ghost sm"
                title="Share / Embed"
                aria-label="Share or embed"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <circle cx="4" cy="8" r="2" />
                  <circle cx="12" cy="4" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <path d="M6 7l4-2m-4 4l4 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
