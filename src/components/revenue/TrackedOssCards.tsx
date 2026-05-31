// TrackedOssCards — top 8 OSS-matched verified-revenue cards.
// Each row pairs a tracked Repo with its RevenueOverlay (mrr, growth, provider).
// Cards link to /repo/<owner>/<name>.

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import type { Repo, RevenueOverlay } from "@/lib/types";

interface TrackedOssCardItem {
  repo: Pick<Repo, "fullName" | "name" | "owner">;
  overlay: RevenueOverlay;
  displayName?: string;
}

interface TrackedOssCardsProps {
  cards: TrackedOssCardItem[];
}

function providerClass(provider: string | null): string {
  const slug = (provider ?? "").toLowerCase();
  if (slug.includes("stripe")) return "stripe";
  if (slug.includes("lemon")) return "lemonsqueezy";
  if (slug.includes("paddle")) return "paddle";
  return "";
}

function providerLabel(provider: string | null): string {
  const slug = (provider ?? "").toLowerCase();
  if (slug.includes("stripe")) return "STRIPE";
  if (slug.includes("lemon")) return "LEMON";
  if (slug.includes("paddle")) return "PADDLE";
  return (provider ?? "VERIFIED").toUpperCase();
}

function fmtMrr(cents: number | null): string {
  if (!cents || cents <= 0) return "—";
  const usd = cents / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(usd >= 10_000_000 ? 0 : 1)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${Math.round(usd)}`;
}

function fmtGrowth(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  return pct >= 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
}

export function TrackedOssCards({ cards }: TrackedOssCardsProps) {
  return (
    <div className="panel fade-up" style={{ margin: "18px 0 14px" }}>
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 01"}</span>
        <span className="ph-title">Tracked repos with verified revenue</span>
        <span className="ph-meta">
          <b>{cards.length}</b> matches
        </span>
      </div>
      <div className="tracked-grid">
        {cards.map((card, idx) => {
          const displayName = card.displayName ?? card.repo.name;
          const provider = providerClass(card.overlay.paymentProvider);
          const label = providerLabel(card.overlay.paymentProvider);
          const category = card.overlay.category ?? "TRACKED";
          const growth = fmtGrowth(card.overlay.growthMrr30d);
          const growthClass =
            card.overlay.growthMrr30d === null
              ? ""
              : card.overlay.growthMrr30d >= 0
                ? "up"
                : "down";
          return (
            <div className="tracked-card" key={card.repo.fullName}>
              <div className="tc-head">
                <span className="tc-rank">{String(idx + 1).padStart(2, "0")}</span>
                <div className="tc-logo">
                  {/* eslint-disable-next-line @next/next/no-img-element -- GitHub avatar CDN */}
                  <img
                    src={`https://avatars.githubusercontent.com/${card.repo.owner}?s=80&v=4`}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                      borderRadius: "inherit",
                    }}
                  />
                </div>
                <div className="tc-id">
                  <span className="tc-name">
                    {displayName}{" "}
                    <span className="verified" aria-label="verified revenue">
                      <ShieldCheck size={12} strokeWidth={2.5} aria-hidden="true" />
                    </span>
                  </span>
                  <Link
                    className="tc-repo"
                    href={`/repo/${card.repo.owner}/${card.repo.name}`}
                  >
                    {card.repo.fullName}
                  </Link>
                </div>
              </div>
              <div className="tc-stats">
                <div className="tc-stat">
                  <span className="lbl">MRR</span>
                  <span className="val">{fmtMrr(card.overlay.mrrCents)}</span>
                </div>
                <div className="tc-stat">
                  <span className="lbl">growth 30d</span>
                  <span className={`val ${growthClass}`}>{growth}</span>
                </div>
              </div>
              <div className="tc-foot">
                <span className={`pp ${provider}`}>{label}</span>
                <span
                  className="pp"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                  }}
                >
                  {category.toUpperCase()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { TrackedOssCardItem };
