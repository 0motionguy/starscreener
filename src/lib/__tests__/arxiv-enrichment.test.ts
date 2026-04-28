// Verifies that arxiv enrichment overlays correctly merge into the
// scoring pipeline. Uses synthetic fixtures only — never hits Semantic
// Scholar.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  _resetArxivEnrichmentForTests,
  _setArxivEnrichmentForTests,
  getArxivEnrichment,
  type ArxivEnrichedFile,
} from "../arxiv";
import { arxivScorer, type ArxivPaperItem } from "../pipeline/scoring/domain/arxiv";

test("getArxivEnrichment returns null for unknown ids in cold seed", () => {
  _resetArxivEnrichmentForTests();
  assert.equal(getArxivEnrichment("9999.99999"), null);
  assert.equal(getArxivEnrichment(""), null);
});

test("getArxivEnrichment returns the record after _setArxivEnrichmentForTests", () => {
  const fixture: ArxivEnrichedFile = {
    fetchedAt: new Date().toISOString(),
    source: "test",
    socialSources: ["hackernews", "reddit"],
    count: 1,
    papers: [
      {
        arxivId: "2401.12345",
        citationCount: 42,
        citationVelocity: 7.5,
        socialMentions: 12,
        lastEnrichedAt: new Date().toISOString(),
      },
    ],
  };
  _setArxivEnrichmentForTests(fixture);
  try {
    const rec = getArxivEnrichment("2401.12345");
    assert.ok(rec !== null);
    assert.equal(rec.citationCount, 42);
    assert.equal(rec.citationVelocity, 7.5);
    assert.equal(rec.socialMentions, 12);
    assert.equal(getArxivEnrichment("2401.99999"), null);
  } finally {
    _resetArxivEnrichmentForTests();
  }
});

test("enrichment lights up citationVelocity in the scorer's component output", () => {
  // Scorer input matching what rawToScorerItem would build for an
  // enriched paper. We feed it directly to the scorer to keep this test
  // independent of the bundled JSON shape.
  const enriched: ArxivPaperItem = {
    domainKey: "arxiv",
    id: "2401.12345",
    joinKeys: { arxivId: "2401.12345" },
    citationVelocity: 25,
    citationCount: 120,
    socialMentions: 50,
    hfAdoptionCount: 0,
    daysSincePublished: 30,
  };
  const cold: ArxivPaperItem = {
    domainKey: "arxiv",
    id: "2401.99999",
    joinKeys: { arxivId: "2401.99999" },
    citationVelocity: 0,
    citationCount: 0,
    socialMentions: 0,
    hfAdoptionCount: 0,
    daysSincePublished: 30,
  };
  const [enrichedScored, coldScored] = arxivScorer.computeRaw([enriched, cold]);

  // The component-level signal we care about: enrichment raises the
  // citationVelocity component above 0, while a paper without enrichment
  // stays at 0 there.
  assert.ok(
    enrichedScored.rawComponents.citationVelocity > 0,
    `expected citationVelocity component > 0, got ${enrichedScored.rawComponents.citationVelocity}`,
  );
  assert.equal(coldScored.rawComponents.citationVelocity, 0);

  // Enriched paper should also out-rank the cold one on rawScore.
  assert.ok(
    enrichedScored.rawScore > coldScored.rawScore,
    `expected enriched.rawScore (${enrichedScored.rawScore}) > cold.rawScore (${coldScored.rawScore})`,
  );
});
