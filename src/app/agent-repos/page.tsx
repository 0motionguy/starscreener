// /agent-repos — Top agent runtimes + frameworks by total stars.
// V2 design system.

import type { Metadata } from "next";
import {
  AGENT_REPO_TARGET_COUNT,
  selectAgentRepos,
} from "@/lib/agent-repos";
import { getDerivedRepos } from "@/lib/derived-repos";
import { TrendingTableV2 } from "@/components/today-v2/TrendingTableV2";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Agent Repos",
  description:
    "Top tracked AI agent runtimes, frameworks, orchestrators, and OpenClaw-like systems ranked by total GitHub stars.",
  alternates: { canonical: "/agent-repos" },
};

export default async function AgentReposPage() {
  const repos = selectAgentRepos(getDerivedRepos());

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <h1
            className="v2-mono mb-3 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-100)",
              fontSize: 12,
              letterSpacing: "0.20em",
            }}
          >
            <span aria-hidden>{"// "}</span>
            AGENT REPOS · RUNTIMES + FRAMEWORKS
            <span
              aria-hidden
              className="inline-block ml-1"
              style={{
                width: 6,
                height: 6,
                background: "var(--v2-acc)",
                borderRadius: 1,
                boxShadow: "0 0 6px var(--v2-acc-glow)",
              }}
            />
          </h1>
          <p
            className="text-[14px] leading-relaxed max-w-[80ch]"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Top agent runtimes, frameworks, orchestrators, and OpenClaw-
            like systems by total GitHub stars. Curated from GitHub agent
            searches and the OpenClaw ecosystem.
          </p>
          <p
            className="v2-mono mt-3"
            style={{ color: "var(--v2-ink-400)" }}
          >
            <span aria-hidden>{"// "}</span>
            TRACKING{" "}
            <span
              className="tabular-nums"
              style={{ color: "var(--v2-ink-100)" }}
            >
              {repos.length}
            </span>{" "}
            REPOS · CURATED LIST OF {AGENT_REPO_TARGET_COUNT}
          </p>
        </div>
      </section>

      <TrendingTableV2
        repos={repos}
        limit={AGENT_REPO_TARGET_COUNT}
        sortBy="stars"
      />
    </>
  );
}
