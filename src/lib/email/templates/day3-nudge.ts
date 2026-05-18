// Day-3 nudge email template (S5.B.3).
//
// Sent by the daily onboarding cron to profiles whose createdAt is in the
// [now-3.5d, now-2.5d] window AND who haven't created an alert rule yet.
// CTA links to /you/alerts?preset=breakout (same target as the welcome email)
// so the activation path is consistent.

import { createHmac } from "node:crypto";

const SITE = "https://trendingrepo.com";

export interface Day3NudgeEmailInput {
  handle: string;
  profileId: string;
  firstName?: string | null;
}

export interface Day3NudgeEmailOutput {
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

export function renderDay3NudgeEmail(
  input: Day3NudgeEmailInput,
): Day3NudgeEmailOutput {
  const greeting = input.firstName?.trim() || "there";
  const unsubHref = unsubscribeUrl(input.profileId);
  const breakoutHref = `${SITE}/you/alerts?preset=breakout`;
  const dailyDigestHref = `${SITE}/you/alerts?preset=daily-digest`;

  const subject = "Still interested? Your first alert is 30 seconds away.";

  const text = [
    `Hey ${greeting},`,
    "",
    "You signed up a few days ago but haven't wired any alerts yet. That's",
    "fine — most TrendingRepo value lands the moment your first rule fires.",
    "",
    "Three presets that take one click each:",
    "",
    `  Breakout       → ${breakoutHref}`,
    "  Repos hitting multi-channel momentum in 24h.",
    "",
    `  Daily digest   → ${dailyDigestHref}`,
    "  Top-100 platform breakouts, one email per day.",
    "",
    `  Release / mention spike → ${SITE}/you/alerts`,
    "  Target a specific repo (e.g. anthropics/anthropic-sdk-python).",
    "",
    "If TrendingRepo isn't your thing, no hard feelings — reply with",
    "what you were hoping for and we'll either build it or point you at",
    "a better tool.",
    "",
    "— TrendingRepo team",
    "",
    "---",
    "TrendingRepo · trendingrepo.com",
    `Unsubscribe: ${unsubHref}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#0b0b0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e8e8ea;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#0b0b0d;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#161618;border:1px solid #2a2a2e;border-radius:6px;">
<tr><td style="padding:28px 32px 8px;"><span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8b8b91;">// 00 STILL HERE?</span></td></tr>
<tr><td style="padding:0 32px 8px;"><h1 style="font-size:28px;font-weight:600;letter-spacing:-0.02em;line-height:1.15;margin:0;color:#fafafa;">Your first alert is 30 seconds away.</h1></td></tr>
<tr><td style="padding:16px 32px 8px;">
<p style="font-size:15px;line-height:1.55;color:#cccce0;margin:0;">Hey ${escapeHtml(greeting)},</p>
<p style="font-size:15px;line-height:1.55;color:#cccce0;margin:12px 0 0;">You signed up a few days ago but haven't wired any alerts yet. That's fine — most TrendingRepo value lands the moment your first rule fires.</p>
<p style="font-size:15px;line-height:1.55;color:#cccce0;margin:12px 0 0;">Three presets that take one click each:</p>
</td></tr>
<tr><td align="center" style="padding:16px 32px 4px;">
<a href="${breakoutHref}" style="display:inline-block;background:#fafafa;color:#0b0b0d;padding:12px 22px;border-radius:4px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600;text-decoration:none;">BREAKOUT PRESET →</a>
</td></tr>
<tr><td style="padding:8px 32px 8px;font-size:13px;color:#9595a3;text-align:center;">or</td></tr>
<tr><td align="center" style="padding:0 32px 16px;">
<a href="${dailyDigestHref}" style="display:inline-block;background:transparent;color:#e8e8ea;padding:12px 22px;border-radius:4px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600;text-decoration:none;border:1px solid #2a2a2e;">DAILY DIGEST PRESET</a>
</td></tr>
<tr><td style="padding:16px 32px 24px;">
<p style="font-size:13px;line-height:1.55;color:#9595a3;margin:0;">Not your thing? Reply with what you were hoping for — we'll either build it or point you at a better tool.</p>
<p style="font-size:13px;line-height:1.55;color:#9595a3;margin:8px 0 0;">— TrendingRepo team</p>
</td></tr>
<tr><td style="padding:14px 32px;border-top:1px solid #2a2a2e;">
<p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:#6b6b73;margin:0;">TrendingRepo · <a href="${SITE}" style="color:#9595a3;text-decoration:none;">trendingrepo.com</a> · <a href="${unsubHref}" style="color:#6b6b73;text-decoration:underline;">Unsubscribe</a></p>
</td></tr></table></td></tr></table></body></html>`;

  return {
    subject,
    html,
    text,
    referenceId: `day3-nudge:${input.profileId}`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
