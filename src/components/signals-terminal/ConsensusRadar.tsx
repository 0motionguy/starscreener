// Consensus radar — renders ConsensusStory[] from src/lib/signals/consensus.ts
// Reuses the existing .cons-row / .cons-top / .cons-bot styles from globals.css
// so this looks native to the rest of the terminal.

import Link from "next/link";
import type { ConsensusStory } from "@/lib/signals/consensus";
import { Card, CardHeader } from "@/components/ui/Card";
import { SourceMark, SOURCE_BRAND_COLOR } from "./SourceMark";

function buildSparkPath(
  spark: number[],
  width: number,
  height: number,
): { line: string; fill: string; lastX: number; lastY: number } {
  if (spark.length === 0) {
    return { line: "", fill: "", lastX: 0, lastY: height };
  }
  const max = Math.max(...spark, 1);
  const min = Math.min(...spark, 0);
  const span = max - min || 1;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < spark.length; i++) {
    const x = (i / Math.max(1, spark.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((spark[i] - min) / span) * (height - 4);
    xs.push(x);
    ys.push(y);
  }
  const line = xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`)
    .join(" ");
  const fill = `${line} L${xs[xs.length - 1].toFixed(1)},${height} L${xs[0].toFixed(1)},${height} Z`;
  return {
    line,
    fill,
    lastX: xs[xs.length - 1],
    lastY: ys[ys.length - 1],
  };
}

export interface ConsensusRadarProps {
  stories: ConsensusStory[];
  totalActive: number;
}

export function ConsensusRadar({ stories, totalActive }: ConsensusRadarProps) {
  // Right-side count copy depends on how many strong (3+ source) stories
  // we have vs how many "near-consensus" rows are padding the panel.
  const nearCount = stories.length - totalActive;
  const headerRight =
    totalActive === 0
      ? `${stories.length} NEAR`
      : nearCount > 0
        ? `${totalActive} ACTIVE · ${nearCount} NEAR`
        : `${totalActive} ACTIVE`;

  // Subtitle changes when we're in fallback mode so the user knows the
  // panel isn't claiming false consensus.
  const subtitle =
    totalActive === 0
      ? "· NO CONSENSUS YET · TOP SINGLE-SOURCE SIGNALS"
      : "· STORIES IN 3+ SOURCES";

  return (
    <Card variant="panel" className="signals-panel">
      <CardHeader showCorner right={<span>{headerRight}</span>}>
        <span>{"// 02 CONSENSUS RADAR"}</span>
        <span style={{ color: "var(--color-text-subtle)", marginLeft: "8px" }}>
          {subtitle}
        </span>
      </CardHeader>

      <div className="ds-card-body" style={{ padding: 0 }}>
        {stories.length === 0 ? (
          <div
            style={{
              padding: "24px 14px",
              color: "var(--color-text-subtle)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.10em",
            }}
          >
            no signals yet — collectors warming up
          </div>
        ) : (
          stories.map((story, i) => {
            const isTop = i === 0;
            const down = story.delta < 0;
            const sparkColor = down
              ? "var(--color-negative)"
              : isTop
                ? "var(--color-accent)"
                : "var(--color-positive)";
            const fillColor = down
              ? "rgba(255,77,77,0.18)"
              : isTop
                ? "rgba(255,107,53,0.32)"
                : "rgba(34,197,94,0.20)";

            const W = 130;
            const H = 24;
            const { line, fill, lastX, lastY } = buildSparkPath(story.spark, W, H);

            const href = story.linkedRepo
              ? `/repo/${story.linkedRepo}`
              : story.lead.url ?? "#";
            const isInternal = !!story.linkedRepo;

            const visibleSources = story.sources.slice(0, 5);
            const moreCount = story.sources.length - visibleSources.length;
            // Near-consensus rows (< 3 sources) are dimmed so the eye still
            // groups them apart from real cross-source consensus.
            const isWeak = story.sources.length < 3;
            const wrapperStyle: React.CSSProperties = {
              display: "flex",
              flexDirection: "column",
              opacity: isWeak ? 0.78 : 1,
            };

            const Wrapper = ({ children }: { children: React.ReactNode }) =>
              isInternal ? (
                <Link
                  href={href}
                  className={`cons-row ${isTop ? "first" : ""}`}
                  style={wrapperStyle}
                >
                  {children}
                </Link>
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`cons-row ${isTop ? "first" : ""}`}
                  style={wrapperStyle}
                >
                  {children}
                </a>
              );

            return (
              <Wrapper key={story.key}>
                <div className="cons-top">
                  <div className="rk">
                    <span
                      style={{
                        color: isTop
                          ? "var(--color-accent)"
                          : "var(--color-text-default)",
                        fontWeight: 700,
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>{" "}
                    <span
                      style={{
                        fontSize: 9,
                        color: down ? "var(--color-negative)" : "var(--color-positive)",
                      }}
                    >
                      {story.delta >= 0 ? `+${story.delta}` : story.delta}
                    </span>
                  </div>
                  <div className="nm">
                    <div
                      className="h"
                      style={{
                        whiteSpace: "normal",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontSize: 12.5,
                        lineHeight: 1.32,
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      {story.title}
                    </div>
                    <div className="meta">
                      {story.topTag ? (
                        <span
                          className="tag"
                          style={{
                            color: isTop ? "var(--color-accent)" : undefined,
                            borderColor: isTop ? "var(--color-accent)" : undefined,
                          }}
                        >
                          {story.topTag.toUpperCase()}
                        </span>
                      ) : null}
                      {story.linkedRepo ? (
                        <span style={{ color: "var(--color-text-faint)" }}>
                          {story.linkedRepo}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="delta">
                    {story.score.toFixed(1)}
                    <span className="lbl">score</span>
                  </div>
                </div>

                <div className="cons-bot">
                  <div className="srcs">
                    {visibleSources.map((s) => (
                      <span
                        key={s}
                        className="sd cons-srcmark"
                        title={s}
                        aria-label={s}
                        style={{
                          // Soft brand-tint background so the colored mark
                          // reads against the dark page bg without a hard
                          // colored badge.
                          background: `color-mix(in srgb, ${SOURCE_BRAND_COLOR[s]} 22%, transparent)`,
                          borderColor: `color-mix(in srgb, ${SOURCE_BRAND_COLOR[s]} 55%, transparent)`,
                          color: SOURCE_BRAND_COLOR[s],
                        }}
                      >
                        <SourceMark source={s} size={11} monochrome />
                      </span>
                    ))}
                    {moreCount > 0 ? (
                      <span
                        style={{
                          fontSize: 9,
                          color: "var(--color-text-faint)",
                          marginLeft: 4,
                        }}
                      >
                        +{moreCount}
                      </span>
                    ) : null}
                  </div>
                  <svg
                    className="spark-mini"
                    viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="none"
                    style={{ flex: 1, minWidth: 0, height: 22 }}
                    aria-hidden
                  >
                    {fill ? <path d={fill} fill={fillColor} stroke="none" /> : null}
                    {line ? (
                      <path
                        d={line}
                        fill="none"
                        stroke={sparkColor}
                        strokeWidth={1.4}
                      />
                    ) : null}
                    {line ? (
                      <circle
                        cx={lastX.toFixed(1)}
                        cy={lastY.toFixed(1)}
                        r={2.2}
                        fill={sparkColor}
                        stroke="var(--color-bg-shell)"
                        strokeWidth={1}
                      />
                    ) : null}
                  </svg>
                </div>
              </Wrapper>
            );
          })
        )}
      </div>
    </Card>
  );
}

export default ConsensusRadar;
