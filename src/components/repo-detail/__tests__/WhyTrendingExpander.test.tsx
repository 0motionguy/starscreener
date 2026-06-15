// WhyTrendingExpander rendering tests.
//
// The component is an async server component. To test it under vitest's
// happy-dom environment we await the JSX it returns and render the result
// with @testing-library/react. The consensus-verdicts module is mocked so
// the test never touches the data-store layer — we control exactly what
// getConsensusItemReport / getConsensusVerdictsPayload return per case.

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ConsensusItemReport,
  ConsensusVerdictsPayload,
} from "@/lib/consensus-verdicts";

// Hoisted mock state. vi.mock() factories run before module imports — using
// module-scope `let` bindings risks an undefined dereference at hoist time.
const { mockState } = vi.hoisted(() => ({
  mockState: {
    report: null as ConsensusItemReport | null,
    payload: {
      computedAt: "2026-06-15T00:00:00.000Z",
      generator: "kimi" as ConsensusVerdictsPayload["generator"],
      ribbon: { headline: "", bullets: [] },
      items: {},
    } as ConsensusVerdictsPayload,
  },
}));

vi.mock("@/lib/consensus-verdicts", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/consensus-verdicts")
  >("@/lib/consensus-verdicts");
  return {
    ...actual,
    refreshConsensusVerdictsFromStore: vi.fn(async () => ({
      source: "memory" as const,
      ageMs: 0,
      writtenAt: null,
    })),
    getConsensusItemReport: vi.fn(() => mockState.report),
    getConsensusVerdictsPayload: vi.fn(() => mockState.payload),
  };
});

import { WhyTrendingExpander } from "@/components/repo-detail/WhyTrendingExpander";

const FRESH_REPORT: ConsensusItemReport = {
  fullName: "vercel/next.js",
  summary:
    "Next.js continues its dominance with steady weekly star growth and renewed devtools chatter.",
  whyNow:
    "Two community-led releases in the last week, plus a viral DX-tweet thread by a maintainer, drove a 7-day star delta well above its baseline.",
  contrarian:
    "Most of the velocity is concentrated in three sources; a single retraction could flip momentum down.",
  scores: {
    momentum: 82,
    credibility: 91,
    crossSource: 74,
    developerAdoption: 88,
    marketRelevance: 76,
    hypeRisk: 24,
  },
  evidence: [
    "Top 3 on Hacker News for two straight days.",
    "Reddit r/nextjs activity up 38% week-over-week.",
    "12 new corporate adopters logged on jobs boards.",
  ],
  verdict: "strong",
  confidence: 87,
  whatToDo: "build",
  whatToDoDetail:
    "Worth integrating into your stack now — distribution risk is low and the maintainer cadence is healthy.",
};

beforeEach(() => {
  mockState.report = null;
  mockState.payload = {
    computedAt: "2026-06-15T00:00:00.000Z",
    generator: "kimi",
    ribbon: { headline: "", bullets: [] },
    items: {},
  };
});

afterEach(() => {
  cleanup();
});

describe("WhyTrendingExpander", () => {
  it("renders the full verdict surface when a fresh report is available", async () => {
    mockState.report = FRESH_REPORT;

    const ui = await WhyTrendingExpander({ fullName: "vercel/next.js" });
    expect(ui).not.toBeNull();
    const { container } = render(ui);

    // Header label
    expect(container.textContent).toContain("AI verdict");
    expect(container.textContent).toContain("STRONG SIGNAL");
    expect(container.textContent).toContain("confidence 87%");

    // Summary line
    expect(container.textContent).toContain(FRESH_REPORT.summary);

    // Why now
    expect(container.textContent).toContain("WHY NOW");
    expect(container.textContent).toContain(FRESH_REPORT.whyNow);

    // Contrarian — small, italic. Just assert the prose is present; the
    // visual italic styling is handled by the className.
    expect(container.textContent).toContain("CONTRARIAN VIEW");
    expect(container.textContent).toContain(FRESH_REPORT.contrarian);

    // 6-axis score bars — every axis label must appear, plus the rounded value.
    expect(container.textContent).toContain("MOMENTUM");
    expect(container.textContent).toContain("CREDIBILITY");
    expect(container.textContent).toContain("CROSS-SOURCE");
    expect(container.textContent).toContain("DEV ADOPTION");
    expect(container.textContent).toContain("MARKET RELEVANCE");
    expect(container.textContent).toContain("HYPE RISK");
    expect(container.textContent).toContain("82"); // momentum value
    expect(container.textContent).toContain("24"); // hype-risk value

    // Evidence bullets
    expect(container.textContent).toContain("EVIDENCE");
    for (const bullet of FRESH_REPORT.evidence) {
      expect(container.textContent).toContain(bullet);
    }

    // CTA — action label + detail
    expect(container.textContent).toContain("WHAT TO DO");
    expect(container.textContent).toContain("BUILD");
    expect(container.textContent).toContain(FRESH_REPORT.whatToDoDetail);

    // Footer — generator + refresh cadence. The mock payload has
    // generator: "kimi", so the footer should read Kimi-K2.
    expect(container.textContent).toContain("Generated by Kimi-K2");
    expect(container.textContent).toContain("Refresh every hour");

    // Default state — collapsed (no `open` attribute on the <details>).
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
  });

  it("renders nothing when the analyst has not covered the repo (or payload is stale)", async () => {
    // mockState.report stays null — mirrors both the "not in top-N" case AND
    // the "past 48h stale-hide gate" case. The expander cannot distinguish
    // between them by design: single source of truth for "show or hide" is
    // the null signal from getConsensusItemReport.
    mockState.report = null;

    const ui = await WhyTrendingExpander({ fullName: "obscure/repo" });
    expect(ui).toBeNull();
  });

  it("falls back to deterministic-template footer label when the payload is template-generated", async () => {
    mockState.report = FRESH_REPORT;
    mockState.payload = {
      ...mockState.payload,
      generator: "template",
    };

    const ui = await WhyTrendingExpander({ fullName: "vercel/next.js" });
    const { container } = render(ui);

    expect(container.textContent).toContain("deterministic template");
  });
});
