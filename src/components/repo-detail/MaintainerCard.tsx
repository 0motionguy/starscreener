// MaintainerCard — surfaces the human/org behind a repo.
//
// Server component. Pulls the GitHub user/org profile via
// fetchGithubUserProfile (24h ISR). Renders avatar, login, display name,
// bio, location, twitter, blog, and a "View on GitHub →" link.
//
// Graceful degradation policy:
//   - No data at all (rate-limited / network / deleted user) → render a
//     minimal fallback using the `repo.ownerAvatarUrl` + login.
//   - Full data is unusable (invalid login on first call return) → return
//     `null` and let the parent omit the column. The page must still look
//     correct without this card.
//
// Org vs user: GitHub's user endpoint returns `type: "Organization"` when
// the login owns an org account. We swap the card's eyebrow label from
// MAINTAINER to ORGANIZATION accordingly so the card reads truthfully
// (no individual on the other side).
//
// All external links are `target="_blank" rel="noopener noreferrer"` with
// the lucide ExternalLink icon for the consistent affordance the rest of
// the detail page uses.

import type { JSX } from "react";
import Link from "next/link";
import { ExternalLink, MapPin, Globe } from "lucide-react";

import {
  fetchGithubUserProfile,
  type GithubUserProfile,
} from "@/lib/github-user";

interface MaintainerCardProps {
  /** GitHub login (owner slug) — `repo.owner`. */
  owner: string;
  /** Avatar fallback when the GitHub fetch fails (use repo.ownerAvatarUrl). */
  fallbackAvatarUrl: string;
}

const BIO_MAX = 200;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Normalize the `blog` field from GitHub into a usable href. Many users
 * type their site without a protocol ("example.com"); we prepend https:// so
 * the link works without forcing the user to type it.
 */
function normalizeBlogUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function blogDisplayLabel(raw: string): string {
  // Strip protocol + trailing slash for the visible label so the link
  // doesn't dominate the card on tall screens.
  return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

interface CardShellProps {
  eyebrow: string;
  avatarUrl: string;
  login: string;
  htmlUrl: string;
  children?: React.ReactNode;
}

function CardShell({
  eyebrow,
  avatarUrl,
  login,
  htmlUrl,
  children,
}: CardShellProps): JSX.Element {
  return (
    <aside
      className="rounded-card border border-border-primary bg-bg-card shadow-card p-4 font-mono"
      aria-label={`${eyebrow.toLowerCase()} — ${login}`}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-3">
        {eyebrow}
      </div>

      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={login}
          width={48}
          height={48}
          loading="lazy"
          className="size-12 shrink-0 rounded-full border border-border-primary object-cover"
        />
        <div className="flex-1 min-w-0">{children}</div>
      </div>

      <div className="mt-4 pt-3 border-t border-border-primary">
        <a
          href={htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-brand transition-colors"
        >
          View on GitHub
          <ExternalLink size={12} aria-hidden />
        </a>
      </div>
    </aside>
  );
}

function MaintainerCardFallback({
  owner,
  fallbackAvatarUrl,
}: MaintainerCardProps): JSX.Element {
  return (
    <CardShell
      eyebrow="MAINTAINER"
      avatarUrl={fallbackAvatarUrl}
      login={owner}
      htmlUrl={`https://github.com/${owner}`}
    >
      <Link
        href={`https://github.com/${owner}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-display text-base font-semibold text-text-primary hover:text-brand transition-colors truncate block"
      >
        {owner}
      </Link>
      <p className="text-[11px] text-text-tertiary mt-1">
        Profile details unavailable.
      </p>
    </CardShell>
  );
}

function MaintainerCardContent({
  profile,
  fallbackAvatarUrl,
}: {
  profile: GithubUserProfile;
  fallbackAvatarUrl: string;
}): JSX.Element {
  const isOrg = profile.type === "Organization";
  const eyebrow = isOrg ? "ORGANIZATION" : "MAINTAINER";
  // Some accounts respond without an avatar_url field (extremely rare —
  // we already guard for it in the loader, but keep a hard fallback so a
  // partial profile never renders a broken image).
  const avatar = profile.avatarUrl || fallbackAvatarUrl;
  const displayName =
    profile.name && profile.name !== profile.login ? profile.name : null;
  const bio = profile.bio ? truncate(profile.bio, BIO_MAX) : null;

  return (
    <CardShell
      eyebrow={eyebrow}
      avatarUrl={avatar}
      login={profile.login}
      htmlUrl={profile.htmlUrl}
    >
      <Link
        href={profile.htmlUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-display text-base font-semibold text-text-primary hover:text-brand transition-colors truncate block"
      >
        {profile.login}
      </Link>
      {displayName && (
        <p className="text-xs text-text-secondary mt-0.5 truncate">
          {displayName}
        </p>
      )}

      {bio && (
        <p className="mt-2 text-xs text-text-secondary leading-snug">{bio}</p>
      )}

      {(profile.location ||
        profile.twitterUsername ||
        profile.blog) && (
        <ul className="mt-3 space-y-1.5 text-[11px]">
          {profile.location && (
            <li className="inline-flex items-center gap-1.5 text-text-tertiary">
              <MapPin size={11} aria-hidden />
              <span className="truncate">{profile.location}</span>
            </li>
          )}
          {profile.twitterUsername && (
            <li>
              <a
                href={`https://x.com/${profile.twitterUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-text-secondary hover:text-brand transition-colors"
              >
                <span
                  aria-hidden
                  className="bg-text-primary text-bg-card text-[8px] font-bold w-3 h-3 leading-none rounded-sm flex items-center justify-center"
                >
                  X
                </span>
                <span className="truncate">@{profile.twitterUsername}</span>
                <ExternalLink size={10} aria-hidden className="text-text-tertiary" />
              </a>
            </li>
          )}
          {profile.blog && (
            <li>
              <a
                href={normalizeBlogUrl(profile.blog)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-text-secondary hover:text-brand transition-colors max-w-full"
              >
                <Globe size={11} aria-hidden />
                <span className="truncate">{blogDisplayLabel(profile.blog)}</span>
                <ExternalLink size={10} aria-hidden className="text-text-tertiary shrink-0" />
              </a>
            </li>
          )}
        </ul>
      )}
    </CardShell>
  );
}

/**
 * MaintainerCard — async server component. Fetches the owner's GitHub
 * profile and renders an at-a-glance card. Returns a minimal fallback
 * card on any fetch failure (never throws, never returns null when the
 * caller already mounted it — we always render *something* useful).
 */
export async function MaintainerCard({
  owner,
  fallbackAvatarUrl,
}: MaintainerCardProps): Promise<JSX.Element> {
  const profile = await fetchGithubUserProfile(owner);
  if (!profile) {
    return (
      <MaintainerCardFallback
        owner={owner}
        fallbackAvatarUrl={fallbackAvatarUrl}
      />
    );
  }
  return (
    <MaintainerCardContent
      profile={profile}
      fallbackAvatarUrl={fallbackAvatarUrl}
    />
  );
}

export default MaintainerCard;
