// Agent Commerce — composite movers board (top-12 leaderboard with sparklines
// and rich per-row meta: stars, push age, social mentions, AISO, token deltas).
//
// Extracted from `src/app/agent-commerce/page.tsx` as part of A8-P2. Pure
// presentation; sorted slice + the per-row score-history sparkline data come
// in from the page. `compactProtocol` is co-located because it's only used
// here.

import Link from "next/link";

import { BrandStar } from "@/components/shared/BrandStar";

import type { AgentCommerceItem } from "@/lib/agent-commerce/types";

import { Sparkline } from "./Sparkline";

function compactProtocol(proto: string): { color: string; label: string } {
  switch (proto) {
    case "x402":
      return { color: "#f59e0b", label: "x402" };
    case "mcp":
      return { color: "#22d3ee", label: "MCP" };
    case "a2a":
      return { color: "#f472b6", label: "A2A" };
    case "rest":
    case "graphql":
    case "grpc":
    case "http":
    default:
      return { color: "var(--color-text-faint)", label: proto.toUpperCase() };
  }
}

export interface AgentCommerceMoversBoardProps {
  /** Already-sorted slice (top N by composite score). */
  movers: AgentCommerceItem[];
}

export function AgentCommerceMoversBoard({ movers }: AgentCommerceMoversBoardProps) {
  return (
    <>
      <div className="sec-head">
        <span className="sec-num">{"// 01"}</span>
        <h2 className="sec-title">Composite movers</h2>
        <span className="sec-meta">
          <b>{movers.length}</b> / top by score
        </span>
      </div>
      <section className="board ac-board">
        {movers.map((item, idx) => {
          const score = item.scores.composite;
          const tone =
            score >= 60
              ? "#34d399"
              : score >= 40
                ? "#f59e0b"
                : "var(--color-text-default)";
          // 2026-05-15: removed synthetic seeded sparkline — it suggested
          // a real time-series that doesn't exist. Pass `[]` so Sparkline
          // (early-returns on data.length < 2) renders nothing until the
          // score-history collector lands.
          const sparkData: number[] = [];
          return (
            <Link
              key={item.id}
              href={`/agent-commerce/${item.slug}`}
              className={`mover-row ac-mover ${idx === 0 ? "first" : ""}`}
              style={{
                gridTemplateColumns:
                  "28px minmax(0, 1fr) 100px 90px auto",
              }}
            >
              <span className="rk">{String(idx + 1).padStart(2, "0")}</span>
              <span className="nm">
                <span className="h">{item.name}</span>
                <span className="meta">
                  <span className="tag">{item.kind}</span>
                  {item.category}
                  {" · "}
                  {item.protocols.slice(0, 3).map((p, i) => {
                    const cp = compactProtocol(p);
                    return (
                      <span
                        key={p}
                        style={{
                          color: cp.color,
                          marginLeft: i === 0 ? 6 : 4,
                          fontWeight: 700,
                          fontFamily: "var(--font-mono)",
                          fontSize: 9.5,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          padding: p === "x402" ? "1px 6px" : undefined,
                          borderRadius: p === "x402" ? 2 : undefined,
                          border:
                            p === "x402" ? `1px solid ${cp.color}66` : undefined,
                          background:
                            p === "x402"
                              ? "rgba(245, 158, 11, 0.12)"
                              : undefined,
                        }}
                      >
                        {cp.label}
                      </span>
                    );
                  })}
                  {item.live?.stars ? (
                    <span
                      style={{
                        marginLeft: 8,
                        color: "#fbbf24",
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <BrandStar size={12} />
                      {item.live.stars.toLocaleString("en-US")}
                    </span>
                  ) : null}
                  {item.live?.pushedAt ? (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "var(--color-text-faint)",
                      }}
                    >
                      {(() => {
                        const days = Math.max(
                          0,
                          Math.floor(
                            (Date.now() -
                              new Date(item.live.pushedAt).getTime()) /
                              86_400_000,
                          ),
                        );
                        return days === 0
                          ? "today"
                          : days === 1
                            ? "1d ago"
                            : days < 30
                              ? `${days}d ago`
                              : days < 365
                                ? `${Math.floor(days / 30)}mo ago`
                                : `${Math.floor(days / 365)}y ago`;
                      })()}
                    </span>
                  ) : null}
                  {typeof item.live?.hnMentions90d === "number" &&
                  item.live.hnMentions90d > 0 ? (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "#f97316",
                        fontWeight: 700,
                      }}
                    >
                      HN·{item.live.hnMentions90d}
                    </span>
                  ) : null}
                  {typeof item.live?.npmWeeklyDownloads === "number" &&
                  item.live.npmWeeklyDownloads > 0 ? (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "#cbd5e1",
                        fontWeight: 700,
                      }}
                    >
                      npm·
                      {item.live.npmWeeklyDownloads >= 1_000_000
                        ? `${(item.live.npmWeeklyDownloads / 1_000_000).toFixed(1)}M`
                        : item.live.npmWeeklyDownloads >= 1000
                          ? `${Math.round(item.live.npmWeeklyDownloads / 1000)}k`
                          : item.live.npmWeeklyDownloads}
                      /wk
                    </span>
                  ) : null}
                  {(item.live?.redditMentions?.count ?? 0) > 0 ? (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "#fb923c",
                        fontWeight: 700,
                      }}
                    >
                      r/{item.live?.redditMentions?.count ?? 0}
                    </span>
                  ) : null}
                  {(item.live?.blueskyMentions?.count ?? 0) > 0 ? (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "#60a5fa",
                        fontWeight: 700,
                      }}
                    >
                      bsky·{item.live?.blueskyMentions?.count ?? 0}
                    </span>
                  ) : null}
                  {(item.live?.devtoMentions?.count ?? 0) > 0 ? (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "#34d399",
                        fontWeight: 700,
                      }}
                    >
                      dev·{item.live?.devtoMentions?.count ?? 0}
                    </span>
                  ) : null}
                  {typeof item.scores.aisoScore === "number" ? (
                    <span
                      style={{
                        marginLeft: 6,
                        color:
                          item.scores.aisoScore >= 80
                            ? "var(--color-gold)"
                            : item.scores.aisoScore >= 60
                              ? "var(--color-warning)"
                              : "var(--color-text-faint)",
                        fontWeight: 700,
                      }}
                      title={`AISO score ${item.scores.aisoScore}`}
                    >
                      aiso·{item.scores.aisoScore}
                    </span>
                  ) : null}
                  {item.live?.tokenSymbol ? (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "#a78bfa",
                        fontWeight: 700,
                      }}
                      title={
                        item.live.marketCapUsd
                          ? `Market cap $${(item.live.marketCapUsd / 1e6).toFixed(0)}M`
                          : undefined
                      }
                    >
                      ${item.live.tokenSymbol}
                      {Number.isFinite(item.live.priceChange24hPct) ? (
                        <em
                          style={{
                            fontStyle: "normal",
                            marginLeft: 3,
                            color:
                              (item.live.priceChange24hPct ?? 0) >= 0
                                ? "#34d399"
                                : "#f87171",
                          }}
                        >
                          {(item.live.priceChange24hPct ?? 0) >= 0
                            ? "+"
                            : ""}
                          {(item.live.priceChange24hPct ?? 0).toFixed(1)}%
                        </em>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </span>
              <span style={{ color: tone, alignSelf: "center" }}>
                <Sparkline
                  data={sparkData}
                  color={tone}
                  width={100}
                  height={22}
                />
              </span>
              <span
                className="amt"
                style={{ color: tone }}
              >
                {score}
                <span className="lbl">score</span>
              </span>
              <span className="stage">
                {item.pricing.type === "unknown"
                  ? "—"
                  : item.pricing.type.replace("_", " ")}
              </span>
            </Link>
          );
        })}
      </section>
    </>
  );
}
