// TrendingRepo — Cross-Signal Breakouts Twitter share card.
//
// Delegates to the OG image composition so X unfurls of /breakouts match
// Slack/iMessage/Discord. Next requires each metadata convention file to
// declare its own `runtime` / `alt` / `size` / `contentType`; re-exporting
// them triggers a warning so they're declared inline here.

import BreakoutsOGImage from "./opengraph-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Cross-Signal Breakouts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default BreakoutsOGImage;
