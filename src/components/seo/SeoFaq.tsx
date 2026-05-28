// SeoFaq — server-rendered FAQ accordion for answer-surface pages (category
// hubs, best-of, comparisons). Native <details>/<summary> = zero client JS,
// full a11y, and the answer text lives in the DOM (crawlable + citable).
// Mirrors the markup + classes of RepoFaq (.pf-faq-*) so styling is shared
// with the repo detail page — no new CSS.
//
// The same FaqEntry[] should be passed to buildFaqJsonLd so the rendered
// text and the FAQPage schema match exactly.

import type { FaqEntry } from "@/lib/seo/structured-data";

interface SeoFaqProps {
  entries: FaqEntry[];
  title?: string;
  headingId?: string;
}

export function SeoFaq({
  entries,
  title = "FAQ",
  headingId = "seo-faq-head",
}: SeoFaqProps) {
  if (entries.length === 0) return null;
  return (
    <section className="card pf-card pf-faq" aria-labelledby={headingId}>
      <div className="card-head">
        <h2 className="card-title" id={headingId}>
          {"▌"} <b>{title}</b>
        </h2>
      </div>
      <div className="pf-faq-list">
        {entries.map((entry, idx) => (
          <details key={entry.q} className="pf-faq-item" open={idx === 0}>
            <summary className="pf-faq-q">{entry.q}</summary>
            <div className="pf-faq-a">{entry.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
