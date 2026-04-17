// StarScreener — Category detail Twitter card image.
// Delegates to the OG renderer so Twitter/X previews match Slack/iMessage.

import CategoryOGImage from "./opengraph-image";

export const runtime = "nodejs";
export const alt = "StarScreener — Category momentum card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default CategoryOGImage;
