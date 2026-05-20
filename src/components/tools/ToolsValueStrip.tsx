import { SectionEyebrow } from "./ToolCard";

const VALUES = [
  {
    title: "6-way compare",
    desc: "Pit 6 repos side-by-side instead of 2. Filter by language, sort by metric.",
    icon: "compare",
  },
  {
    title: "5-yr star history",
    desc: "Full historical depth from 2020 to today. Annotated breakout markers.",
    icon: "history",
  },
  {
    title: "RSS / Webhook / Slack",
    desc: "Subscribe to repo events and push them to your reader, Discord, or ops channel.",
    icon: "feed",
  },
  {
    title: "CSV / API access",
    desc: "Pull repos, mentions, funding rounds into your sheet or pipeline.",
    icon: "api",
  },
];

export function ToolsValueStrip() {
  return (
    <section>
      <SectionEyebrow
        num="05"
        title="What you unlock with PRO"
        meta="$19/mo - cancel anytime - 7-day free trial"
      />
      <div className="value-strip fade-up">
        {VALUES.map((value) => (
          <div className="value-cell" key={value.title}>
            <div className="v-icon">
              <ValueIcon kind={value.icon} />
            </div>
            <div className="v-title">{value.title}</div>
            <div className="v-desc">{value.desc}</div>
            <span className="v-tag">PRO</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ValueIcon({ kind }: { kind: string }) {
  if (kind === "history") {
    return (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M2 14L4 10L6 12L9 6L12 9L14 4" />
      </svg>
    );
  }
  if (kind === "feed") {
    return (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
        <path d="M5 8h6m-3-3v6" />
      </svg>
    );
  }
  if (kind === "api") {
    return (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <path d="M5 6h6m-6 3h6" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M8 14s-5-3.5-5-7a3 3 0 015-2 3 3 0 015 2c0 3.5-5 7-5 7z" />
    </svg>
  );
}
