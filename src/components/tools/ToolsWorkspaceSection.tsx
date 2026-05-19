import { SectionEyebrow, ToolCard } from "./ToolCard";
import type { ToolsFilter } from "./ToolsHubHero";

interface ToolsWorkspaceSectionProps {
  filter: ToolsFilter;
  top10Archived: number;
  top10TodayExists: boolean;
  digestIssues: number;
}

export function ToolsWorkspaceSection({
  filter,
  top10Archived,
  top10TodayExists,
  digestIssues,
}: ToolsWorkspaceSectionProps) {
  if (filter !== "all" && filter !== "charts") return null;

  return (
    <section>
      <SectionEyebrow
        num="02"
        title="Workspace"
        meta={`${digestIssues.toLocaleString()} digest editions`}
      />
      <div className="g-3">
        <ToolCard
          number="04"
          route="#watchlist"
          routeLabel="WATCH"
          title="Watchlist"
          description="Private repo tracking rehydrates from account state when signed in."
          footMeta="account scoped"
        >
          <MiniRows rows={["vercel/next.js", "openai/codex", "modelcontextprotocol/servers"]} />
        </ToolCard>
        <ToolCard
          number="05"
          route="#top10"
          routeLabel="RANK"
          title="Top 10 Snapshot"
          description="Archived daily snapshots for shareable repo rankings."
          footMeta={`${top10Archived.toLocaleString()} archived`}
        >
          <MiniRows
            rows={[
              top10TodayExists ? "today captured" : "today pending",
              "daily archive",
              "share cards",
            ]}
          />
        </ToolCard>
        <ToolCard
          number="06"
          route="#digest"
          routeLabel="DIGEST"
          title="Weekly Digest"
          description="Operator-ready issue history for what moved this week."
          footMeta={`${digestIssues.toLocaleString()} issues`}
        >
          <MiniRows rows={["breakouts", "funding", "agent commerce"]} />
        </ToolCard>
      </div>
    </section>
  );
}

function MiniRows({ rows }: { rows: string[] }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {rows.map((row, index) => (
        <span
          key={row}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 8px",
            background: "var(--surface-3)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg)",
          }}
        >
          <b>{String(index + 1).padStart(2, "0")}</b>
          {row}
        </span>
      ))}
    </div>
  );
}
