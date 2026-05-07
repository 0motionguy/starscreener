// Newsletter weekly digest email template — anonymous subscribers.
//
// Pure: takes flat data, returns { subject, html, text }. No Resend SDK
// touch. Sent by the weekly digest cron after fanout to confirmed-AND-not-
// unsubscribed rows in `newsletter_subscribers`.
//
// Distinct from `render-digest.ts` (the operator-scope, per-user-rules
// digest) — this one is PUBLIC ONLY: top breakouts platform-wide, no
// per-user rule events, footer CTA pushes the reader to create a real
// account for personalised alerts. Same dark JetBrains Mono terminal
// styling as the other transactional emails so the brand reads consistent.
//
// Footer always includes:
//   - "Sign up for personalized alerts" → /sign-up
//   - One-click unsubscribe link with HMAC token (no auth required)
// These are non-negotiable per CLAUDE.md (deliverability + legal).

const SITE = "https://trendingrepo.com";

export interface NewsletterDigestRepo {
  fullName: string;
  /** Optional one-line description; empty string is acceptable. */
  description?: string | null;
  score: number;
  /** Direct URL to the repo (typically `/repo/<owner>/<name>` on TrendingRepo). */
  url: string;
}

export interface NewsletterDigestInput {
  /** Recipient address — included in the footer for transparency. */
  email: string;
  /** Top breakouts to feature; 5–10 typical. Empty list still renders the email. */
  topBreakouts: NewsletterDigestRepo[];
  /** Pre-built unsubscribe URL with HMAC token. */
  unsubscribeUrl: string;
}

export interface NewsletterDigestOutput {
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

function formatScore(score: number): string {
  if (!Number.isFinite(score)) return "—";
  return score.toFixed(1);
}

export function renderNewsletterDigestEmail(
  data: NewsletterDigestInput,
): NewsletterDigestOutput {
  const subject = "TrendingRepo: this week's top breakouts";
  const safeUnsub = escapeHtml(data.unsubscribeUrl);
  const safeEmail = escapeHtml(data.email);
  const signUpUrl = `${SITE}/sign-up`;

  const breakoutsHtml = data.topBreakouts.length
    ? data.topBreakouts
        .map((repo, i) => {
          const rank = String(i + 1).padStart(2, "0");
          const safeName = escapeHtml(repo.fullName);
          const safeUrl = escapeHtml(repo.url);
          const safeDesc = repo.description
            ? escapeHtml(repo.description.slice(0, 160))
            : "";
          return `
    <tr>
      <td style="padding:12px 0;border-top:1px solid #2d2c33;vertical-align:top;">
        <span style="font-family:'JetBrains Mono',monospace;color:#8a8892;font-size:11px;letter-spacing:0.08em;">#${rank}</span>
      </td>
      <td style="padding:12px 0;border-top:1px solid #2d2c33;vertical-align:top;">
        <a href="${safeUrl}" style="font-family:'JetBrains Mono',monospace;color:#ff6b35;text-decoration:none;font-size:14px;font-weight:600;">${safeName}</a>
        ${safeDesc ? `<div style="margin-top:4px;font-size:12px;color:#cbc9d2;line-height:1.4;">${safeDesc}</div>` : ""}
      </td>
      <td style="padding:12px 0;border-top:1px solid #2d2c33;vertical-align:top;text-align:right;font-family:'JetBrains Mono',monospace;color:#5eff80;font-size:13px;">
        ${escapeHtml(formatScore(repo.score))}
      </td>
    </tr>`;
        })
        .join("")
    : `
    <tr>
      <td colspan="3" style="padding:16px 0;text-align:center;color:#8a8892;font-family:'JetBrains Mono',monospace;font-size:12px;">
        No breakouts this week — calm waters.
      </td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0c0c12;color:#e8e6df;">
  <div style="max-width:600px;margin:0 auto;background:#15141b;border:1px solid #2d2c33;border-radius:12px;padding:24px;">
    <div style="font-size:11px;letter-spacing:0.14em;color:#8a8892;text-transform:uppercase;margin-bottom:8px;font-family:'JetBrains Mono',monospace;">
      TrendingRepo · Weekly digest
    </div>
    <h1 style="margin:0 0 12px 0;font-size:22px;color:#ff6b35;font-family:'JetBrains Mono',monospace;">
      This week's top breakouts
    </h1>
    <p style="margin:0 0 16px 0;font-size:14px;color:#cbc9d2;line-height:1.5;">
      What's actually moving on GitHub — ranked by cross-source agreement,
      star velocity, and fresh community attention.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0 0 0;">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 0;font-family:'JetBrains Mono',monospace;font-size:10px;color:#8a8892;letter-spacing:0.1em;text-transform:uppercase;font-weight:500;">#</th>
          <th style="text-align:left;padding:6px 0;font-family:'JetBrains Mono',monospace;font-size:10px;color:#8a8892;letter-spacing:0.1em;text-transform:uppercase;font-weight:500;">Repo</th>
          <th style="text-align:right;padding:6px 0;font-family:'JetBrains Mono',monospace;font-size:10px;color:#8a8892;letter-spacing:0.1em;text-transform:uppercase;font-weight:500;">Score</th>
        </tr>
      </thead>
      <tbody>${breakoutsHtml}
      </tbody>
    </table>
    <div style="margin-top:24px;padding:16px;background:#1c1b22;border:1px solid #2d2c33;border-radius:8px;">
      <p style="margin:0 0 12px 0;font-size:13px;color:#cbc9d2;line-height:1.5;font-family:'JetBrains Mono',monospace;">
        Want personalized alerts when YOUR watched repos break out?
      </p>
      <a href="${escapeHtml(signUpUrl)}" style="display:inline-block;padding:10px 18px;background:#ff6b35;color:#0c0c12;text-decoration:none;font-weight:600;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:13px;">
        Sign up for personalized alerts →
      </a>
    </div>
    <hr style="margin:24px 0 16px 0;border:0;border-top:1px solid #2d2c33;">
    <p style="margin:0;font-size:11px;color:#8a8892;line-height:1.6;font-family:'JetBrains Mono',monospace;">
      Sent to ${safeEmail} · <a href="${safeUnsub}" style="color:#8a8892;text-decoration:underline;">Unsubscribe</a>
      &nbsp;·&nbsp;
      <a href="${SITE}" style="color:#8a8892;text-decoration:underline;">${SITE.replace(/^https?:\/\//, "")}</a>
    </p>
  </div>
</body>
</html>`;

  const lines: string[] = [
    "TrendingRepo · Weekly digest",
    "",
    "This week's top breakouts",
    "What's actually moving on GitHub — ranked by cross-source agreement, star velocity, and fresh community attention.",
    "",
  ];
  if (data.topBreakouts.length === 0) {
    lines.push("No breakouts this week — calm waters.");
  } else {
    for (let i = 0; i < data.topBreakouts.length; i++) {
      const r = data.topBreakouts[i];
      const rank = String(i + 1).padStart(2, "0");
      lines.push(`#${rank}  ${r.fullName}  (${formatScore(r.score)})`);
      if (r.description) lines.push(`    ${r.description.slice(0, 160)}`);
      lines.push(`    ${r.url}`);
      lines.push("");
    }
  }
  lines.push("");
  lines.push("Want personalized alerts? Sign up: " + signUpUrl);
  lines.push("");
  lines.push(`Sent to ${data.email}`);
  lines.push(`Unsubscribe: ${data.unsubscribeUrl}`);
  lines.push(SITE);

  return { subject, html, text: lines.join("\n") };
}
