// ThemeLab — 7-tile chart-theme gallery shown beneath the main star-history
// chart. Each tile renders the SAME windowed payload through a different
// visual treatment so the operator can compare them side-by-side and click
// to apply.
//
// Six tiles delegate to <StarChart> (ECharts-backed area chart with a
// registered theme). The seventh tile (`sketch`) renders <SketchArt>, a
// custom SVG with a turbulence-displaced rough stroke — ECharts has no
// native hand-drawn line support, so we fake it convincingly with feTurbulence.
//
// Client Component (because <StarChart> is). Hrefs are pre-computed on the
// server and passed as a plain string map — closures can't cross the
// server→client boundary in App Router.

"use client";

import Link from "next/link";

import { RechartsTile, type RechartsVariant } from "./RechartsTile";
import { SketchArt } from "./SketchArt";
import type { ChartGeometry } from "./geometry";
import {
  GALLERY_THEMES,
  type GalleryThemeName,
} from "@/lib/charts/public-themes";
import type { StarActivityPayload, StarActivityScale } from "@/lib/star-activity";

interface ThemeLabProps {
  geom: ChartGeometry;
  windowedPayload: StarActivityPayload;
  scale: StarActivityScale;
  repoFullName: string;
  activeTheme: string;
  /** Pre-computed href per theme — built server-side in page.tsx because
   * function closures can't be serialized across the server→client boundary
   * in App Router. */
  themeHrefs: Partial<Record<GalleryThemeName, string>>;
}

// Recharts-variant lookup. Every gallery theme except `sketch` maps to one
// of the 6 hand-crafted Recharts compositions in `RechartsTile`. We treat
// the rest as type-safe explicit entries to make adding/removing variants
// a compile-time check rather than a runtime "unknown variant" fallback.
const RECHARTS_VARIANT: Partial<Record<GalleryThemeName, RechartsVariant>> = {
  aurora: "aurora",
  parchment: "parchment",
  newsprint: "newsprint",
  phosphor: "phosphor",
  blueprint: "blueprint",
  riso: "riso",
  aiso: "aiso",
};

export function ThemeLab({
  geom,
  windowedPayload,
  repoFullName,
  activeTheme,
  themeHrefs,
}: ThemeLabProps) {
  const tiles = GALLERY_THEMES.map((t) => ({ ...t, href: themeHrefs[t.id] ?? "#" }));

  return (
    <section className="sh-theme-lab" aria-label="Theme lab — pick a chart treatment">
      <div className="sh-theme-lab-head">
        <span className="sh-share-label">{"// theme lab"}</span>
        <span className="sh-theme-lab-hint">
          same data · <b>{tiles.length}</b> treatments · click to apply
        </span>
      </div>
      <div className="sh-theme-lab-grid">
        {tiles.map((t) => {
          const isActive = t.id === activeTheme;
          return (
            <Link
              key={t.id}
              href={t.href}
              prefetch={false}
              className={`sh-theme-tile sh-tt-${t.id}${isActive ? " is-active" : ""}${t.light ? " is-light" : " is-dark"}`}
              aria-current={isActive ? "true" : undefined}
              aria-label={`Apply ${t.label} theme`}
            >
              <div className="sh-theme-tile-head">
                <span className="sh-theme-tile-swatch" style={{ background: t.swatch }} aria-hidden="true" />
                <span className="sh-theme-tile-label">{t.label}</span>
                {isActive ? <span className="sh-theme-tile-active">ACTIVE</span> : null}
              </div>
              <div className="sh-theme-tile-canvas">
                {/* Repo-name watermark — top-left of every tile so the
                 * gallery never loses track of what it's plotting. Now
                 * applied uniformly (sketch included) since the SVG-internal
                 * Comic-Sans caption was removed to avoid duplication with
                 * the main chart-card header. */}
                <span
                  className="sh-theme-tile-repo"
                  aria-hidden="true"
                  title={repoFullName}
                >
                  {repoFullName}
                </span>
                {t.id === "sketch" ? (
                  <SketchArt geom={geom} repoFullName={repoFullName} />
                ) : RECHARTS_VARIANT[t.id] ? (
                  <RechartsTile
                    variant={RECHARTS_VARIANT[t.id]!}
                    payload={windowedPayload}
                    uid={`tl-${t.id}`}
                  />
                ) : null}
              </div>
              <div className="sh-theme-tile-foot">
                <span className="sh-theme-tile-blurb">{t.blurb}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
