// DropPromotionRules — sidebar card listing what gets promoted vs. what
// doesn't. Mirrors `06-drop-repo.html`'s "What gets promoted" panel
// (5 do-rules + 2 don't-rules).

const DO_RULES: ReadonlyArray<{ head: string; tail: string }> = [
  { head: "Real, working repo", tail: " — not vapor, not a fork" },
  { head: "AI / dev-tools / agents / MCP / skills", tail: " — our beat" },
  { head: "README + LICENSE", tail: " — table stakes" },
  { head: "≥10 stars", tail: " OR ≥1 cross-source mention" },
  { head: "Open-source license", tail: " (OSI-approved)" },
];

const DONT_RULES: ReadonlyArray<string> = [
  "No spam, no SEO link farms, no AI-generated repo dumps",
  "No 'Awesome list' mirrors without commentary",
];

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--up)" strokeWidth="2">
      <path d="M3 8l3 3 7-7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--down)" strokeWidth="2">
      <path d="M4 4l8 8M12 4L4 12" />
    </svg>
  );
}

export function DropPromotionRules() {
  return (
    <div className="card" data-component="drop-rules">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>What gets promoted</b>
        </h2>
      </div>
      <div
        style={{
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          fontSize: 12,
          color: "var(--fg-muted)",
          lineHeight: 1.55,
        }}
      >
        {DO_RULES.map((r) => (
          <div className="row gap-2" key={r.head} style={{ alignItems: "flex-start" }}>
            <CheckIcon />
            <span>
              <b style={{ color: "var(--fg)" }}>{r.head}</b>
              {r.tail}
            </span>
          </div>
        ))}
        <div className="divider" style={{ margin: "4px 0" }}></div>
        {DONT_RULES.map((line) => (
          <div className="row gap-2" key={line} style={{ alignItems: "flex-start" }}>
            <XIcon />
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
