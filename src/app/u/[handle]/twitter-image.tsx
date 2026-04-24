// TrendingRepo — Public user profile Twitter share card.
//
// Re-uses the default export from opengraph-image.tsx so X unfurls of a
// /u/[handle] URL feel identical to every other platform's unfurl. Next
// requires each metadata convention file to declare its own `runtime` /
// `alt` / `size` / `contentType`; re-exporting them triggers a warning
// so they're declared inline here.

import UserProfileOGImage from "./opengraph-image";

export const runtime = "nodejs";
export const alt = "TrendingRepo — Builder profile card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default UserProfileOGImage;
