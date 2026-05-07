// // 04 CONTEXT — left panel: organization / owner profile.
//
// Server component. Pulls the GitHub user/org profile via
// `fetchGithubUserProfile(login)` (24h ISR cache), and renders the same set
// of fields the mockup shows: avatar, name, type tag, bio, location, blog,
// twitter, public-repo count, follower count, GITHUB + FOLLOW buttons.
//
// The `repo.owner` is passed in by the page; we don't depend on the rest of
// the Repo here so the panel can be reused for owner-only surfaces if needed.

import type { JSX } from "react";
import { fetchGithubUserProfile } from "@/lib/github-user";
import { formatNumber } from "@/lib/utils";

interface OrganizationCardProps {
  owner: string;
}

export async function OrganizationCard({
  owner,
}: OrganizationCardProps): Promise<JSX.Element> {
  const profile = await fetchGithubUserProfile(owner);

  if (!profile) {
    return (
      <section className="org-card org-card-empty">
        <header className="oc-head">
          <span className="oc-eyebrow">{"// ORGANIZATION · "}{owner.toUpperCase()}</span>
        </header>
        <p className="oc-empty-text">
          Couldn&apos;t load the GitHub profile for{" "}
          <code>{owner}</code>. The repo still works; this side panel is a
          best-effort enrichment.
        </p>
        <a
          className="oc-btn"
          href={`https://github.com/${owner}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          GITHUB ↗
        </a>
        {scopedStyles}
      </section>
    );
  }

  const tagLabel = profile.type === "Organization" ? "ORG" : "USER";
  const blogHref = profile.blog
    ? profile.blog.startsWith("http")
      ? profile.blog
      : `https://${profile.blog}`
    : null;

  return (
    <section className="org-card">
      <header className="oc-head">
        <span className="oc-eyebrow">
          {"// ORGANIZATION · "}{profile.login.toUpperCase()}
        </span>
      </header>
      <div className="oc-id">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={profile.avatarUrl}
          alt=""
          width={56}
          height={56}
          className="oc-avatar"
          loading="lazy"
        />
        <div className="oc-id-meta">
          <h3 className="oc-name">
            {profile.name ?? profile.login}
          </h3>
          <p className="oc-tag">
            <span>{profile.login}</span>
            <span className="dot">·</span>
            <span className="oc-tag-pill">{tagLabel}</span>
          </p>
        </div>
      </div>
      {profile.bio ? <p className="oc-bio">{profile.bio}</p> : null}
      <ul className="oc-rows">
        {profile.location ? (
          <li>
            <span className="oc-row-icon" aria-hidden>📍</span>
            <span>{profile.location}</span>
          </li>
        ) : null}
        {blogHref ? (
          <li>
            <span className="oc-row-icon" aria-hidden>🔗</span>
            <a href={blogHref} target="_blank" rel="noopener noreferrer">
              {profile.blog}
            </a>
          </li>
        ) : null}
        {profile.twitterUsername ? (
          <li>
            <span className="oc-row-icon" aria-hidden>𝕏</span>
            <a
              href={`https://x.com/${profile.twitterUsername}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              @{profile.twitterUsername}
            </a>
          </li>
        ) : null}
        <li>
          <span className="oc-row-icon" aria-hidden>📦</span>
          <span>{formatNumber(profile.publicRepos)} public repos</span>
        </li>
        <li>
          <span className="oc-row-icon" aria-hidden>★</span>
          <span>{formatNumber(profile.followers)} followers</span>
        </li>
      </ul>
      <div className="oc-actions">
        <a
          className="oc-btn"
          href={profile.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          GITHUB ↗
        </a>
        <a
          className="oc-btn oc-btn-secondary"
          href={`https://github.com/${profile.login}?tab=followers`}
          target="_blank"
          rel="noopener noreferrer"
        >
          FOLLOW
        </a>
      </div>
      {scopedStyles}
    </section>
  );
}

const scopedStyles = (
  <style>{`
    .org-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      border: 1px solid var(--v3-line-100, rgba(255,255,255,0.08));
      border-radius: 3px;
      background: var(--v3-bg-050, rgba(255,255,255,0.025));
    }
    .oc-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .oc-eyebrow {
      font-family: var(--font-geist-mono, monospace);
      font-size: 10px;
      letter-spacing: 0.16em;
      color: var(--v3-ink-300, rgba(255,255,255,0.7));
      text-transform: uppercase;
    }
    .oc-id {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .oc-avatar {
      width: 56px;
      height: 56px;
      border-radius: 4px;
      object-fit: cover;
      background: var(--v3-bg-100, rgba(255,255,255,0.05));
      border: 1px solid var(--v3-line-100);
    }
    .oc-id-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .oc-name {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--v3-ink-100, #fff);
      letter-spacing: -0.01em;
    }
    .oc-tag {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-geist-mono, monospace);
      font-size: 11px;
      color: var(--v3-ink-400, rgba(255,255,255,0.55));
    }
    .oc-tag .dot { color: var(--v3-ink-400); }
    .oc-tag-pill {
      padding: 2px 6px;
      border: 1px solid var(--v3-line-200);
      border-radius: 2px;
      letter-spacing: 0.12em;
      font-size: 9px;
      color: var(--v3-ink-300);
    }
    .oc-bio {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--v3-ink-200, rgba(255,255,255,0.8));
    }
    .oc-rows {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .oc-rows li {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-geist-mono, monospace);
      font-size: 11px;
      color: var(--v3-ink-300, rgba(255,255,255,0.7));
    }
    .oc-rows a { color: var(--v3-acc, #ffcb05); text-decoration: none; }
    .oc-rows a:hover { text-decoration: underline; }
    .oc-row-icon {
      width: 14px;
      display: inline-flex;
      justify-content: center;
      color: var(--v3-ink-400);
    }
    .oc-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: auto;
    }
    .oc-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 9px 12px;
      font-family: var(--font-geist-mono, monospace);
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      border: 1px solid var(--v3-line-200, rgba(255,255,255,0.16));
      border-radius: 2px;
      background: transparent;
      color: var(--v3-ink-100, #fff);
      text-decoration: none;
      transition: background 120ms, border-color 120ms;
    }
    .oc-btn:hover {
      background: var(--v3-bg-100, rgba(255,255,255,0.05));
      border-color: var(--v3-acc, #ffcb05);
    }
    .oc-btn-secondary { color: var(--v3-ink-300); }
    .oc-empty-text {
      margin: 0;
      font-size: 12px;
      color: var(--v3-ink-300);
    }
    .oc-empty-text code {
      font-family: var(--font-geist-mono, monospace);
      color: var(--v3-ink-200);
    }
  `}</style>
);

export default OrganizationCard;
