// Crunchbase + venture-tag RSS feed list for the crunchbase fetcher.
//
// The main funding-news fetcher already covers TechCrunch /startups, VentureBeat,
// Sifted, Tech.eu, Pymnts, Ars, BBC, Wired (general). This list is the
// non-overlapping set of higher-signal funding-specific feeds we layer on top
// for Phase 3.4 source coverage.
//
// Selection criteria:
//   - Public, no-auth RSS endpoint
//   - High proportion of funding announcements (signal-to-noise > the general
//     tech feeds in funding-news/index.ts)
//   - Editorially curated (not just keyword-aggregator spam)
//   - Doesn't duplicate any URL from the main funding-news RSS_FEEDS map
//
// Operator can grow/shrink the list freely — schema is just a label -> URL map.
// Bumping this from 4-6 to ~10 sources is fine; the fetcher already handles
// per-feed retry + skip-on-failure so a flaky source can't blank the slug.

export const CRUNCHBASE_FEEDS: Record<string, string> = {
  // TechCrunch's "Venture" tag — narrower than /startups (covered by main
  // funding-news), nearly 100% funding-round headlines.
  'techcrunch-venture': 'https://techcrunch.com/category/venture/feed/',

  // Crunchbase News — official Crunchbase editorial. The "venture" section
  // is the most funding-dense slice; "/sections/" feeds use a stable URL
  // pattern that's been live since 2019.
  'crunchbase-venture': 'https://news.crunchbase.com/sections/venture/feed/',

  // Tech Funding News — niche outlet that exclusively covers funding rounds.
  // Smaller team, lower volume, but high precision (no consumer / launch /
  // acquisition fluff that pollutes the general tech feeds).
  'techfundingnews': 'https://techfundingnews.com/feed/',

  // AlleyWatch — NYC-startup-focused; daily funding roundup post is the
  // canonical "what closed today" source for east-coast deals.
  'alleywatch': 'https://www.alleywatch.com/feed/',

  // FinSMEs — global daily funding briefing. Format is consistent
  // "<Company> Raises $XM in Series Y" so the regex extractor lands cleanly.
  'finsmes': 'https://www.finsmes.com/feed',

  // Crunchbase News startups section — broader than venture, catches some
  // pre-funding announcements (product launches, hiring, acquihires) that
  // become funding signals once the round is disclosed.
  'crunchbase-startups': 'https://news.crunchbase.com/sections/startups/feed/',
};
