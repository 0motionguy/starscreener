// Lightweight route constants for client chrome.
// Keep this separate from constants.ts so Header/Search/MobileNav do not pull
// the full category metadata table into their bundles just to navigate.

export const ROUTES = {
  HOME: "/",
  // Homepage is the trending terminal now; no separate /trending route.
  TRENDING: "/",
  REPO: (id: string) => `/repo/${id}`,
  CATEGORY: (id: string) => `/category/${id}`,
  COMPARE: "/compare",
  WATCHLIST: "/watchlist",
  SEARCH: "/search",
  SUBMIT: "/submit",
  REDDIT: "/reddit",
  REDDIT_TRENDING: "/reddit/trending",
  BLUESKY: "/bluesky",
  BLUESKY_TRENDING: "/bluesky/trending",
} as const;
