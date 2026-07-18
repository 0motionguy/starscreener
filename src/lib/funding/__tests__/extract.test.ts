// Vitest coverage for the funding-headline gate in src/lib/funding/extract.ts.
//
// Focus: the non-funding guard + funding-cue requirement that stops market-
// research / earnings / stock headlines (with incidental dollar figures) from
// being mislabeled as funding deals. Mirrors the scraper-side coverage in
// scripts/__tests__/scrape-funding.test.mjs.

import { describe, expect, it } from "vitest";

import {
  extractFundingFromHeadline,
  hasFundingCue,
  isNonFundingHeadline,
} from "../extract";

describe("isNonFundingHeadline", () => {
  it("flags market-size / forecast / CAGR reports", () => {
    expect(
      isNonFundingHeadline(
        "Light Field Technology Market to Reach US$ 440.3 Million by 2032",
      ),
    ).toBe(true);
    expect(isNonFundingHeadline("Global AI Market Size to Reach $1.3T by 2030")).toBe(true);
    expect(isNonFundingHeadline("Report projects 24% CAGR for agent tooling")).toBe(true);
  });

  it("flags earnings and stock-move headlines", () => {
    expect(isNonFundingHeadline("Nvidia shares surge on quarterly earnings beat")).toBe(true);
    expect(isNonFundingHeadline("AI chipmaker reports record revenue")).toBe(true);
  });

  it("does not flag genuine funding headlines", () => {
    expect(isNonFundingHeadline("Anthropic raises $450M in Series C funding")).toBe(false);
    expect(isNonFundingHeadline("Cursor secures $900M backed by Thrive")).toBe(false);
  });
});

describe("hasFundingCue", () => {
  it("true for funding verbs/nouns", () => {
    expect(hasFundingCue("Acme raises $5M seed round")).toBe(true);
    expect(hasFundingCue("startup backed by a16z")).toBe(true);
    expect(hasFundingCue("closes Series B led by Index")).toBe(true);
  });

  it("false when only an amount is present", () => {
    expect(hasFundingCue("valued at $440 million by 2032")).toBe(false);
    expect(hasFundingCue("priced at $200 per month")).toBe(false);
  });
});

describe("extractFundingFromHeadline gate", () => {
  it("returns null for the market-research false positive", () => {
    expect(
      extractFundingFromHeadline(
        "Light Field Technology Market to Reach US$ 440.3 Million by 2032, Driven by AI",
        "New report forecasts strong CAGR.",
      ),
    ).toBeNull();
  });

  it("returns null for an amount + company with no funding cue", () => {
    expect(
      extractFundingFromHeadline("OpenAI unveils GPT-6 priced at $200 per month", ""),
    ).toBeNull();
  });

  it("still extracts genuine raises", () => {
    const r = extractFundingFromHeadline(
      "Anthropic raises $450M in Series C funding",
      "",
    );
    expect(r?.companyName).toBe("Anthropic");
    expect(r?.amount).toBe(450_000_000);
    expect(r?.roundType).toBe("series-c");
    expect(r?.confidence).toBe("high");
  });
});
