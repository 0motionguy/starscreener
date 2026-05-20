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
  if (filter !== "all") return null;

  return (
    <section>
      <SectionEyebrow
        num="02"
        title="Workspace"
        meta={<><b>5</b> personal tools - save - track - compare - rank - export</>}
      />
      <div className="tool-grid fade-up">
        <ToolCard
          number="01"
          route="/tools/watchlist"
          routeLabel="WATCH"
          title="Watchlist"
          description="Pin repos to track stars, mentions, and breakouts in one place."
          footMeta="Local-only pins - sync via /sign-in"
        >
          <div className="pv-watch">
            {[
              ["cline/cline", "+1.2K"],
              ["vercel/ai-sdk", "+412"],
              ["openai/codex", "+89"],
              ["huggingface/smolagents", "+76"],
            ].map(([repo, delta]) => (
              <div className="row" key={repo}>
                <span className="h">*</span>
                <span className="n">{repo}</span>
                <span className="b">{delta} up</span>
              </div>
            ))}
          </div>
        </ToolCard>

        <ToolCard
          number="02"
          route="/tools/compare"
          routeLabel="COMPARE"
          title="Compare"
          description={
            <>
              Head-to-head: stars, mentions, contributors, npm adoption, funding
              events. <b>2 free</b> - 6-way with PRO.
            </>
          }
          footMeta={<>2-way free - 6-way <span className="pro-tag">PRO</span></>}
        >
          <div className="pv-compare">
            <div className="col">
              <span className="h">vercel/next.js</span>
              <span className="v">135K</span>
              <span className="d">+1.2K 24h</span>
            </div>
            <div className="col">
              <span className="h">remix-run/remix</span>
              <span className="v">29K</span>
              <span className="d">+128 24h</span>
            </div>
          </div>
        </ToolCard>

        <ToolCard
          number="03"
          route="/tools/tier-list"
          routeLabel="RANK"
          title="Tier List"
          description="Drag-rank trending repos into S/A/B/C/D tiers. Share with a shortlink; community comments and reactions included."
          footMeta="Top 50 ranked - S to D tiers - seed deep-link"
        >
          <div className="pv-tier">
            <TierRow tier="S" count={3} />
            <TierRow tier="A" count={4} />
            <TierRow tier="B" count={2} />
            <TierRow tier="C" count={1} />
          </div>
        </ToolCard>

        <ToolCard
          number="04"
          route="/tools/top-10"
          routeLabel="SNAPSHOT"
          title="Top 10"
          description={
            <>
              Daily ranked snapshot of the AI repo desk: exportable PNG with
              sparkline overlays. <b>Auto-archived</b>.
            </>
          }
          footMeta={`${top10Archived.toLocaleString()} daily snapshots archived`}
        >
          <div className="pv-top10">
            {[
              ["1", "cline/cline", "+1.2K"],
              ["2", "vercel/ai-sdk", "+412"],
              ["3", "huggingface/smolagents", "+76"],
              ["4", top10TodayExists ? "modelcontextprotocol/servers" : "openai/codex", "+58"],
            ].map(([rank, name, delta]) => (
              <div className="item" key={rank}>
                <span className="r">{rank}</span>
                <span className="n">{name}</span>
                <span className="v">{delta}</span>
              </div>
            ))}
          </div>
        </ToolCard>

        <ToolCard
          number="05"
          route="/tools/digest"
          routeLabel="EMAIL"
          title="Weekly Digest"
          description="Tuesday email: top breakouts, funding rounds, cross-source mentions, agent commerce movers."
          footMeta={`${digestIssues.toLocaleString()} issues`}
        >
          <div className="pv-digest">
            <div className="h">{"// THIS WEEK - 5 BREAKOUTS"}</div>
            <div className="l l1" />
            <div className="l l2" />
            <div className="l l3" />
            <div className="l l1" />
          </div>
        </ToolCard>
      </div>
    </section>
  );
}

function TierRow({ tier, count }: { tier: "S" | "A" | "B" | "C"; count: number }) {
  return (
    <div className="row">
      <span className={`l ${tier}`}>{tier}</span>
      {Array.from({ length: count }).map((_, index) => (
        <span className="dot" key={index} />
      ))}
    </div>
  );
}
