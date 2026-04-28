// Discord Webhook payload formatters.
//
// Discord accepts embed objects on POST to discord.com/api/webhooks/<id>/<token>.
// We emit one embed per event with color + title + description + fields +
// link. Colors are chosen to match the TrendingRepo surface conventions:
//   breakout → orange
//   funding  → green
//   revenue  → cyan
//
// Embed field limits:
//   title:       256 chars
//   description: 4096 chars
//   field name:  256 chars
//   field value: 1024 chars
//   total embed: 6000 chars
// We clamp below those so even a worst-case payload stays under the cap.

import type {
  WebhookBreakoutRepo,
  WebhookFundingEvent,
} from "../types";

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields?: DiscordEmbedField[];
  timestamp?: string;
  footer?: { text: string };
}

export interface DiscordPayload {
  content?: string;
  embeds: DiscordEmbed[];
}

const COLOR_BREAKOUT = 0xff7a00; // TrendingRepo orange
const COLOR_FUNDING = 0x22c55e; // green
// const COLOR_REVENUE = 0x06b6d4; // cyan — reserved for phase-2 revenue hook

function compactNumber(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}

export function formatBreakoutForDiscord(
  repo: WebhookBreakoutRepo,
): DiscordPayload {
  const name = repo.fullName;
  const url = repo.url ?? `https://github.com/${repo.fullName}`;
  const language = repo.language ?? "—";
  const momentum =
    typeof repo.momentumScore === "number"
      ? `${Math.round(repo.momentumScore)}/100`
      : "—";

  const embed: DiscordEmbed = {
    title: truncate(`Breakout: ${name}`, 256),
    url,
    color: COLOR_BREAKOUT,
    description: truncate(
      repo.description ?? "No description.",
      2000,
    ),
    fields: [
      {
        name: "Momentum",
        value: momentum,
        inline: true,
      },
      {
        name: "Stars",
        value: `${compactNumber(repo.stars)} (+${compactNumber(repo.starsDelta24h)}/24h)`,
        inline: true,
      },
      {
        name: "Language",
        value: truncate(language, 1024),
        inline: true,
      },
      {
        name: "Status",
        value: truncate(repo.movementStatus ?? "breakout", 1024),
        inline: true,
      },
    ],
    footer: { text: "TrendingRepo" },
    timestamp: repo.lastCommitAt,
  };

  return { embeds: [embed] };
}

export function formatFundingForDiscord(
  event: WebhookFundingEvent,
): DiscordPayload {
  const company = event.companyName ?? "Unknown company";
  const amount = event.amountDisplay ?? "Undisclosed";
  const round = event.roundType ?? "—";

  const embed: DiscordEmbed = {
    title: truncate(`Funding: ${company}`, 256),
    url: event.sourceUrl,
    color: COLOR_FUNDING,
    description: truncate(
      event.description ?? event.headline,
      2000,
    ),
    fields: [
      { name: "Amount", value: truncate(amount, 1024), inline: true },
      { name: "Round", value: truncate(round, 1024), inline: true },
    ],
    footer: { text: "TrendingRepo · Funding Radar" },
    timestamp: event.publishedAt,
  };

  return { embeds: [embed] };
}
