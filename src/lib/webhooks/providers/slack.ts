// Slack Incoming-Webhook payload formatters.
//
// Emits Block Kit blocks (header + section fields + action button). No
// Slack SDK dependency — just the JSON shape Slack accepts over POST to
// hooks.slack.com/services/... URLs.
//
// Kept pure: takes in the snapshot payload, returns a JSON-serializable
// object. The drain cron calls JSON.stringify and POSTs it.

import type {
  WebhookBreakoutRepo,
  WebhookFundingEvent,
} from "../types";

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: unknown[];
}

export interface SlackPayload {
  text: string;
  blocks: SlackBlock[];
}

function compactNumber(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** Escape Slack mrkdwn (angle brackets + ampersand). Keeps links plain. */
function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatBreakoutForSlack(
  repo: WebhookBreakoutRepo,
): SlackPayload {
  const name = repo.fullName;
  const url = repo.url ?? `https://github.com/${repo.fullName}`;
  const starText = compactNumber(repo.stars);
  const delta24h = compactNumber(repo.starsDelta24h);
  const delta7d = compactNumber(repo.starsDelta7d);
  const momentum =
    typeof repo.momentumScore === "number"
      ? `${Math.round(repo.momentumScore)}/100`
      : "—";
  const language = repo.language ?? "—";
  const description = repo.description
    ? escape(repo.description).slice(0, 280)
    : "No description.";

  const text = `Breakout: ${name} — momentum ${momentum} (+${delta24h} stars / 24h)`;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Breakout: ${name}`, emoji: false },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: description },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Momentum*\n${momentum}` },
        { type: "mrkdwn", text: `*Stars*\n${starText} (+${delta24h} /24h · +${delta7d} /7d)` },
        { type: "mrkdwn", text: `*Language*\n${escape(language)}` },
        {
          type: "mrkdwn",
          text: `*Status*\n${escape(repo.movementStatus ?? "breakout")}`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View on GitHub", emoji: false },
          url,
          style: "primary",
        },
      ],
    },
  ];

  return { text, blocks };
}

export function formatFundingForSlack(
  event: WebhookFundingEvent,
): SlackPayload {
  const company = event.companyName ?? "Unknown company";
  const amount = event.amountDisplay ?? "Undisclosed";
  const round = event.roundType ?? "—";
  const headline = escape(event.headline).slice(0, 280);
  const description = event.description
    ? escape(event.description).slice(0, 400)
    : headline;

  const text = `Funding: ${company} raised ${amount} (${round})`;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Funding: ${company}`,
        emoji: false,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: description },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Amount*\n${escape(amount)}` },
        { type: "mrkdwn", text: `*Round*\n${escape(round)}` },
        {
          type: "mrkdwn",
          text: `*Announced*\n${escape(event.publishedAt)}`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Read source", emoji: false },
          url: event.sourceUrl,
        },
      ],
    },
  ];

  return { text, blocks };
}
