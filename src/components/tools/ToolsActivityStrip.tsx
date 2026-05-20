import { SectionEyebrow } from "./ToolCard";

interface ActivityRow {
  repo: string;
  ago: string;
  label?: string;
  hover?: string;
}

const ACTIVITY_GROUPS: Array<{ eyebrow: string; rows: ActivityRow[] }> = [
  {
    eyebrow: "Watchlist - triggered",
    rows: [
      { repo: "cline/cline", label: "* +14% in 24h", ago: "02:14", hover: "cline/cline" },
      { repo: "vercel/next.js", label: "new release v15.3", ago: "04:32", hover: "vercel/next.js" },
      { repo: "openai/whisper", label: "breakout - 6 mention sources", ago: "12:18", hover: "openai/whisper" },
    ],
  },
  {
    eyebrow: "Compares - saved",
    rows: [
      { repo: "next.js vs remix vs sveltekit", ago: "03:51" },
      { repo: "cline vs aider vs continue", ago: "11:22" },
      { repo: "langchain vs llamaindex", ago: "yesterday" },
    ],
  },
  {
    eyebrow: "Tier lists - published",
    rows: [
      { repo: "\"AI coding agents - S-tier\"", label: "412 views", ago: "2d" },
      { repo: "\"MCP servers - my picks\"", label: "128 views", ago: "4d" },
      { repo: "\"LLM inference engines\"", label: "76 views", ago: "1w" },
    ],
  },
];

export function ToolsActivityStrip() {
  return (
    <section>
      <SectionEyebrow
        num="04"
        title="Recent activity - yours"
        meta={<>Last 24h - <b>11</b> events</>}
      />
      <div className="activity fade-up">
        {ACTIVITY_GROUPS.map((group) => (
          <div className="act-card" key={group.eyebrow}>
            <div className="ac-eyebrow">| {group.eyebrow}</div>
            <div className="ac-list">
              {group.rows.map((row) => (
                <div className="ac-row" key={`${group.eyebrow}-${row.repo}`}>
                  <span
                    className="repo"
                    {...(row.hover ? { "data-repo-hover": true, "data-repo": row.hover } : {})}
                  >
                    {row.repo}
                  </span>
                  {row.label ? <span className="lbl">{row.label}</span> : null}
                  <span className="ago">{row.ago}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
