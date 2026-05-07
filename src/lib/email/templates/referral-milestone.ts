// Referral milestone-reached email template.
//
// Pure: takes a flat data object, returns { subject, html, text }.
// No Resend SDK touch — qualify cron calls `sendEmail()` from
// `@/lib/email/send`.
//
// Per-milestone copy:
//   connector (1)  — "Your first invite landed. You're a Connector."
//   operator  (5)  — "5 invites in. You're an Operator now — early-access perks unlocked."
//   founder   (25) — "25 invites. Welcome to the Founders' Discord." (+ Discord link)
//
// Footer mirrors `user-alert.ts` style: monospace meta, dim foreground,
// HMAC-signed unsubscribe link that toggles `email_referral_updates=false`
// without requiring auth (the HMAC binds the link to one profile).

import { createHmac } from "node:crypto";

import type { ReferralMilestoneKey } from "@/lib/db/schema/referrals";

export type MilestoneKey = ReferralMilestoneKey;

const SITE = "https://trendingrepo.com";

export interface MilestoneEmailInput {
  /** Recipient handle (used in the salutation + reference id). */
  handle: string;
  /** UUID of the recipient's `profiles.id` row — bound into the unsub HMAC. */
  profileId: string;
  /** Which milestone unlocked. */
  milestone: MilestoneKey;
  /** Permanent Discord invite, only required when milestone === 'founder'. */
  founderDiscordInvite?: string;
}

export interface MilestoneEmailOutput {
  subject: string;
  html: string;
  text: string;
  referenceId: string;
}

interface MilestoneCopy {
  badge: string;
  subject: string;
  headline: string;
  body: string;
  cta: { label: string; href: string };
  footerNote: string;
}

const COPY: Record<MilestoneKey, MilestoneCopy> = {
  connector: {
    badge: "CONNECTOR",
    subject: "Your first invite landed. You're a Connector.",
    headline: "You're a Connector",
    body:
      "Someone you invited stuck around long enough to count. That's a Connector badge — public on your profile, and the start of a streak.",
    cta: { label: "View your profile", href: `${SITE}/you` },
    footerNote: "Earned by inviting 1 friend who returned in 24h.",
  },
  operator: {
    badge: "OPERATOR",
    subject: "5 invites in. You're an Operator now.",
    headline: "Operator unlocked",
    body:
      "Five qualified invites. You've earned the Operator badge and early-access perks: the new-feature preview lane and priority on builder tooling slots.",
    cta: { label: "See what's unlocked", href: `${SITE}/you` },
    footerNote: "Earned by inviting 5 friends who returned in 24h.",
  },
  founder: {
    badge: "FOUNDER",
    subject: "25 invites. Welcome to the Founders' Discord.",
    headline: "Welcome to the Founders' Discord",
    body:
      "Twenty-five qualified invites. You're now a Founder — direct line to the team, build-call invites, and a permanent seat at the table for the roadmap.",
    cta: { label: "Join the Founders' Discord", href: SITE },
    footerNote: "Earned by inviting 25 friends who returned in 24h.",
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Build a SESSION_SECRET-HMAC unsubscribe URL. Format:
 *
 *   {SITE}/api/email/unsubscribe?scope=referral_updates&p={profileId}&t={hmacB64}
 *
 * The handler decoding the link verifies the HMAC, looks up the profile,
 * and clears `email_referral_updates`. Done as an inline helper rather
 * than a separate module because it's the only milestone email surface
 * that needs it; if a second template needs the same shape we'll lift
 * it into `@/lib/email/unsub.ts`.
 *
 * Falls back to the bare manage URL when SESSION_SECRET is unset, so
 * this template is still safe to render in dev without env wiring.
 */
function unsubscribeUrl(profileId: string): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) return `${SITE}/you?action=unsubscribe-referral-updates`;
  const sig = createHmac("sha256", secret)
    .update(`referral_updates:${profileId}`)
    .digest();
  return `${SITE}/api/email/unsubscribe?scope=referral_updates&p=${encodeURIComponent(profileId)}&t=${base64url(sig)}`;
}

/**
 * Render a milestone-unlock email. Per-milestone copy is selected from
 * the COPY table; for the Founder milestone we substitute the Discord
 * CTA with the configured invite link when one is provided.
 */
export function renderMilestoneEmail(
  input: MilestoneEmailInput,
): MilestoneEmailOutput {
  const copy = COPY[input.milestone];
  const cta =
    input.milestone === "founder" && input.founderDiscordInvite
      ? { label: "Join the Founders' Discord", href: input.founderDiscordInvite }
      : copy.cta;

  const subject = copy.subject;
  const referenceId = `tr-milestone-${input.milestone}-${input.handle}-${Date.now()}`;
  const unsubUrl = unsubscribeUrl(input.profileId);
  const manageUrl = `${SITE}/you`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0c0c12;color:#e8e6df;">
  <div style="max-width:560px;margin:0 auto;background:#15141b;border:1px solid #2d2c33;border-radius:12px;padding:24px;">
    <div style="font-size:11px;letter-spacing:0.14em;color:#8a8892;text-transform:uppercase;margin-bottom:8px;font-family:'JetBrains Mono',monospace;">
      TrendingRepo · Milestone unlocked · ${escapeHtml(copy.badge)}
    </div>
    <h1 style="margin:0 0 12px 0;font-size:22px;color:#ff6b35;font-family:'JetBrains Mono',monospace;">
      ${escapeHtml(copy.headline)}
    </h1>
    <p style="margin:0 0 8px 0;font-size:14px;color:#cbc9d2;line-height:1.5;">
      Hey @${escapeHtml(input.handle)},
    </p>
    <p style="margin:0 0 20px 0;font-size:14px;color:#cbc9d2;line-height:1.5;">
      ${escapeHtml(copy.body)}
    </p>
    <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:10px 18px;background:#ff6b35;color:#0c0c12;text-decoration:none;font-weight:600;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:13px;">
      ${escapeHtml(cta.label)} →
    </a>
    <hr style="margin:24px 0 16px 0;border:0;border-top:1px solid #2d2c33;">
    <p style="margin:0;font-size:11px;color:#8a8892;line-height:1.6;font-family:'JetBrains Mono',monospace;">
      ${escapeHtml(copy.footerNote)}<br>
      <a href="${escapeHtml(manageUrl)}" style="color:#8a8892;text-decoration:underline;">Manage referral preferences</a>
      &nbsp;·&nbsp;
      <a href="${escapeHtml(unsubUrl)}" style="color:#8a8892;text-decoration:underline;">Unsubscribe from referral updates</a>
    </p>
  </div>
</body>
</html>`;

  const text = `${copy.headline}

Hey @${input.handle},

${copy.body}

${cta.label}: ${cta.href}

---
${copy.footerNote}
Manage referral preferences: ${manageUrl}
Unsubscribe from referral updates: ${unsubUrl}
`;

  return { subject, html, text, referenceId };
}
