// AGN-777 — pure-helper tests for the EnginesStatus indicator.
//
// We don't render the component here; we just exercise the two pure
// helpers (`computeEngineStatuses`, `dotColor`) that decide whether each
// engine pill renders green / amber / red.

import { describe, expect, it } from "vitest";

import type { AisoToolsScan } from "@/lib/aiso-tools";
import { computeEngineStatuses, dotColor } from "../EnginesStatus";

type Test = AisoToolsScan["promptTests"][number];

function row(overrides: Partial<Test> = {}): Test {
  return {
    engine: "ChatGPT",
    prompt: "test prompt",
    cited: false,
    position: 0,
    brandMentioned: false,
    snippet: null,
    ...overrides,
  };
}

describe("computeEngineStatuses", () => {
  it("returns one entry per supported engine even when promptTests is empty", () => {
    const result = computeEngineStatuses([]);
    expect(result.map((r) => r.engine)).toEqual([
      "ChatGPT",
      "Claude",
      "Perplexity",
      "Gemini",
    ]);
    // Every engine should be marked down — no probe fired.
    expect(result.every((r) => r.health === "down")).toBe(true);
    expect(result.every((r) => r.total === 0 && r.cited === 0)).toBe(true);
  });

  it("marks an engine 'up' when at least one prompt was cited", () => {
    const tests = [
      row({ engine: "ChatGPT", cited: true }),
      row({ engine: "Claude" }),
    ];
    const result = computeEngineStatuses(tests);
    const chatgpt = result.find((r) => r.engine === "ChatGPT");
    expect(chatgpt?.health).toBe("up");
    expect(chatgpt?.cited).toBe(1);
    expect(chatgpt?.total).toBe(1);
  });

  it("marks an engine 'up' when only a brand mention exists (no citation)", () => {
    const tests = [row({ engine: "Claude", cited: false, brandMentioned: true })];
    const result = computeEngineStatuses(tests);
    const claude = result.find((r) => r.engine === "Claude");
    expect(claude?.health).toBe("up");
  });

  it("marks an engine 'degraded' when probes ran but produced no citations or mentions", () => {
    const tests = [
      row({ engine: "Perplexity", cited: false, brandMentioned: false }),
      row({ engine: "Perplexity", cited: false, brandMentioned: false }),
    ];
    const result = computeEngineStatuses(tests);
    const perplexity = result.find((r) => r.engine === "Perplexity");
    expect(perplexity?.health).toBe("degraded");
    expect(perplexity?.total).toBe(2);
    expect(perplexity?.cited).toBe(0);
  });

  it("marks an engine 'down' when no probe rows exist for it", () => {
    const tests = [row({ engine: "ChatGPT", cited: true })];
    const result = computeEngineStatuses(tests);
    const gemini = result.find((r) => r.engine === "Gemini");
    expect(gemini?.health).toBe("down");
    expect(gemini?.total).toBe(0);
  });

  it("matches engine names case-insensitively and via substring", () => {
    const tests = [
      row({ engine: "chatgpt-4o", cited: true }),
      row({ engine: "Google Gemini Pro", cited: true }),
    ];
    const result = computeEngineStatuses(tests);
    expect(result.find((r) => r.engine === "ChatGPT")?.health).toBe("up");
    expect(result.find((r) => r.engine === "Gemini")?.health).toBe("up");
  });
});

describe("dotColor", () => {
  it("returns green for 'up'", () => {
    expect(dotColor("up")).toBe("var(--v3-sig-green)");
  });

  it("returns amber for 'degraded'", () => {
    expect(dotColor("degraded")).toBe("var(--v3-sig-amber)");
  });

  it("returns red for 'down'", () => {
    expect(dotColor("down")).toBe("var(--v3-sig-red)");
  });
});
