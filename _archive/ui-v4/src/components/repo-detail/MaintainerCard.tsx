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
import { EntityLogo } from "@/components/ui/EntityLogo";

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
      className="v2-card overflow-hidden font-mono"
      aria-label={`${eyebrow.toLowerCase()} — ${login}`}
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
        <span className="flex-1 truncate" style={{ color: "var(--v2-ink-200)" }}>
          {`// ${eyebrow} · ${login.toUpperCase()}`}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* AUDIT-2026-05-04: switched from next/image to EntityLogo so a
              broken/blocked avatar URL falls back to a monogram instead
              of a dead grey square (next/image errors silently in prod
              when remotePatterns blocks the domain). */}
          <EntityLogo
            src={avatarUrl}
            name={login}
            size={48}
            shape="square"
            alt={login}
          />
          <div className="flex-1 min-w-0">{children}</div>
        </div>

        <div
          className="mt-4 pt-3"
          style={{ borderTop: "1px solid var(--v2-line-std)" }}
        >
          <a
            href={htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="v2-btn v2-btn-ghost"
            style={{ height: 32, padding: "0 12px", fontSize: 10 }}
          >
            VIEW ON GITHUB
            <ExternalLink size={11} aria-hidden style={{ marginLeft: 8 }} />
          </a>
        </div>
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
        className="block truncate"
        style={{
          fontFamily: "var(--font-geist), Inter, sans-serif",
          fontSize: 16,
          fontWeight: 510,
          color: "var(--v2-ink-100)",
        }}
      >
        {owner}
      </Link>
      <p
        className="v2-mono mt-1"
        style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
      >
        {"// PROFILE UNAVAILABLE"}
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
        className="block truncate"
        style={{
          fontFamily: "var(--font-geist), Inter, sans-serif",
          fontSize: 16,
          fontWeight: 510,
          color: "var(--v2-ink-100)",
        }}
      >
        {profile.login}
      </Link>
      {displayName && (
        <p
          className="mt-0.5 truncate"
          style={{ fontSize: 12, color: "var(--v2-ink-300)" }}
        >
          {displayName}
        </p>
      )}

      {bio && (
        <p
          className="mt-2 leading-snug"
          style={{ fontSize: 12, color: "var(--v2-ink-200)" }}
        >
          {bio}
        </p>
      )}

      {(profile.location ||
        profile.twitterUsername ||
        profile.blog) && (
        <ul className="mt-3 space-y-1.5" style={{ fontSize: 11 }}>
          {profile.location && (
            <li
              className="inline-flex items-center gap-1.5"
              style={{ color: "var(--v2-ink-300)" }}
            >
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
                className="inline-flex items-center gap-1.5 transition-colors"
                style={{ color: "var(--v2-ink-200)" }}
              >
                <span
                  aria-hidden
                  className="flex items-center justify-center"
                  style={{
                    background: "var(--v2-ink-100)",
                    color: "var(--v2-bg-000)",
                    fontSize: 8,
                    fontWeight: 700,
                    width: 12,
                    height: 12,
                    lineHeight: 1,
                    borderRadius: 1,
                  }}
                >
                  X
                </span>
                <span className="truncate">@{profile.twitterUsername}</span>
                <ExternalLink
                  size={10}
                  aria-hidden
                  style={{ color: "var(--v2-ink-400)" }}
                />
              </a>
            </li>
          )}
          {profile.blog && (
            <li>
              <a
                href={normalizeBlogUrl(profile.blog)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 max-w-full transition-colors"
                style={{ color: "var(--v2-ink-200)" }}
              >
                <Globe size={11} aria-hidden />
                <span className="truncate">{blogDisplayLabel(profile.blog)}</span>
                <ExternalLink
                  size={10}
                  aria-hidden
                  className="shrink-0"
                  style={{ color: "var(--v2-ink-400)" }}
                />
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
