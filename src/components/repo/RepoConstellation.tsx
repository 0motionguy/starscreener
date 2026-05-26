// RepoConstellation — graphical SVG constellation showing the central repo
// and its related/competing repos placed in a ring. Replaces the text-only
// list visualization with the "pf-constellation" pattern from the HTML
// reference. Data source is the existing `getRelatedReposFor(fullName)` —
// no new fetcher.
//
// Layout: polar. Central node holds the avatar + name; up to 6 related
// nodes sit on the ring at 60° intervals. Edge weight (line opacity)
// scales with relative momentum so the strongest connections read first.
//
// Interaction: each ring node is a Next.js `<Link>` to the related repo
// route. Hover highlights via CSS only — no client JS.

import type { JSX } from "react";
import Link from "next/link";

import type { RelatedRepoItem } from "@/lib/repo-related";
import type { Repo } from "@/lib/types";

interface RepoConstellationProps {
  repo: Repo;
  related: RelatedRepoItem[];
}

const RING_RADIUS = 116;
const SVG_VIEWBOX = 320;
const CENTER = SVG_VIEWBOX / 2;
const NODE_RADIUS = 22;
const CENTER_RADIUS = 30;

interface PlacedNode {
  item: RelatedRepoItem;
  x: number;
  y: number;
  edgeOpacity: number;
}

function placeNodes(related: RelatedRepoItem[]): PlacedNode[] {
  const slots = related.slice(0, 6);
  const maxMomentum = Math.max(...slots.map((r) => r.momentumScore), 1);
  return slots.map((item, idx) => {
    // -90deg start so the first node sits at 12 o'clock; clockwise from there.
    const angle = (-90 + (360 / slots.length) * idx) * (Math.PI / 180);
    return {
      item,
      x: CENTER + RING_RADIUS * Math.cos(angle),
      y: CENTER + RING_RADIUS * Math.sin(angle),
      edgeOpacity: 0.25 + 0.55 * (item.momentumScore / maxMomentum),
    };
  });
}

function avatarSeed(fullName: string): string {
  const parts = fullName.split("/");
  const name = parts[1] ?? parts[0] ?? "";
  return ((name.charAt(0) || "?") + (name.charAt(1) || "")).toUpperCase();
}

export function RepoConstellation({
  repo,
  related,
}: RepoConstellationProps): JSX.Element | null {
  if (related.length === 0) return null;
  const nodes = placeNodes(related);

  return (
    <section
      className="card pf-card pf-constellation"
      aria-labelledby="pf-const-head"
    >
      <div className="card-head">
        <h2 className="card-title" id="pf-const-head">
          {"▌"} <b>Constellation</b> {"·"} repos in the same orbit
        </h2>
      </div>
      <div className="pf-const-body">
        <svg
          viewBox={`0 0 ${SVG_VIEWBOX} ${SVG_VIEWBOX}`}
          className="pf-const-svg"
          role="img"
          aria-label={`Related repos constellation for ${repo.fullName}`}
        >
          {/* Concentric guide rings — purely decorative, hidden from a11y */}
          <g aria-hidden="true" className="pf-const-rings">
            <circle cx={CENTER} cy={CENTER} r={RING_RADIUS * 0.4} />
            <circle cx={CENTER} cy={CENTER} r={RING_RADIUS * 0.7} />
            <circle cx={CENTER} cy={CENTER} r={RING_RADIUS} />
          </g>

          {/* Edges from center to each ring node, opacity ~ momentum */}
          <g className="pf-const-edges" aria-hidden="true">
            {nodes.map((n) => (
              <line
                key={`edge-${n.item.fullName}`}
                x1={CENTER}
                y1={CENTER}
                x2={n.x}
                y2={n.y}
                opacity={n.edgeOpacity}
              />
            ))}
          </g>

          {/* Center node — the source repo */}
          <g className="pf-const-center">
            <circle
              cx={CENTER}
              cy={CENTER}
              r={CENTER_RADIUS}
              className="pf-const-center-bg"
            />
            <circle
              cx={CENTER}
              cy={CENTER}
              r={CENTER_RADIUS}
              className="pf-const-center-ring"
            />
            <text
              x={CENTER}
              y={CENTER + 4}
              textAnchor="middle"
              className="pf-const-center-label"
            >
              {avatarSeed(repo.fullName)}
            </text>
          </g>

          {/* Ring nodes */}
          {nodes.map((n) => {
            const [owner, name] = n.item.fullName.split("/");
            const href = `/repo/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(name ?? "")}`;
            return (
              <g key={n.item.fullName} className="pf-const-node">
                <Link href={href} aria-label={n.item.fullName}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={NODE_RADIUS}
                    className="pf-const-node-bg"
                  />
                  <text
                    x={n.x}
                    y={n.y + 3}
                    textAnchor="middle"
                    className="pf-const-node-label"
                  >
                    {avatarSeed(n.item.fullName)}
                  </text>
                </Link>
              </g>
            );
          })}
        </svg>

        <ol className="pf-const-list">
          {nodes.map((n) => {
            const [owner, name] = n.item.fullName.split("/");
            const href = `/repo/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(name ?? "")}`;
            return (
              <li key={n.item.fullName} className="pf-const-list-row">
                <Link href={href} className="pf-const-list-link">
                  <span className="pf-const-list-name">{n.item.fullName}</span>
                  <span className="pf-const-list-meta mono">
                    {n.item.stars.toLocaleString()}★
                    {n.item.language ? ` · ${n.item.language}` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
