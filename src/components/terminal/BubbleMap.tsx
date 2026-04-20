// Coin360-style bubble map for 24h repo momentum.
//
// Server component. Takes the full derived-repos set, keeps only
// positive 24h movers, packs them into non-overlapping circles sized by
// starsDelta24h. Green intensity scales with delta magnitude so the
// biggest gainers pop. Each bubble links to the repo detail page.
//
// The layout is computed in pure JS (see src/lib/bubble-pack.ts), no
// client-side physics — the output is a static SVG, flash-of-layout-free.

import Link from "next/link";
import type { Repo } from "@/lib/types";
import { packBubbles, type PackResult } from "@/lib/bubble-pack";
import { formatNumber } from "@/lib/utils";

interface BubbleMapProps {
  repos: Repo[];
  /** Max number of bubbles to render. Default 50 — dense but readable. */
  limit?: number;
}

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 480;
const MIN_RADIUS = 22;
const MAX_RADIUS = 98;

interface Bubble extends PackResult {
  repo: Repo;
  tint: string;
  stroke: string;
  glow: string;
  textColor: string;
}

/**
 * Map a positive 24h delta to a green tint. Saturation ramps from a
 * muted teal (small gains) up to a punchy lime (biggest gains). Uses
 * the log of the delta so a +1000 gainer doesn't make everything else
 * look flat.
 */
function greenTintFor(delta: number, maxDelta: number): {
  fill: string;
  stroke: string;
  glow: string;
  text: string;
} {
  const logDelta = Math.log10(Math.max(delta, 1));
  const logMax = Math.log10(Math.max(maxDelta, 1));
  const t = logMax > 0 ? Math.min(1, logDelta / logMax) : 0;

  // Lerp from muted slate-green to saturated lime.
  // Base:  rgb(30,  70,  56)   Hot: rgb(22, 197, 94) (tailwind green-500)
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = lerp(30, 22);
  const g = lerp(70, 197);
  const b = lerp(56, 94);

  const fill = `rgb(${r}, ${g}, ${b})`;
  const strokeAlpha = 0.35 + t * 0.4;
  const stroke = `rgba(${Math.min(255, r + 30)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 20)}, ${strokeAlpha.toFixed(2)})`;
  const glow = `rgba(34, 197, 94, ${(0.08 + t * 0.32).toFixed(2)})`;
  const text = t > 0.35 ? "#0e1410" : "#dcf5e1";
  return { fill, stroke, glow, text };
}

