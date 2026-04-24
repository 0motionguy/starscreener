// Pure digest email renderer — input in, `{ subject, html, text }` out.
// No IO, no env reads, no randomness (other than the caller's
// `generatedAt` timestamp) so snapshot tests stay stable.
//
// Design:
//   - Terminal-themed palette matching the existing breakout alert template
//     (`src/lib/email/templates/breakout-alert.ts`). Deliberately reusing
//     colours + typography so the two email classes feel like the same
//     product.
//   - Inline styles everywhere. Many mail clients strip <style> blocks,
//     so everything that matters (colour, spacing, font) is inlined.
//   - Plain-text fallback has full parity with the HTML content so CLI /
//     accessibility readers get the whole digest without relying on HTML.

const SITE = "https://trendingrepo.com";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface AlertEventSummary {
  /** AlertEvent.id — used only for stable React keys / debug. */
  id: string;
  /** Canonical repo id (owner--name, lowercased). */
  repoId: string;
  /** Human-readable repo fullName, e.g. `cline/cline`. */
  repoFullName: string;
  /** The event's short title — already formatted by the trigger. */
  title: string;
  /** AlertTriggerType, e.g. "star_spike". Used for icon / label. */
  trigger: string;
  /** ISO timestamp of when the event fired. */
  firedAt: string;
}

export interface RepoBreakoutSummary {
  repoId: string;
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  stars: number;
  starsDelta7d: number;
  momentumScore: number;
  categoryId: string | null;
}

export interface DigestInput {
  userId: string;
  userEmail: string;
  recentAlerts: AlertEventSummary[];
  topBreakouts: RepoBreakoutSummary[];
  generatedAt: string;
}

export interface RenderedDigestEmail {
  subject: string;
  html: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}

function formatDelta(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return sign + formatNumber(Math.abs(n));
}

function formatTriggerLabel(trigger: string): string {
  return trigger.replace(/_/g, " ");
}

