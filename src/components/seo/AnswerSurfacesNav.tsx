// Home-page internal-link widget surfacing the highest-value answer-surface
// leaves (/best/*, /categories/*, /glossary/*) so PageRank flows from the
// site's most-linked page (home) to the answer-surface leaves Google would
// otherwise leave in "Discovered, currently not indexed".
//
// Server component — picks the display list at render time from
// data/_geo/gsc-baseline-latest.json with a curated floor. No client JS.

import Link from "next/link";

import { pickAnswerSurfaces, type AnswerSurface } from "@/lib/seo/answer-surfaces";

interface AnswerSurfacesNavProps {
  /** Override the picker (useful for tests). Falls back to pickAnswerSurfaces(). */
  surfaces?: AnswerSurface[];
  /** Display cap. Defaults to 12. */
  limit?: number;
}

export function AnswerSurfacesNav({ surfaces, limit = 12 }: AnswerSurfacesNavProps) {
  const list = (surfaces ?? pickAnswerSurfaces({ limit })).slice(0, limit);
  if (list.length === 0) return null;

  return (
    <nav
      className="card"
      aria-label="Answer-surface shortcuts"
      style={{ marginTop: "1rem", marginBottom: "1rem" }}
    >
      <div className="card-head">
        <h2 className="card-title">
          {"▌"} <b>Jump to an answer</b>
          <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.85em" }}>
            · Curated best-of lists, plain-English definitions, live leaderboards
          </span>
        </h2>
      </div>
      <div
        className="card-body"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
      >
        {list.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="chip"
            prefetch={false}
            data-surface-group={s.group}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
