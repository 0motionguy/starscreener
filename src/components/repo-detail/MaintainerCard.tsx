// MaintainerCard — V4. Surfaces the human/org behind a repo.
//
// Server component. Pulls the GitHub user/org profile via
// fetchGithubUserProfile (24h ISR). Renders avatar, login, display name,
// bio, location, twitter, blog, and a "View on GitHub →" link inside a
// V4 PanelHead-titled aside.
//
// Graceful degradation policy:
//   - No data at all (rate-limited / network / deleted user) → render a
//     minimal fallback using the `repo.ownerAvatarUrl` + login.
//   - Full data is unusable (invalid login on first call return) → return
//     a minimal fallback so the rail layout doesn't collapse.
//
// Org vs user: GitHub's user endpoint returns `type: "Organization"` when
// the login owns an org account. We swap the panel head label from
// MAINTAINER to ORGANIZATION accordingly so the card reads truthfully.

import type { JSX, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, MapPin, Globe } from "lucide-react";

import {
  fetchGithubUserProfile,
  type GithubUserProfile,
} from "@/lib/github-user";
import { PanelHead } from "@/components/ui/PanelHead";

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

function normalizeBlogUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function blogDisplayLabel(raw: string): string {
  return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

interface CardShellProps {
  eyebrow: string;
  avatarUrl: string;
  login: string;
  htmlUrl: string;
  children?: ReactNode;
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
      aria-label={`${eyebrow.toLowerCase()} — ${login}`}
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-025)",
        borderRadius: 2,
        overflow: "hidden",
        fontFamily: "var(--font-geist-mono), monospace",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-050)",
        }}
      >
        <PanelHead k={`// ${eyebrow}`} sub={login.toUpperCase()} />
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <Image
            src={avatarUrl}
            name={login}
            size={48}
            shape="square"
            alt={login}
            width={48}
            height={48}
            style={{
              width: 48,
              height: 48,
              flexShrink: 0,
              objectFit: "cover",
              borderRadius: 2,
              border: "1px solid var(--v4-line-200)",
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        </div>

        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--v4-line-200)",
          }}
        >
          <a
            href={htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              padding: "6px 12px",
              border: "1px solid var(--v4-line-300)",
              borderRadius: 2,
              color: "var(--v4-ink-100)",
              background: "var(--v4-bg-050)",
              textDecoration: "none",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            VIEW ON GITHUB
            <ExternalLink size={11} aria-hidden />
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
        style={{
          display: "block",
          fontFamily: "var(--font-geist), Inter, sans-serif",
          fontSize: 16,
          fontWeight: 510,
          color: "var(--v4-ink-100)",
          textDecoration: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {owner}
      </Link>
      <p
        style={{
          marginTop: 4,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          color: "var(--v4-ink-400)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
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
        style={{
          display: "block",
          fontFamily: "var(--font-geist), Inter, sans-serif",
          fontSize: 16,
          fontWeight: 510,
          color: "var(--v4-ink-100)",
          textDecoration: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {profile.login}
      </Link>
      {displayName ? (
        <p
          style={{
            marginTop: 2,
            fontSize: 12,
            color: "var(--v4-ink-300)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayName}
        </p>
      ) : null}

      {bio ? (
        <p
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--v4-ink-200)",
            lineHeight: 1.4,
          }}
        >
          {bio}
        </p>
      ) : null}

      {profile.location || profile.twitterUsername || profile.blog ? (
        <ul
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 11,
            listStyle: "none",
            padding: 0,
          }}
        >
          {profile.location ? (
            <li
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "var(--v4-ink-300)",
              }}
            >
              <MapPin size={11} aria-hidden />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {profile.location}
              </span>
            </li>
          ) : null}
          {profile.twitterUsername ? (
            <li>
              <a
                href={`https://x.com/${profile.twitterUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--v4-ink-200)",
                  textDecoration: "none",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--v4-ink-100)",
                    color: "var(--v4-bg-000)",
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
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  @{profile.twitterUsername}
                </span>
                <ExternalLink
                  size={10}
                  aria-hidden
                  style={{ color: "var(--v4-ink-400)" }}
                />
              </a>
            </li>
          ) : null}
          {profile.blog ? (
            <li>
              <a
                href={normalizeBlogUrl(profile.blog)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  maxWidth: "100%",
                  color: "var(--v4-ink-200)",
                  textDecoration: "none",
                }}
              >
                <Globe size={11} aria-hidden />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {blogDisplayLabel(profile.blog)}
                </span>
                <ExternalLink
                  size={10}
                  aria-hidden
                  style={{ color: "var(--v4-ink-400)", flexShrink: 0 }}
                />
              </a>
            </li>
          ) : null}
        </ul>
      ) : null}
    </CardShell>
  );
}

/**
 * MaintainerCard — async server component. Fetches the owner's GitHub
 * profile and renders an at-a-glance V4 card. Returns a minimal fallback
 * on any fetch failure (never throws).
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
