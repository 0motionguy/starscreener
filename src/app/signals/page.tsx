// TEMP minimal /signals page for Vercel 500 diagnostic. The full V3
// newsroom implementation is in git at commit 9b151b3a (and later); will
// restore as soon as we know whether the failure is in module-load (my
// imports) or layout/build.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SignalsPage() {
  return (
    <main style={{ padding: 24, fontFamily: "monospace", fontSize: 14 }}>
      <h1 style={{ color: "#ff6b35" }}>/signals minimal diagnostic</h1>
      <p>If you can read this on the Vercel preview, module-load is fine and</p>
      <p>the V3 newsroom failure is somewhere in the import / render tree.</p>
      <p>Built at: {new Date().toISOString()}</p>
    </main>
  );
}

// ---------------------------------------------------------------------------
// SectionHead — replaced by the V4 primitive at @/components/ui/SectionHead
// (same API). Kept as a comment trail so future edits remember this page
// previously had a private inline copy.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Build ticker — most-recent items across all sources, capped 24
// ---------------------------------------------------------------------------

function buildTickerItems(items: SignalItem[]): TickerItem[] {
  const SRC_LABEL: Record<SourceKey, string> = {
    hn: "HN",
    github: "GH",
    x: "X",
    reddit: "RDT",
    bluesky: "BSKY",
    devto: "DEV",
    claude: "CLA",
    openai: "OAI",
  };

  const byTime = items
    .filter((it) => it.postedAtMs > 0)
    .slice()
    .sort((a, b) => b.postedAtMs - a.postedAtMs)
    .slice(0, 24);

  return byTime.map((it) => ({
    source: it.source,
    label: SRC_LABEL[it.source],
    text: it.title.length > 80 ? it.title.slice(0, 77) + "…" : it.title,
    value: it.engagement > 0 ? `${shortNum(it.engagement)}↑` : "NEW",
    down: false,
  }));
}

function shortNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
