// Agent Commerce — entity card.
//
// Server-rendered card tuned for agent-callable services: protocol badges,
// status flags, pricing, capabilities, score bar.

import Link from "next/link";

import type { AgentCommerceItem } from "@/lib/agent-commerce/types";

import {
  CapabilityChips,
  PricingBadge,
  ProtocolList,
  ScoreBar,
  StatusBadges,
} from "./AgentCommerceBadges";

const KIND_LABELS: Record<string, string> = {
  api: "API",
  marketplace: "Marketplace",
  wallet: "Wallet",
  protocol: "Protocol",
  tool: "Tool",
  infra: "Infra",
};

const CATEGORY_LABELS: Record<string, string> = {
  payments: "Payments",
  data: "Data",
  infra: "Infra",
  marketplace: "Marketplace",
  auth: "Auth",
  inference: "Inference",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic accent slot from name. We use the rotating chart-series ramp
// (tokens that already match the dashboard) instead of bespoke pastel
// gradients — keeps every card on-palette and removes random hue noise.
const LOGO_TONES = [
  "var(--color-accent)",
  "var(--color-positive)",
  "var(--color-blue)",
  "var(--color-violet)",
  "var(--color-warning)",
  "var(--color-cyan)",
  "var(--color-pink)",
] as const;

function getLogoTone(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return LOGO_TONES[hash % LOGO_TONES.length];
}

function primaryHref(item: AgentCommerceItem): string {
  return (
    item.links.website ||
    (item.links.github ? `https://github.com/${item.links.github}` : "") ||
    item.links.docs ||
    "#"
  );
}

export function AgentCommerceCard({ item }: { item: AgentCommerceItem }) {
  const detailHref = `/agent-commerce/${item.slug}`;
  const externalHref = primaryHref(item);
  const logoTone = getLogoTone(item.name);

  return (
    <article className="ac-card">
      <header className="ac-card-head">
        <div
          className="ac-logo"
          aria-hidden="true"
          style={{ color: logoTone }}
        >
          <span className="ac-logo-mark">{getInitials(item.name)}</span>
        </div>
        <div className="ac-card-title">
          <Link href={detailHref} className="ac-card-name">
            {item.name}
          </Link>
          <div className="ac-card-meta">
            <span className="ac-meta-kind">
              {KIND_LABELS[item.kind] ?? item.kind}
            </span>
            <span className="ac-meta-dot" aria-hidden>
              ·
            </span>
            <span className="ac-meta-cat">
              {CATEGORY_LABELS[item.category] ?? item.category}
            </span>
          </div>
        </div>
        <div className="ac-card-score">
          <ScoreBar score={item.scores.composite} />
        </div>
      </header>

      <p className="ac-brief">{item.brief}</p>

      <ProtocolList protocols={item.protocols} />

      <StatusBadges badges={item.badges} />

      <CapabilityChips capabilities={item.capabilities} />

      <div className="ac-card-foot">
        <PricingBadge pricing={item.pricing} />
        <div className="ac-card-actions">
          <Link href={detailHref} className="ac-link">
            Details
          </Link>
          {externalHref && externalHref !== "#" ? (
            <a
              href={externalHref}
              target="_blank"
              rel="noreferrer"
              className="ac-link ac-link-ext"
            >
              Visit <span aria-hidden>↗</span>
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
