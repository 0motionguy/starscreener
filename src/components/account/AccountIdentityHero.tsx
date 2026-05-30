// AccountIdentityHero — tight single-row identity strip (operator decree
// 2026-05-30: the previous hero card wasted ~280px of vertical space with a
// huge 88px avatar, stacked actions and oversized typography). Now it's a
// terminal-style header bar: 44px avatar, inline name + handle + tier chip
// + watching counter + member-since, actions docked to the right.
//
// Same data contract as before; only the layout/typography moved.

import Link from "next/link";
import { Icon } from "@/lib/icons";
import { AccountSignOut } from "@/components/account/AccountSignOut";
import type { TierDefinition, UserTier } from "@/lib/pricing/tiers";

interface Props {
  displayName: string;
  handle: string;
  email: string | null;
  memberSince: Date | string | null;
  tier: TierDefinition;
  watchingCount: number;
  watchingCap: number;
  // Server-resolved Boolean(getClerkPublishableKey()). The sign-out control is
  // a Clerk component that throws without a mounted ClerkProvider, so we only
  // render it when auth is actually enabled.
  authEnabled: boolean;
}

function initials(name: string, handle: string): string {
  const cleaned = name.trim();
  if (cleaned.length > 0) {
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleaned.slice(0, 2).toUpperCase();
  }
  return handle.slice(0, 2).toUpperCase();
}

function formatMemberSince(value: Date | string | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function formatTierLabel(tier: UserTier): string {
  return tier.toUpperCase();
}

export function AccountIdentityHero(props: Props) {
  const {
    displayName,
    handle,
    email,
    memberSince,
    tier,
    watchingCount,
    watchingCap,
    authEnabled,
  } = props;

  const capLabel = watchingCap < 0 ? "∞" : watchingCap.toString();
  const memberSinceLabel = formatMemberSince(memberSince);

  return (
    <header className="id-strip" aria-label="Account identity">
      <div className="id-strip-avatar" aria-hidden="true">
        {initials(displayName, handle)}
      </div>

      <div className="id-strip-core">
        <div className="id-strip-line1">
          <h1 className="id-strip-name">{displayName}</h1>
          <span className="id-strip-handle">@{handle}</span>
          <span className="id-strip-divider" aria-hidden="true" />
          <span className="tag brand id-strip-tier">{formatTierLabel(tier.key)}</span>
          <span className="id-strip-watching">
            <Icon name="bookmark" size={11} />
            <b>{watchingCount}</b>
            <span className="muted">/{capLabel}</span>
            <span className="id-strip-watching-label">watching</span>
          </span>
        </div>
        <div className="id-strip-line2">
          <span className="id-strip-meta">
            <span className="muted">member since</span> {memberSinceLabel}
          </span>
          {email ? (
            <>
              <span className="id-strip-dot" aria-hidden="true">·</span>
              <span className="id-strip-meta id-strip-email" title={email}>
                {email}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="id-strip-actions">
        <Link className="btn sm" href={`/u/${handle}`}>
          <Icon name="external" size={12} />
          Public profile
        </Link>
        {authEnabled ? <AccountSignOut /> : null}
      </div>
    </header>
  );
}