export function BubbleMap({ repos, limit = 50 }: BubbleMapProps) {
  const candidates = repos
    .filter((r) => r.starsDelta24h > 0)
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)
    .slice(0, limit);

  if (candidates.length === 0) {
    return null;
  }

  const maxDelta = candidates[0].starsDelta24h;
  const packed = packBubbles(
    candidates.map((r) => ({ id: r.id, value: r.starsDelta24h })),
    {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      minRadius: MIN_RADIUS,
      maxRadius: MAX_RADIUS,
      padding: 3,
      fillRatio: 0.7,
    },
  );

  const byId = new Map(candidates.map((r) => [r.id, r]));
  const bubbles: Bubble[] = packed
    .map((p) => {
      const repo = byId.get(p.id);
      if (!repo) return null;
      const tint = greenTintFor(repo.starsDelta24h, maxDelta);
      return {
        ...p,
        repo,
        tint: tint.fill,
        stroke: tint.stroke,
        glow: tint.glow,
        textColor: tint.text,
      };
    })
    .filter((b): b is Bubble => b !== null);

  const totalDelta = candidates.reduce((s, r) => s + r.starsDelta24h, 0);

  return (
    <section
      aria-label="Trending bubble map — 24 hour star movement"
      className="relative mb-6 rounded-card border border-border-primary bg-bg-card/60 overflow-hidden"
    >
      {/* Heading strip */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="label-micro text-brand">24H MOMENTUM</span>
          <span className="label-micro text-text-tertiary">
            BUBBLE MAP
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-text-tertiary">
          <span className="text-text-secondary">
            +{formatNumber(totalDelta)} <span className="text-text-muted">stars / 24h</span>
          </span>
          <span className="hidden sm:inline text-text-muted">
            · {bubbles.length} movers
          </span>
        </div>
      </div>

      {/* SVG bubble canvas. The viewBox gives us responsive scaling for free
          while the underlying pack math stays in its native coordinate
          space. Height scales proportionally. */}
      <div className="px-2 sm:px-3 pb-3">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          width="100%"
          role="img"
          aria-label={`Top ${bubbles.length} trending repos by 24h star gain`}
          className="block"
          style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
        >
          <defs>
            {bubbles.map((b) => (
              <radialGradient
                key={`grad-${b.id}`}
                id={`grad-${b.id}`}
                cx="35%"
                cy="30%"
                r="75%"
              >
                <stop offset="0%" stopColor={b.tint} stopOpacity={1} />
                <stop offset="100%" stopColor={b.tint} stopOpacity={0.82} />
              </radialGradient>
            ))}
          </defs>

          {bubbles.map((b) => {
            const r = b.r;
            const showAvatar = r >= 30;
            const showName = r >= 34;
            const avatarSize = Math.min(28, Math.max(14, r * 0.38));
            // Fonts scale with radius so the smallest bubble still reads.
            const deltaFontSize = Math.max(10, Math.min(20, r * 0.32));
            const nameFontSize = Math.max(9, Math.min(13, r * 0.16));

            const deltaLabel = `+${formatNumber(b.repo.starsDelta24h)}`;
            const shortName =
              b.repo.name.length > 14
                ? `${b.repo.name.slice(0, 13)}…`
                : b.repo.name;

            return (
              <Link
                key={b.id}
                href={`/repo/${b.repo.owner}/${b.repo.name}`}
                aria-label={`${b.repo.fullName} gained ${deltaLabel} stars in 24 hours`}
              >
                <g
                  className="bubble-group"
                  style={{ cursor: "pointer" }}
                >
                  {/* Ambient glow — behind the disk */}
                  <circle
                    cx={b.cx}
                    cy={b.cy}
                    r={r + 4}
                    fill={b.glow}
                    className="bubble-glow"
                  />
                  {/* Main disk */}
                  <circle
                    cx={b.cx}
                    cy={b.cy}
                    r={r}
                    fill={`url(#grad-${b.id})`}
                    stroke={b.stroke}
                    strokeWidth={1.2}
                    className="bubble-disk"
                  />

                  {/* Owner avatar — clipped to a small circle at the top of
                      the bubble. Skipped on the smallest bubbles. */}
                  {showAvatar && b.repo.ownerAvatarUrl && (
                    <>
                      <defs>
                        <clipPath id={`clip-${b.id}`}>
                          <circle
                            cx={b.cx}
                            cy={b.cy - r * 0.34}
                            r={avatarSize / 2}
                          />
                        </clipPath>
                      </defs>
                      <image
                        href={b.repo.ownerAvatarUrl}
                        x={b.cx - avatarSize / 2}
                        y={b.cy - r * 0.34 - avatarSize / 2}
                        width={avatarSize}
                        height={avatarSize}
                        clipPath={`url(#clip-${b.id})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    </>
                  )}

                  {/* Repo name — skipped on very small bubbles */}
                  {showName && (
                    <text
                      x={b.cx}
                      y={b.cy + r * 0.05}
                      textAnchor="middle"
                      fill={b.textColor}
                      fontSize={nameFontSize}
                      fontWeight={600}
                      style={{
                        fontFamily: "var(--font-sans)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {shortName}
                    </text>
                  )}

                  {/* Delta — always shown */}
                  <text
                    x={b.cx}
                    y={b.cy + (showName ? r * 0.36 : r * 0.12)}
                    textAnchor="middle"
                    fill={b.textColor}
                    fontSize={deltaFontSize}
                    fontWeight={700}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {deltaLabel}
                  </text>
                </g>
              </Link>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