function repoUrl(fullName: string): string {
  return `${SITE}/repo/${fullName}`;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderDigestEmail(input: DigestInput): RenderedDigestEmail {
  const alertCount = input.recentAlerts.length;
  const breakoutCount = input.topBreakouts.length;

  const subject = `TrendingRepo weekly — ${alertCount} alert${alertCount === 1 ? "" : "s"}, ${breakoutCount} breakout${breakoutCount === 1 ? "" : "s"}`;

  // ---- HTML ----------------------------------------------------------------
  const alertRows = input.recentAlerts
    .map((e) => {
      const link = `${SITE}/repo/${escapeHtml(e.repoFullName)}`;
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #2d2c33;">
            <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#5eff80;">
              <a href="${link}" style="color:#5eff80;text-decoration:none;">${escapeHtml(e.repoFullName)}</a>
            </div>
            <div style="font-size:12px;color:#b3b0bb;margin-top:2px;">
              ${escapeHtml(e.title)}
            </div>
            <div style="font-size:11px;color:#8a8892;margin-top:2px;">
              ${escapeHtml(formatTriggerLabel(e.trigger))} · ${escapeHtml(e.firedAt)}
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const breakoutRows = input.topBreakouts
    .map((r, i) => {
      const link = repoUrl(r.fullName);
      const deltaColor = r.starsDelta7d >= 0 ? "#5eff80" : "#ff6b6b";
      const desc = r.description ? escapeHtml(r.description).slice(0, 160) : "";
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #2d2c33;vertical-align:top;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#5eff80;">
                <span style="color:#8a8892;">${i + 1}.</span>
                <a href="${link}" style="color:#5eff80;text-decoration:none;">${escapeHtml(r.fullName)}</a>
              </div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:${deltaColor};">
                ${escapeHtml(formatDelta(r.starsDelta7d))} 7d
              </div>
            </div>
            ${desc ? `<div style="font-size:12px;color:#b3b0bb;margin-top:4px;">${desc}</div>` : ""}
            <div style="font-size:11px;color:#8a8892;margin-top:4px;font-family:'JetBrains Mono',monospace;">
              ${escapeHtml(formatNumber(r.stars))} stars · momentum ${escapeHtml(r.momentumScore.toFixed(1))}${r.categoryId ? ` · ${escapeHtml(r.categoryId)}` : ""}
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const emptyAlerts = `
    <tr>
      <td style="padding:12px 0;font-size:13px;color:#8a8892;font-style:italic;">
        No alerts fired for your rules in the past 7 days.
      </td>
    </tr>`;

  const emptyBreakouts = `
    <tr>
      <td style="padding:12px 0;font-size:13px;color:#8a8892;font-style:italic;">
        No platform-wide breakouts detected this week.
      </td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#151419;color:#e8e6df;">
  <div style="max-width:600px;margin:0 auto;background:#1c1b20;border:1px solid #2d2c33;border-radius:12px;padding:28px;">
    <div style="font-size:11px;letter-spacing:0.1em;color:#8a8892;text-transform:uppercase;margin-bottom:8px;">
      TrendingRepo · Weekly Digest
    </div>
    <h1 style="margin:0 0 8px 0;font-size:22px;color:#5eff80;font-family:'JetBrains Mono',monospace;">
      Your watchlist this week
    </h1>
    <p style="margin:0 0 20px 0;font-size:13px;color:#b3b0bb;">
      ${alertCount} alert${alertCount === 1 ? "" : "s"} fired for your rules, and ${breakoutCount} breakout${breakoutCount === 1 ? "" : "s"} crossed the platform.
    </p>

    <h2 style="margin:24px 0 8px 0;font-size:15px;color:#e8e6df;font-family:'JetBrains Mono',monospace;">
      Your alerts (7d)
    </h2>
    <table style="width:100%;border-collapse:collapse;">
      ${alertRows || emptyAlerts}
    </table>

    <h2 style="margin:24px 0 8px 0;font-size:15px;color:#e8e6df;font-family:'JetBrains Mono',monospace;">
      Top breakouts on TrendingRepo
    </h2>
    <table style="width:100%;border-collapse:collapse;">
      ${breakoutRows || emptyBreakouts}
    </table>

    <div style="margin-top:28px;">
      <a href="${SITE}" style="display:inline-block;padding:10px 16px;background:#5eff80;color:#151419;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;">Open TrendingRepo →</a>
    </div>

    <hr style="border:none;border-top:1px solid #2d2c33;margin:28px 0 16px 0;">
    <p style="margin:0;font-size:11px;color:#8a8892;line-height:1.5;">
      Generated ${escapeHtml(input.generatedAt)} · Sent to ${escapeHtml(input.userEmail)}<br>
      Manage your alert rules at <a href="${SITE}/watchlist" style="color:#8a8892;">${SITE}/watchlist</a>.
    </p>
  </div>
</body>
</html>`;

  // ---- Plain text ---------------------------------------------------------
  const textAlerts =
    input.recentAlerts.length === 0
      ? "  (none — no alerts fired this week)"
      : input.recentAlerts
          .map(
            (e) =>
              `  • ${e.repoFullName} — ${e.title}\n` +
              `      ${formatTriggerLabel(e.trigger)} · ${e.firedAt}\n` +
              `      ${SITE}/repo/${e.repoFullName}`,
          )
          .join("\n");

  const textBreakouts =
    input.topBreakouts.length === 0
      ? "  (none — no platform breakouts this week)"
      : input.topBreakouts
          .map(
            (r, i) =>
              `  ${i + 1}. ${r.fullName}  ${formatDelta(r.starsDelta7d)} 7d\n` +
              `      ${formatNumber(r.stars)} stars · momentum ${r.momentumScore.toFixed(1)}${r.categoryId ? ` · ${r.categoryId}` : ""}\n` +
              (r.description ? `      ${r.description.slice(0, 160)}\n` : "") +
              `      ${repoUrl(r.fullName)}`,
          )
          .join("\n\n");

  const text = [
    "TrendingRepo — Weekly Digest",
    "",
    `Your watchlist this week: ${alertCount} alert${alertCount === 1 ? "" : "s"}, ${breakoutCount} breakout${breakoutCount === 1 ? "" : "s"}.`,
    "",
    "YOUR ALERTS (7d)",
    "----------------",
    textAlerts,
    "",
    "TOP BREAKOUTS",
    "-------------",
    textBreakouts,
    "",
    `Open TrendingRepo:  ${SITE}`,
    `Manage alerts:      ${SITE}/watchlist`,
    "",
    `Generated ${input.generatedAt} — sent to ${input.userEmail}`,
  ].join("\n");

  return { subject, html, text };
}
