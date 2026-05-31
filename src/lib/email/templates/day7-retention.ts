// Day-7 retention email template (S5.B.4).
//
// Sent by the daily onboarding cron to profiles whose createdAt is in the
// [now-7.5d, now-6.5d] window. Body is a generic "what's hot this week"
// digest — no per-user rule events (those come from the weekly digest
// cron for users who opt in). CTA invites them back to /breakouts.

import "server-only";

import { createHmac } from "node:crypto";

const SITE = "https://trendingrepo.com";

export interface Day7RetentionEmailInput {
  handle: string;
  profileId: string;
  firstName?: string | null;
  /**
   * Up to 3 top-breakout names (e.g. ["vercel/next.js", "..."]) to inline
   * in the body. Pass empty array if the cron's derived-repos snapshot
   * isn't ready — the template degrades gracefully.
   */
  topBreakoutNames: ReadonlyArray<string>;
}

export interface Day7RetentionEmailOutput {
  subject: string;
  html: string;
  text: string;
  referenceId: string;
}

function unsubscribeUrl(profileId: string): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET ?? "";
  if (!secret) return `${SITE}/you/settings`;
  const sig = createHmac("sha256", secret)
    .update(`unsub:system:${profileId}`)
    .digest("hex")
    .slice(0, 32);
  return `${SITE}/api/email/unsubscribe?p=${encodeURIComponent(profileId)}&kind=system&sig=${sig}`;
}

export function renderDay7RetentionEmail(
  input: Day7RetentionEmailInput,
): Day7RetentionEmailOutput {
  const greeting = input.firstName?.trim() || "there";
  const unsubHref = unsubscribeUrl(input.profileId);
  const breakoutsHref = `${SITE}/breakouts`;
  const top3 = input.topBreakoutNames.slice(0, 3);

  const subject = "Your first week on TrendingRepo — here's what surged.";

  const text = [
    `Hey ${greeting},`,
    "",
    "It's been a week since you signed up. Here's what trended on",
    "TrendingRepo while you were figuring out the rest of your stack:",
    "",
    ...(top3.length > 0
      ? top3.map((name) => `  · ${name}`)
      : ["  (nothing notable broke out this week — check back next week.)"]),
    "",
    `Full breakout list: ${breakoutsHref}`,
    "",
    "Want this kind of recap on a regular cadence? Flip on the weekly",
    `digest at ${SITE}/you/alerts and you'll get one email per week with`,
    "your watched repos + platform breakouts.",
    "",
    "— TrendingRepo team",
    "",
    "---",
    "TrendingRepo · trendingrepo.com",
    `Unsubscribe: ${unsubHref}`,
  ].join("\n");

  const top3Html =
    top3.length > 0
      ? `<ul style="font-size:14px;line-height:1.55;color:#cccce0;margin:8px 0 0;padding-left:18px;">${top3
          .map(
            (name) =>
              `<li style="margin-bottom:4px;"><a href="${SITE}/repo/${escapeHtml(name)}" style="color:#fafafa;text-decoration:none;font-family:'JetBrains Mono',ui-monospace,monospace;">${escapeHtml(name)}</a></li>`,
          )
          .join("")}</ul>`
      : `<p style="font-size:13px;line-height:1.55;color:#9595a3;margin:8px 0 0;font-style:italic;">Nothing notable broke out this week — check back next week.</p>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#0b0b0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e8e8ea;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#0b0b0d;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#161618;border:1px solid #2a2a2e;border-radius:6px;">
<tr><td style="padding:28px 32px 8px;"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8b8b91;">// 00 WEEK-1 RECAP</span></td></tr>
<tr><td style="padding:0 32px 8px;"><h1 style="font-size:26px;font-weight:600;letter-spacing:-0.02em;line-height:1.15;margin:0;color:#fafafa;">Your first week — here's what surged.</h1></td></tr>
<tr><td style="padding:16px 32px 8px;">
<p style="font-size:15px;line-height:1.55;color:#cccce0;margin:0;">Hey ${escapeHtml(greeting)},</p>
<p style="font-size:15px;line-height:1.55;color:#cccce0;margin:12px 0 0;">It's been a week since you signed up. Here's what trended on TrendingRepo while you were figuring out the rest of your stack:</p>
${top3Html}
</td></tr>
<tr><td align="center" style="padding:20px 32px 8px;">
<a href="${breakoutsHref}" style="display:inline-block;background:#fafafa;color:#0b0b0d;padding:12px 22px;border-radius:4px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600;text-decoration:none;">SEE ALL BREAKOUTS →</a>
</td></tr>
<tr><td style="padding:16px 32px 24px;">
<p style="font-size:13px;line-height:1.55;color:#9595a3;margin:0;">Want this on a regular cadence? Flip on the weekly digest at <a href="${SITE}/you/alerts" style="color:#cccce0;">/you/alerts</a>.</p>
<p style="font-size:13px;line-height:1.55;color:#9595a3;margin:8px 0 0;">— TrendingRepo team</p>
</td></tr>
<tr><td style="padding:14px 32px;border-top:1px solid #2a2a2e;">
<p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:#6b6b73;margin:0;">TrendingRepo · <a href="${SITE}" style="color:#9595a3;text-decoration:none;">trendingrepo.com</a> · <a href="${unsubHref}" style="color:#6b6b73;text-decoration:underline;">Unsubscribe</a></p>
</td></tr></table></td></tr></table></body></html>`;

  return {
    subject,
    html,
    text,
    referenceId: `day7-retention:${input.profileId}`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
