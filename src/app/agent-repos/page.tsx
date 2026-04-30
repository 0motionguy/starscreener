import type { Metadata } from "next";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";
import {
  AGENT_REPO_TARGET_COUNT,
  selectAgentRepos,
} from "@/lib/agent-repos";
import { getDerivedRepos } from "@/lib/derived-repos";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Agent Repos",
  description:
    "Top tracked AI agent runtimes, frameworks, orchestrators, and OpenClaw-like systems ranked by total GitHub stars.",
  alternates: { canonical: "/agent-repos" },
};

export default async function AgentReposPage() {
  const repos = selectAgentRepos(getDerivedRepos());

  const heading = (
    <section className="page-head">
      <div>
        <div className="crumb">
          <b>Trend terminal</b> / agent repos
        </div>
        <h1>Top agent runtimes and frameworks by stars.</h1>
        <p className="lede">
          Curated from GitHub agent searches and the OpenClaw ecosystem:
          runtimes, frameworks, orchestrators, and OpenClaw-like systems.
        </p>
      </div>
      <div className="clock">
        <span className="big">{repos.length}</span>
        <span className="live">of {AGENT_REPO_TARGET_COUNT} tracked</span>
      </div>
    </section>
  );

  return (
    <TerminalLayout
      repos={repos}
      className="home-surface terminal-page agent-repos-page"
      filterBarVariant="minimal"
      showFeatured={false}
      heading={heading}
      sortOverride={{ column: "stars", direction: "desc" }}
    />
  );
}
