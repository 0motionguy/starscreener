// AccountIdentityHero — slim .id-hero block: avatar, name, handle, member-since,
// email, tier/watching tags, plus "view public profile" + sign-out. The legacy
// plan-card and the in-hero tab buttons were removed when /account collapsed to
// a single screen (billing now lives in AccountBillingPanel on /account).

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

  return (
    <div className="id-hero">
      <div className="id-avatar" aria-hidden="true">
        {initials(displayName, handle)}
      </div>
      <div className="id-meta">
        <h1 className="id-name">{displayName}</h1>
        <div className="id-handle">
          @<b>{handle}</b> · member since <b>{formatMemberSince(memberSince)}</b>
          {email ? (
            <>
              {" "}
              · <b>{email}</b>
            </>
          ) : null}
        </div>
        <div className="id-tags">
          <span className="tag brand">{formatTierLabel(tier.key)}</span>
          {watchingCount > 0 ? (
            <span className="tag">
              {watchingCount}/{capLabel} WATCHING
            </span>
          ) : null}
        </div>
        <div className="id-actions" style={{ marginTop: 6 }}>
          <Link className="btn" href={`/u/${handle}`}>
            <Icon name="external" size="md" />
            View public profile
          </Link>
          {authEnabled ? <AccountSignOut /> : null}
        </div>
      </div>
    </div>
  );
}
