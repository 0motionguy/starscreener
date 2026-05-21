// IdeaBriefTab — 8 deterministic brief-block cards.

import type { IdeaRecord } from "@/lib/ideas";

import { IdeaBriefActions } from "./IdeaBriefActions";

interface IdeaBriefTabProps {
  idea: IdeaRecord;
}

interface Block {
  title: string;
  body: string;
}

function blocksToMarkdown(blocks: Block[]): string {
  // Stitch the static template into markdown so the first Save lands a
  // real payload (not empty). Future Phase-4C work replaces this with the
  // editor's live buffer; the route schema (.min(1)) is the gate.
  return blocks.map((b) => `## ${b.title}\n\n${b.body}`).join("\n\n");
}

function blocksFor(idea: IdeaRecord): Block[] {
  const repo = idea.targetRepos[0] ?? "the trending repo";
  return [
    {
      title: "Problem",
      body: `Users following ${repo} hit friction the moment they try to apply the trend to their own workflow. ${idea.pitch}`,
    },
    {
      title: "Audience",
      body: `Indie hackers + small dev teams already tracking ${repo}. They have intent but not the patience to plumb config + auth + storage.`,
    },
    {
      title: "Outcome",
      body: "Bring time-to-first-value from hours to under five minutes with sensible defaults and a one-click deploy path.",
    },
    {
      title: "MVP scope",
      body: "1) one-click deploy, 2) opinionated config schema, 3) example dataset/seed, 4) a 90-second demo + docs.",
    },
    {
      title: "Tech stack",
      body: `Next.js + TS, HOSTUP or self-hosted runtime, Postgres for state, Clerk for auth. Reuse ${repo} as a dependency, no fork.`,
    },
    {
      title: "Distribution",
      body: `Post on the ${repo} Discord/GitHub Discussions, Hacker News Show HN, plus a Twitter/X thread tagged with the upstream handle.`,
    },
    {
      title: "Risks",
      body: "Upstream breaking changes; license edge cases; users wanting features that conflict with the simplicity of the starter.",
    },
    {
      title: "Success signals",
      body: "≥ 50 deploys in week 1, ≥ 10 GitHub stars on the starter repo, ≥ 1 upstream PR linking back to it.",
    },
  ];
}

export function IdeaBriefTab({ idea }: IdeaBriefTabProps) {
  const blocks = blocksFor(idea);
  // Prefer the persisted markdown when present; otherwise stitch the
  // static template so the Save endpoint receives a non-empty payload on
  // first commit. Once the editor lands, this stitch is replaced by the
  // live editor buffer round-tripped from the actions island.
  const briefMarkdown = idea.briefMarkdown ?? blocksToMarkdown(blocks);
  return (
    <section
      className="tab-pane tab-brief"
      role="tabpanel"
      aria-labelledby="idea-tab-brief"
    >
      <p className="brief-note">
        {idea.briefMarkdown
          ? "Saved brief — Regenerate calls the LLM, Save persists edits."
          : "Static template — Save to persist, or Regenerate once the LLM client lands."}
      </p>
      <div className="brief-blocks brief-grid">
        {blocks.map((b) => (
          <article key={b.title} className="brief-block brief-card">
            <h3>{b.title}</h3>
            <p>{b.body}</p>
          </article>
        ))}
      </div>
      <IdeaBriefActions
        ideaId={idea.id}
        briefMarkdown={briefMarkdown}
        briefVersion={idea.briefVersion}
      />
    </section>
  );
}
