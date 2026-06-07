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
// Operator can grow/shrink the list freely; schema is just a label -> URL map.
// Permanent HOSTUP-blocked feeds are not kept active. Retry is for intermittent
// upstream failures, not known 403 loops.

export const CRUNCHBASE_FEEDS: Record<string, string> = {
  // TechCrunch's "Venture" tag, narrower than /startups (covered by main
  // funding-news), nearly 100% funding-round headlines.
  'techcrunch-venture': 'https://techcrunch.com/category/venture/feed/',

  // Crunchbase News official editorial. The "venture" section is the most
  // funding-dense slice; "/sections/" feeds use a stable URL pattern.
  'crunchbase-venture': 'https://news.crunchbase.com/sections/venture/feed/',

  // Tech Funding News exclusively covers funding rounds. Smaller team, lower
  // volume, but high precision.
  'techfundingnews': 'https://techfundingnews.com/feed/',

  // AlleyWatch is NYC-startup-focused; its daily funding roundup is a useful
  // east-coast deal source.
  'alleywatch': 'https://www.alleywatch.com/feed/',

  // Crunchbase News startups section, broader than venture, catches some
  // pre-funding announcements that become signals once the round is disclosed.
  'crunchbase-startups': 'https://news.crunchbase.com/sections/startups/feed/',
};
