// TrendingRepo — Collection detail Twitter share card.
//
// Reuses the default export from opengraph-image.tsx so Twitter/X unfurls
// share the exact composition we send to Slack/iMessage/Discord. Next
// requires each metadata convention file to declare its own `runtime` /
// `alt` / `size` / `contentType`; re-exporting them triggers a warning so
// they're declared inline here.

import CollectionOGImage from "./opengraph-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Collection card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default CollectionOGImage;
