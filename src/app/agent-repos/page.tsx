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
    <div className="px-4 sm:px-6 pt-6 pb-2">
      <span className="label-micro">Agent Repos</span>
      <h1 className="mt-2 font-display text-3xl font-bold text-text-primary md:text-4xl">
        Top agent runtimes and frameworks by total GitHub stars.
      </h1>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-text-secondary md:text-base">
        Curated from GitHub agent searches and the OpenClaw ecosystem. This
        board stays focused on runtimes, frameworks, orchestrators, and
        OpenClaw-like systems such as OpenClaw, Hermes, NanoClaw, and
        NemoClaw.
      </p>
      <p className="mt-1 text-xs text-text-muted">
        Tracking {repos.length} repos from a curated {AGENT_REPO_TARGET_COUNT}
        -repo list. Agent plugins, skills, tutorials, and awesome lists still
        remain in the general repo views.
      </p>
    </div>
  );

  return (
    <TerminalLayout
      repos={repos}
      filterBarVariant="minimal"
      showFeatured={false}
      heading={heading}
      sortOverride={{ column: "stars", direction: "desc" }}
    />
  );
}
