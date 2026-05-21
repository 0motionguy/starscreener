// AccountIdentityHero — .id-hero block with avatar, name, handle, bio,
// tags, action buttons and a .plan-card on the right.

import Link from "next/link";
import { ExternalLink, Plus, Settings } from "lucide-react";
import type { TierDefinition, UserTier } from "@/lib/pricing/tiers";
import type { UserTierRecord } from "@/lib/pricing/user-tiers";

interface Props {
  displayName: string;
  handle: string;
  email: string | null;
  memberSince: Date | string | null;
  timezone: string;
  tier: TierDefinition;
  tierRecord: UserTierRecord | null;
  watchingCount: number;
  watchingCap: number;
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

function formatPrice(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return "—";
  if (usd === 0) return "$0";
  return `$${usd}/mo`;
}

function formatRenewal(record: UserTierRecord | null): string {
  if (!record?.expiresAt) return "no expiry";
  const d = new Date(record.expiresAt);
  if (Number.isNaN(d.getTime())) return "no expiry";
  return `renews ${d.toISOString().slice(0, 10)}`;
}

export function AccountIdentityHero(props: Props) {
  const {
    displayName,
    handle,
    email,
    memberSince,
    timezone,
    tier,
    tierRecord,
    watchingCount,
    watchingCap,
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
          @<b>{handle}</b> · member since <b>{formatMemberSince(memberSince)}</b> ·{" "}
          {timezone}
        </div>
        {email ? (
          <p className="id-bio">
            Signed in as <b>{email}</b>. This is your private dashboard — only
            you can see it. Configure alerts, manage your watchlist, copy your
            referral link or rotate API keys below.
          </p>
        ) : (
          <p className="id-bio">
            This is your private dashboard. Configure alerts, manage your
            watchlist, copy your referral link or rotate API keys below.
          </p>
        )}
        <div className="id-tags">
          <span className="tag brand">{formatTierLabel(tier.key)}</span>
          {watchingCount > 0 ? (
            <span className="tag">
              {watchingCount}/{capLabel} WATCHING
            </span>
          ) : null}
          {tier.features.csvExport ? <span className="tag">CSV EXPORT</span> : null}
          {tier.features.emailDigest ? <span className="tag">DIGEST</span> : null}
        </div>
        <div className="id-actions" style={{ marginTop: 6 }}>
          <Link className="btn primary" href="/account?tab=alerts">
            <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
            New alert
          </Link>
          <Link className="btn" href={`/u/${handle}`}>
            <ExternalLink size={14} strokeWidth={1.8} aria-hidden="true" />
            View public profile
          </Link>
          <Link className="btn ghost" href="/account?tab=settings">
            <Settings size={14} strokeWidth={1.8} aria-hidden="true" />
            Settings
          </Link>
        </div>
      </div>
      <div className="plan-card">
        <span className="plan-meta">CURRENT PLAN</span>
        <span className="plan-name">{formatTierLabel(tier.key)}</span>
        <span className="plan-meta">
          {formatPrice(tier.priceMonthlyUsd)} · {formatRenewal(tierRecord)}
        </span>
        <div className="plan-cta">
          Watching {watchingCount} / {capLabel} ·{" "}
          {tier.features.maxAlertRules < 0
            ? "unlimited alerts"
            : `${tier.features.maxAlertRules} alert rules`}
          <br />
          <Link href="/account?tab=billing">Manage plan →</Link>
        </div>
      </div>
    </div>
  );
}
