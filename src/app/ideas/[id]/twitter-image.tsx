// TrendingRepo — Idea Twitter share card.
//
// Same visual design as opengraph-image.tsx (re-uses the default
// export) but Next requires each metadata convention file to declare
// its own `runtime` / `alt` / `size` / `contentType` — re-exporting
// them triggers a compile-time warning that the fields aren't
// recognized. Declaring them inline is cheap.

import IdeaOGImage from "./opengraph-image";

export const runtime = "nodejs";
export const alt = "TrendingRepo — Builder idea card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default IdeaOGImage;
