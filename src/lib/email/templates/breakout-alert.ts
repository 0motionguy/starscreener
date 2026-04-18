// StarScreener — Breakout alert email template (P0.1)
//
// Pure function: AlertEvent + Repo → { subject, html, text }.
// No Resend SDK touch — delegate sending to resend-client.ts.
//
// Kept as hand-written HTML strings (not React Email) for v1 to avoid
// pulling @react-email/components into the runtime. The template is
// narrow enough that plain template strings are legible and fast.
// Upgrade to React Email templates in a follow-up PR once we have
// more variants (daily-digest, watchlist-spike).

import type { AlertEvent } from "../../pipeline/types";
import type { Repo } from "../../types";

const SITE = "https://starscreener-production.up.railway.app";

function formatNumber(n: number | undefined | null): string {
  if (n == null) return "—";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function formatDelta(n: number | undefined | null): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + formatNumber(n);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  referenceId: string;
}

export function renderBreakoutAlert(
  event: AlertEvent,
  repo: Repo,
): RenderedEmail {
  const repoLink = `https://github.com/${repo.fullName}`;
  const detailLink = `${SITE}/repo/${repo.owner}/${repo.name}`;
  const subject = `🚀 ${repo.fullName} — ${event.trigger.replace(/_/g, " ")}`;
  const referenceId = `sse-${event.ruleId}-${event.repoId}-${event.firedAt}`;

  const delta24 = formatDelta(repo.starsDelta24h);
  const delta7 = formatDelta(repo.starsDelta7d);
  const stars = formatNumber(repo.stars);
  const category = repo.categoryId || "(unclassified)";
  const momentum = repo.momentumScore?.toFixed(1) ?? "—";
  const desc = repo.description
    ? escapeHtml(repo.description).slice(0, 240)
    : "(no description)";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#151419;color:#e8e6df;">
  <div style="max-width:560px;margin:0 auto;background:#1c1b20;border:1px solid #2d2c33;border-radius:12px;padding:24px;">
    <div style="font-size:12px;letter-spacing:0.08em;color:#8a8892;text-transform:uppercase;margin-bottom:8px;">
      StarScreener Alert · ${escapeHtml(event.trigger)}
    </div>
    <h1 style="margin:0 0 8px 0;font-size:24px;color:#5eff80;font-family:'JetBrains Mono',monospace;">
      ${escapeHtml(repo.fullName)}
    </h1>
    <p style="margin:0 0 16px 0;font-size:14px;color:#b3b0bb;">${desc}</p>
    <table style="width:100%;margin:16px 0;border-collapse:collapse;font-family:'JetBrains Mono',monospace;font-size:13px;">
      <tr>
        <td style="padding:6px 0;color:#8a8892;">Stars</td>
        <td style="padding:6px 0;text-align:right;color:#e8e6df;">${stars}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#8a8892;">Δ 24h</td>
        <td style="padding:6px 0;text-align:right;color:${(repo.starsDelta24h ?? 0) >= 0 ? "#5eff80" : "#ff6b6b"};">${delta24}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#8a8892;">Δ 7d</td>
        <td style="padding:6px 0;text-align:right;color:${(repo.starsDelta7d ?? 0) >= 0 ? "#5eff80" : "#ff6b6b"};">${delta7}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#8a8892;">Momentum</td>
        <td style="padding:6px 0;text-align:right;color:#e8e6df;">${momentum}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#8a8892;">Category</td>
        <td style="padding:6px 0;text-align:right;color:#e8e6df;">${escapeHtml(category)}</td>
      </tr>
    </table>
    <div style="margin-top:20px;">
      <a href="${detailLink}" style="display:inline-block;padding:10px 16px;background:#5eff80;color:#151419;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Open in StarScreener →</a>
      <a href="${repoLink}" style="display:inline-block;padding:10px 16px;margin-left:8px;background:transparent;color:#e8e6df;border:1px solid #2d2c33;text-decoration:none;border-radius:8px;font-size:14px;">View on GitHub</a>
    </div>
    <hr style="border:none;border-top:1px solid #2d2c33;margin:24px 0;">
    <p style="margin:0;font-size:11px;color:#8a8892;">
      Fired at ${event.firedAt} · Rule <code>${escapeHtml(event.ruleId)}</code> · This is a breakout-class alert. Watchlist and digest alerts arrive separately.
    </p>
  </div>
</body>
</html>`;

  const text = [
    `StarScreener Alert — ${event.trigger.replace(/_/g, " ")}`,
    ``,
    `${repo.fullName}`,
    repo.description ? repo.description.slice(0, 240) : "",
    ``,
    `Stars:     ${stars}`,
    `Δ 24h:     ${delta24}`,
    `Δ 7d:      ${delta7}`,
    `Momentum:  ${momentum}`,
    `Category:  ${category}`,
    ``,
    `Open: ${detailLink}`,
    `GitHub: ${repoLink}`,
    ``,
    `Fired at ${event.firedAt} · Rule ${event.ruleId}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text, referenceId };
}
