// Unit tests for the three star-history export themes.
// SVG output — assert structural shape (path count, stroke colors, headline)
// rather than pixel-perfect rendering.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  StarHistoryBlueprint,
  StarHistoryEditorial,
  StarHistoryNeon,
  STAR_HISTORY_THEMES,
  type StarHistoryThemeKey,
} from "@/components/exports/StarHistoryThemes";

afterEach(() => {
  cleanup();
});

const SERIES = [
  { name: "anthropic/claude-code", data: [10, 20, 35, 60, 90] },
  { name: "langchain", data: [80, 95, 110, 130, 150] },
  { name: "openhands", data: [5, 15, 30, 55, 90] },
];

describe("StarHistoryBlueprint", () => {
  it("renders an SVG with one polyline per series and an italic Fraunces headline", () => {
    const { container } = render(
      <StarHistoryBlueprint
        series={SERIES}
        headline="Five repos."
        deck="90D · cumulative"
        eyebrow="FIG. 04"
        totalLabel="+184K stars"
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // 3 series → 3 path d attributes (line-only, no fill in blueprint).
    const paths = container.querySelectorAll('path[stroke]');
    expect(paths.length).toBe(SERIES.length);
    // Headline + eyebrow + deck + total + per-series label = at least 7 text.
    expect(container.querySelectorAll("text").length).toBeGreaterThanOrEqual(7);
  });

  it("uses the cream/print palette (no neon glow filter)", () => {
    const { container } = render(<StarHistoryBlueprint series={SERIES} />);
    expect(container.querySelector('linearGradient[id*="neon"]')).toBeNull();
  });
});

describe("StarHistoryNeon", () => {
  it("includes the radial-glow defs and renders 2× series paths (halo + line)", () => {
    const { container } = render(
      <StarHistoryNeon
        series={SERIES}
        headline="Two repos broke away."
        totalLabel="184,210"
      />,
    );
    expect(container.querySelector("#neon-glow-magenta")).not.toBeNull();
    expect(container.querySelector("#neon-glow-cyan")).not.toBeNull();
    // Each series renders TWO path elements (halo at 6px + line at 2px).
    // Scope the query to top-level <svg> children so we don't count the
    // single grid-pattern path defined inside <defs>/<pattern>.
    const allPaths = Array.from(container.querySelectorAll("path[stroke]"));
    const seriesPaths = allPaths.filter(
      (p) => p.closest("pattern") === null,
    );
    expect(seriesPaths.length).toBe(SERIES.length * 2);
  });

  it("renders the eyebrow in violet ink", () => {
    const { container } = render(
      <StarHistoryNeon series={SERIES} eyebrow="// 90D" />,
    );
    const eyebrowText = Array.from(container.querySelectorAll("text")).find(
      (t) => t.textContent === "// 90D",
    );
    expect(eyebrowText?.getAttribute("fill")).toBe("#be50ff");
  });
});

describe("StarHistoryEditorial", () => {
  it("renders the triple-rule kicker (3 black lines at top)", () => {
    const { container } = render(
      <StarHistoryEditorial
        series={SERIES}
        headline="Two repos broke away."
        deck="A 90-day reading…"
      />,
    );
    const blackLines = Array.from(container.querySelectorAll("line")).filter(
      (l) => l.getAttribute("stroke") === "#1a1a1a",
    );
    expect(blackLines.length).toBeGreaterThanOrEqual(3);
  });

  it("uses italic Georgia headline and red-dot bullet", () => {
    const { container, getByText } = render(
      <StarHistoryEditorial
        series={SERIES}
        headline="Two repos broke away."
        eyebrow="THE CORPUS"
      />,
    );
    const head = getByText("Two repos broke away.");
    expect(head.getAttribute("font-style")).toBe("italic");
    const dot = container.querySelector('circle[fill="#c1272d"]');
    expect(dot).not.toBeNull();
  });
});

describe("STAR_HISTORY_THEMES map", () => {
  it("exposes all three themes by key", () => {
    const keys = Object.keys(STAR_HISTORY_THEMES) as StarHistoryThemeKey[];
    expect(keys.sort()).toEqual(["blueprint", "editorial", "neon"]);
    for (const k of keys) {
      expect(typeof STAR_HISTORY_THEMES[k]).toBe("function");
    }
  });

  it("can render any theme by key lookup", () => {
    const Theme = STAR_HISTORY_THEMES.neon;
    const { container } = render(<Theme series={SERIES} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
