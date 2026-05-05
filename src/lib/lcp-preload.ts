import { preload } from "react-dom";

interface PreloadImageOptions {
  limit?: number;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

// Emits <link rel="preload" as="image"> tags for the first route-level
// image candidates likely to appear above the fold.
export function preloadTopLcpImages(
  imageUrls: Array<string | null | undefined>,
  options: PreloadImageOptions = {},
): void {
  const limit = Math.max(1, options.limit ?? 3);
  const seen = new Set<string>();
  let emitted = 0;

  for (const candidate of imageUrls) {
    if (!candidate || !isHttpUrl(candidate)) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    preload(candidate, { as: "image", fetchPriority: "high" });
    emitted += 1;
    if (emitted >= limit) break;
  }
}
