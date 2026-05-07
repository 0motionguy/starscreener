// Newsletter double-opt-in confirmation email.
//
// Pure: takes flat data, returns { subject, html, text }. No Resend SDK
// touch — delegate to `sendEmail()` from `src/lib/email/send.ts`.
//
// Triggered by `POST /api/newsletter/subscribe`. The subscriber's row sits
// in `newsletter_subscribers` with `confirmed_at = NULL` until they click
// the link in this email; the link verifies an HMAC-signed 24h-TTL token
// and flips `confirmed_at = now()`.
//
// Design intent: minimal copy, single CTA, plain-text fallback link, and a
// reassurance footer for the "I didn't sign up for this" case. Aligned
// stylistically with `user-alert.ts` (dark JetBrains Mono terminal) so
// every TrendingRepo email feels of-a-piece.

const SITE = "https://trendingrepo.com";

export interface NewsletterConfirmInput {
  /** Recipient address. Used for personalisation + plain-text fallback. */
  email: string;
  /** Fully-qualified URL with the HMAC token in the query string. */
  confirmUrl: string;
}

export interface NewsletterConfirmOutput {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderNewsletterConfirmEmail(
  data: NewsletterConfirmInput,
): NewsletterConfirmOutput {
  const subject = "Confirm your subscription to TrendingRepo";
  const safeUrl = escapeHtml(data.confirmUrl);
  const safeEmail = escapeHtml(data.email);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0c0c12;color:#e8e6df;">
  <div style="max-width:560px;margin:0 auto;background:#15141b;border:1px solid #2d2c33;border-radius:12px;padding:24px;">
    <div style="font-size:11px;letter-spacing:0.14em;color:#8a8892;text-transform:uppercase;margin-bottom:8px;font-family:'JetBrains Mono',monospace;">
      TrendingRepo · Newsletter
    </div>
    <h1 style="margin:0 0 12px 0;font-size:22px;color:#ff6b35;font-family:'JetBrains Mono',monospace;">
      Confirm your subscription
    </h1>
    <p style="margin:0 0 16px 0;font-size:14px;color:#cbc9d2;line-height:1.5;">
      Tap the button below to confirm <b>${safeEmail}</b> and start receiving the
      weekly digest of the top breakout open-source repos — cross-source signals,
      momentum scores, and what's actually moving on GitHub.
    </p>
    <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;background:#ff6b35;color:#0c0c12;text-decoration:none;font-weight:600;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:0.04em;">
      Confirm subscription →
    </a>
    <p style="margin:16px 0 0 0;font-size:12px;color:#8a8892;line-height:1.5;font-family:'JetBrains Mono',monospace;">
      Or paste this link into your browser:<br>
      <a href="${safeUrl}" style="color:#cbc9d2;word-break:break-all;">${safeUrl}</a>
    </p>
    <hr style="margin:24px 0 16px 0;border:0;border-top:1px solid #2d2c33;">
    <p style="margin:0;font-size:11px;color:#8a8892;line-height:1.6;font-family:'JetBrains Mono',monospace;">
      This link expires in 24 hours. If you didn't sign up, you can ignore this
      email — no further messages will be sent.
    </p>
  </div>
</body>
</html>`;

  const text = `Confirm your subscription to TrendingRepo

Tap the link below to confirm ${data.email} and start receiving the weekly digest of the top breakout open-source repos — cross-source signals, momentum scores, and what's actually moving on GitHub.

${data.confirmUrl}

This link expires in 24 hours.

If you didn't sign up, you can ignore this email — no further messages will be sent.

— ${SITE}
`;

  return { subject, html, text };
}
