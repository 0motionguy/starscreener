// Search query list for the x-funding fetcher.
//
// Each entry is shipped to Apify's `apidojo~tweet-scraper` actor as one item
// in `searchTerms`. The actor expands each term into Twitter's advanced
// search and returns matching tweets.
//
// Goals:
//   - Catch high-dollar funding rounds ($50M+) with minimal noise
//   - Catch seed / Series A / B announcements before they hit RSS
//   - Avoid token-burning broad keywords ("startup", "funding" alone)
//
// Limit kept tight (3-5 queries) so a single 12h run stays under the actor's
// default per-run quota. Operator can grow `EXTRA_QUERIES` once we know the
// per-run cost in production.

export const X_FUNDING_QUERIES: readonly string[] = [
  // Big rounds — the dollar figure does the filtering. `lang:en` cuts ~40%
  // of low-precision matches without losing the US/EU deal flow.
  '("$100M" OR "$200M" OR "$500M" OR "$1B") (raised OR funding OR series) lang:en',

  // Series A / B — the round-type word + "raised" is enough; without "raised"
  // we'd catch retrospective commentary ("their Series A was…").
  '("series A" OR "series B") raised lang:en',

  // Seed rounds with "$X million" wording — covers both the first-time
  // founder announcements and YC-batch-day waves.
  '"seed round" "$" million raised lang:en',

  // Tagged announcements — lower precision but catches founders who use
  // the explicit hashtag (still common in pre-acquisition pitches).
  '#funding raised million lang:en',
];

// Reserved for future expansion. NOT shipped to the actor today; documented
// here so the operator can move queries from this list to the active list
// once per-run cost data is in.
export const EXTRA_QUERIES: readonly string[] = [
  '"pre-seed" raised lang:en',
  '"series C" raised million lang:en',
  '"series D" raised million lang:en',
];
