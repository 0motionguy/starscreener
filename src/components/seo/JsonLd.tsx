// JsonLd — single canonical way to inject a schema.org graph into a page.
// Serializes with safeJsonLd (escapes </script>, U+2028/9) so a future
// caller piping user-derived strings can't introduce XSS. Renders nothing
// when `data` is null/undefined so callers can pass a conditionally-built
// graph (honesty rule: no empty FAQPage etc.).

import { safeJsonLd } from "@/lib/seo";

export function JsonLd({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }}
    />
  );
}
