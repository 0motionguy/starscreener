import type { LogoAsset } from './types.js';
import { getVendor } from './vendor-catalog.js';

// Resolution order:
//   1. simple-icons CDN if vendor has a slug   → cdn.simpleicons.org/<slug>/<color>
//   2. fallback_logo_url declared in catalog
//   3. null (caller decides whether to scrape favicon — out of scope here)

const SIMPLE_ICONS_CDN = 'https://cdn.simpleicons.org';

export function resolveLogo(vendorSlug: string | null): LogoAsset | null {
  if (!vendorSlug) return null;
  const entry = getVendor(vendorSlug);
  if (!entry) return null;

  if (entry.simple_icons_slug) {
    return {
      url: `${SIMPLE_ICONS_CDN}/${entry.simple_icons_slug}/${entry.brand_color}`,
      brand_color: entry.brand_color,
      simple_icons_slug: entry.simple_icons_slug,
      source: 'simple-icons',
    };
  }

  if (entry.fallback_logo_url) {
    return {
      url: entry.fallback_logo_url,
      brand_color: entry.brand_color,
      simple_icons_slug: null,
      source: 'fallback',
    };
  }

  return null;
}
