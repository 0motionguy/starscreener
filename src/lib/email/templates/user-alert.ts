// Per-user alert email template — used by the alert dispatcher.
//
// Distinct from `breakout-alert.ts` (the operator-scope, pipeline-fed
// path) so the new feature can evolve its own copy + footer (unsubscribe
// per-rule, manage-alerts CTA, free-tier promo) without disturbing the
// existing weekly digest / global breakout flow.
//
// Pure: takes a flat data object, returns { subject, html, text }.
// No Resend SDK touch — delegate sending to dispatcher.ts.

const SITE = "https://trendingrepo.com";

export interface UserAlertEmailData {
  ruleType: "breakout" | "rank_threshold" | "release" | "mention_spike";
  ruleName: string;
  fullName: string;
  title: string;
  body: string;
  url: string;
  /** Per-rule pause/edit link (deep link into /you/alerts). */
  manageUrl?: string;
  /** Master kill-switch (turn off ALL alert emails). */
  unsubscribeAllUrl?: string;
}

export interface UserAlertEmailOutput {
  subject: string;
  html: string;
  text: string;
  referenceId: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SUBJECT_PREFIX: Record<UserAlertEmailData["ruleType"], string> = {
  breakout: "🔥",
  rank_threshold: "📈",
  release: "🚀",
  mention_spike: "💬",
};

export function renderUserAlertEmail(
  data: UserAlertEmailData,
): UserAlertEmailOutput {
  const prefix = SUBJECT_PREFIX[data.ruleType];
  const subject = `${prefix} ${data.title}`;
  const referenceId = `tr-alert-${data.ruleType}-${data.fullName.replace("/", "--")}-${Date.now()}`;
  const manageUrl = data.manageUrl ?? `${SITE}/you/alerts`;
  const unsubAllUrl =
    data.unsubscribeAllUrl ?? `${SITE}/you/alerts?action=unsubscribe-all`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0c0c12;color:#e8e6df;">
  <div style="max-width:560px;margin:0 auto;background:#15141b;border:1px solid #2d2c33;border-radius:12px;padding:24px;">
    <div style="font-size:11px;letter-spacing:0.14em;color:#8a8892;text-transform:uppercase;margin-bottom:8px;font-family:'JetBrains Mono',monospace;">
      TrendingRepo Alert · ${escapeHtml(data.ruleType.replace(/_/g, " "))}
    </div>
    <h1 style="margin:0 0 12px 0;font-size:22px;color:#ff6b35;font-family:'JetBrains Mono',monospace;">
      ${escapeHtml(data.fullName)}
    </h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#cbc9d2;line-height:1.5;">
      ${escapeHtml(data.body)}
    </p>
    <a href="${escapeHtml(data.url)}" style="display:inline-block;padding:10px 18px;background:#ff6b35;color:#0c0c12;text-decoration:none;font-weight:600;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:13px;">
      Open ${escapeHtml(data.fullName)} →
    </a>
    <hr style="margin:24px 0 16px 0;border:0;border-top:1px solid #2d2c33;">
    <p style="margin:0;font-size:11px;color:#8a8892;line-height:1.6;font-family:'JetBrains Mono',monospace;">
      Rule: <span style="color:#cbc9d2;">${escapeHtml(data.ruleName)}</span><br>
      <a href="${escapeHtml(manageUrl)}" style="color:#8a8892;text-decoration:underline;">Manage this alert</a>
      &nbsp;·&nbsp;
      <a href="${escapeHtml(unsubAllUrl)}" style="color:#8a8892;text-decoration:underline;">Unsubscribe from all alerts</a>
    </p>
  </div>
</body>
</html>`;

  const text = `${prefix} ${data.title}

${data.body}

Open: ${data.url}

Rule: ${data.ruleName}
Manage: ${manageUrl}
Unsubscribe from all alerts: ${unsubAllUrl}
`;

  return { subject, html, text, referenceId };
}
