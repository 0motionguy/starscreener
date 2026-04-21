// TrendingRepo — Homepage Twitter card image.
// Uses the exact same renderer as opengraph-image so Twitter/X and
// Slack/iMessage previews stay identical. Next.js requires literal values
// for the runtime/size/contentType exports, so we redeclare rather than
// re-export via `export * from`.

import HomeOGImage from "./opengraph-image";

export const runtime = "nodejs";
export const alt = "TrendingRepo — The trend map for open source";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default HomeOGImage;
