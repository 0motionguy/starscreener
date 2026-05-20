import Link from "next/link";

import type { RepoProfile } from "@/lib/repo-profiles";
import type { Repo } from "@/lib/types";

import { RepoCompareButton } from "./RepoCompareButton";
import { WatchButton } from "./WatchButton";

interface RepoHeroCardProps {
  repo: Repo;
  profile?: RepoProfile | null;
}

function deriveAvatarSeed(name: string): string {
  const clean = (name || "").trim();
  return clean.charAt(0).toUpperCase() || "?";
}

function formatBaselineWatchers(repo: Repo): number {
  const mentionBase = repo.mentions?.total7d ?? repo.mentionCount24h ?? 0;
  const starBase = repo.starsDelta7d > 0 ? repo.starsDelta7d / 40 : 0;
  return Math.max(1, Math.round(mentionBase / 12 + starBase));
}

export function RepoHeroCard({ repo, profile }: RepoHeroCardProps) {
  const trendBadgeRank =
    typeof repo.rank === "number" && repo.rank > 0 ? `#${repo.rank}` : null;
  const tags = (repo.tags ?? repo.topics ?? []).slice(0, 5);
  const avatarSeed = deriveAvatarSeed(repo.name || repo.owner);
  const npmPackage = profile?.surfaces.npmPackages[0] ?? null;
  const visible = repo.url;
  const activeAlerts =
    (repo.starsDelta24h > 0 ? 1 : 0) +
    ((repo.channelsFiring ?? 0) >= 3 ? 1 : 0) +
    (repo.lastReleaseTag ? 1 : 0);
  const shareText = `${repo.fullName} is trending on TrendingRepo`;
  const alertHref = `/account?tab=alerts&repo=${encodeURIComponent(repo.fullName)}`;

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
              {" · public"}
              {repo.language ? ` · ${repo.language}` : ""}
              {npmPackage ? ` · ${npmPackage}` : ""}
            </span>
          </div>
          <h1 className="hero-name">{repo.name}</h1>
          {repo.description ? (
            <p className="hero-desc">{repo.description}</p>
          ) : null}
          {tags.length > 0 || trendBadgeRank ? (
            <div className="hero-tags">
              {tags.map((tag, index) => (
                <span key={tag} className={`tag${index === 0 ? " brand" : ""}`}>
                  {tag.toUpperCase()}
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
              baselineWatchers={formatBaselineWatchers(repo)}
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
              {activeAlerts > 0 ? (
                <span
                  style={{
                    marginLeft: 4,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--up)",
                  }}
                >
                  ▲ {activeAlerts} armed
                </span>
              ) : null}
            </button>
            <RepoCompareButton repoId={repo.id} fullName={repo.fullName} />
            <Link
              className="btn ghost"
              href={`/tools/tier-list?seed=${encodeURIComponent(repo.fullName)}`}
              title={`Open tier-list workspace seeded with ${repo.fullName}`}
              prefetch={false}
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
            </Link>
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
              <div className="share-wrap">
                <button
                  type="button"
                  className="share-btn"
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
                  Share
                </button>
                <div className="share-menu">
                  <div className="item x" data-share="x" data-text={shareText}>
                    <span className="sm-ico">X</span>Share to X
                  </div>
                  <div className="item li" data-share="li">
                    <span className="sm-ico">in</span>Share to LinkedIn
                  </div>
                  <div className="item rd" data-share="rd" data-text={shareText}>
                    <span className="sm-ico">R</span>Share to Reddit
                  </div>
                  <div className="item bs" data-share="bs" data-text={shareText}>
                    <span className="sm-ico">B</span>Share to Bluesky
                  </div>
                  <div className="divider" />
                  <div className="item cp" data-share="cp">
                    <span className="sm-ico">⌧</span>Copy link
                  </div>
                  <div className="item em" data-share="em">
                    <span className="sm-ico">&lt;/&gt;</span>Embed widget
                    <span className="pro-tag">PRO</span>
                  </div>
                  <div className="item" data-share="rss">
                    <span className="sm-ico">RSS</span>Copy RSS URL
                    <span className="pro-tag">PRO</span>
                  </div>
                </div>
              </div>
              <Link className="btn ghost sm" href={`${alertHref}&delivery=rss`} title="RSS / Webhook">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d="M3 11a4 4 0 014 4M3 7a8 8 0 018 8" />
                  <circle cx="3" cy="13" r="1.4" fill="currentColor" />
                </svg>
              </Link>
            </div>
          </div>

          <div className="alert-config" data-alert-panel style={{ marginTop: 10 }}>
            <span className="ac-label">Alert me when</span>
            <button type="button" className="ac-token">
              stars rise <b>+5%</b> in <b>24h</b>
              <span className="arr">▼</span>
            </button>
            <span className="ac-label">OR</span>
            <button type="button" className="ac-token">
              mentions hit <b>top-10</b>
              <span className="arr">▼</span>
            </button>
            <span className="ac-label">DELIVER via</span>
            <button type="button" className="ac-token">
              Email · Slack
              <span className="arr">▼</span>
            </button>
            <span className="grow" />
            <span className="pro-lock">
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M5 7V5a3 3 0 016 0v2h1v7H4V7h1zm5 0V5a2 2 0 10-4 0v2h4z" />
              </svg>
              RSS · Webhook · SMS
            </span>
            <Link className="btn primary sm" href={alertHref}>
              Save alert
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
