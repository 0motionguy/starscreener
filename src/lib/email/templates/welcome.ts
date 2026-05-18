// Day-1 welcome email template (S5.B.2).
//
// Pure: takes a flat data object, returns { subject, html, text }.
// No Resend SDK touch — the Clerk webhook handler calls `sendEmail()`
// from `@/lib/email/send` with this output.
//
// Goal: turn a fresh Clerk signup into an activated user. The CTA links
// straight to /you/alerts?preset=breakout so the first click lands on a
// pre-populated alert form (one save → first alert wired).
//
// Footer mirrors the existing transactional emails (referral-milestone,
// user-alert): monospace meta, dim foreground, HMAC-signed unsubscribe
// link that toggles `email_system=false` without requiring auth (the
// HMAC binds the link to one profile).

import { buildEmailUnsubscribeUrl } from "@/lib/email/unsubscribe";

const SITE = "https://trendingrepo.com";

export interface WelcomeEmailInput {
  /** Recipient handle (used in the salutation + reference id). */
  handle: string;
  /** UUID of the recipient's `profiles.id` row — bound into the unsub HMAC. */
  profileId: string;
  /** Optional first name for personalised salutation; falls back to "there". */
  firstName?: string | null;
}

export interface WelcomeEmailOutput {
  subject: string;
  html: string;
  text: string;
  referenceId: string;
}

export function renderWelcomeEmail(
  input: WelcomeEmailInput,
): WelcomeEmailOutput {
  const greeting = input.firstName?.trim() || "there";
  const unsubHref = buildEmailUnsubscribeUrl("system", input.profileId);
  const ctaHref = `${SITE}/you/alerts?preset=breakout`;

  const subject = "You're in. Catch breakouts before they're cold.";

  const text = [
    `Hey ${greeting},`,
    "",
    "Welcome to TrendingRepo. You're set up — alerts, watchlist, the works.",
    "",
    "The fastest way to get value: spin up your first alert. We've pre-",
    "filled a Breakout rule that fires when a repo hits multiple cross-",
    "source channels in 24 hours. Two clicks and you're done:",
    "",
    `  ${ctaHref}`,
    "",
    "What else lives behind your account:",
    "",
    "  - Watchlist — pin repos to track their momentum across sources",
    "  - Compare — stack up to 5 repos side-by-side",
    "  - Digest  — daily or weekly recap email (you can flip this on at",
    "             /you/alerts → Global preferences)",
    "  - Refer   — invite a friend, earn badges (operator at 5, founder at 25)",
    "",
    "Questions? Reply to this email and a human will read it.",
    "",
    "— TrendingRepo team",
    "",
    "---",
    "TrendingRepo · trendingrepo.com",
    `Unsubscribe from system emails: ${unsubHref}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#0b0b0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e8e8ea;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#0b0b0d;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#161618;border:1px solid #2a2a2e;border-radius:6px;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8b8b91;">// 00 WELCOME</span>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <h1 style="font-size:28px;font-weight:600;letter-spacing:-0.02em;line-height:1.15;margin:0;color:#fafafa;">
                  You're in. Catch breakouts before they're cold.
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px;">
                <p style="font-size:15px;line-height:1.55;color:#cccce0;margin:0;">
                  Hey ${escapeHtml(greeting)},
                </p>
                <p style="font-size:15px;line-height:1.55;color:#cccce0;margin:12px 0 0;">
                  Welcome to TrendingRepo. You're set up — alerts, watchlist, the works.
                </p>
                <p style="font-size:15px;line-height:1.55;color:#cccce0;margin:12px 0 0;">
                  The fastest way to get value: spin up your first alert. We've pre-filled a <b>Breakout</b> rule that fires when a repo hits multiple cross-source channels in 24 hours. Two clicks and you're done.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 8px;">
                <a href="${ctaHref}" style="display:inline-block;background:#fafafa;color:#0b0b0d;padding:12px 22px;border-radius:4px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600;text-decoration:none;">CREATE YOUR FIRST ALERT →</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px;">
                <p style="font-size:13px;line-height:1.55;color:#9595a3;margin:0;">What else lives behind your account:</p>
                <ul style="font-size:13px;line-height:1.55;color:#cccce0;margin:8px 0 0;padding-left:18px;">
                  <li><b>Watchlist</b> — pin repos to track their momentum across sources</li>
                  <li><b>Compare</b> — stack up to 5 repos side-by-side</li>
                  <li><b>Digest</b> — daily or weekly recap email (flip on at /you/alerts)</li>
                  <li><b>Refer</b> — invite a friend, earn badges (operator at 5, founder at 25)</li>
                </ul>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px;">
                <p style="font-size:13px;line-height:1.55;color:#9595a3;margin:0;">
                  Questions? Reply to this email — a human will read it.
                </p>
                <p style="font-size:13px;line-height:1.55;color:#9595a3;margin:8px 0 0;">
                  — TrendingRepo team
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 32px;border-top:1px solid #2a2a2e;">
                <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:#6b6b73;margin:0;">
                  TrendingRepo · <a href="${SITE}" style="color:#9595a3;text-decoration:none;">trendingrepo.com</a> ·
                  <a href="${unsubHref}" style="color:#6b6b73;text-decoration:underline;">Unsubscribe</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject,
    html,
    text,
    referenceId: `welcome:${input.profileId}`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
