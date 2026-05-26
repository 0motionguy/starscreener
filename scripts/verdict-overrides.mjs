// Hand-authored anchor reports — ONLY for repos with genuine, verifiable
// domain knowledge. Authoring "expertise" for repos we don't actually know
// would fabricate authority and fail E-E-A-T Trust, so this set is small and
// deliberately conservative. Everything else is synthesized from each repo's
// own README + live data + citations by synthesize-verdicts.mjs.
//
// Each override may set any subset of fields; unset fields fall back to the
// generated value. Real citations + scores are always attached from live data.

export const OVERRIDES = {
  // populated post-enrichment for marquee repos (firecrawl, langgraph, litellm)
  // once their real current numbers are confirmed from the enriched record.
};
