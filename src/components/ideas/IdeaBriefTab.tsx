// IdeaBriefTab — 8 brief-block cards. Static templates for v1; the
// scaffold is identical to IdeaBriefModal so AI-generated content slots
// in by replacing the BLOCKS source in Phase 4C.

import type { IdeaRecord } from "@/lib/ideas";

interface IdeaBriefTabProps {
  idea: IdeaRecord;
}

interface Block {
  title: string;
  body: string;
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
      body: `Next.js + TS, hosting on Vercel or HOSTUP, Postgres for state, Clerk for auth. Reuse ${repo} as a dependency, no fork.`,
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
  return (
    <section
      className="tab-pane tab-brief"
      role="tabpanel"
      aria-labelledby="idea-tab-brief"
    >
      <p className="brief-note">
        Static template — Phase 4C will replace these blocks with AI-generated
        content.
      </p>
      <div className="brief-blocks brief-grid">
        {blocks.map((b) => (
          <article key={b.title} className="brief-block brief-card">
            <h3>{b.title}</h3>
            <p>{b.body}</p>
          </article>
        ))}
      </div>
      <div className="brief-actions">
        <button
          type="button"
          className="btn primary"
          disabled
          title="Coming soon — AI regeneration ships with Phase 4C."
        >
          Regenerate brief
        </button>
        <button
          type="button"
          className="btn"
          disabled
          title="Coming soon — POST /api/ideas/[id]/brief/save lands in Phase 4C."
        >
          Save brief
        </button>
        <a
          className="btn ghost"
          href={`/ideas/${idea.id}?tab=overview`}
          data-claim-from-brief
        >
          Claim idea
        </a>
        <button
          type="button"
          className="btn ghost"
          disabled
          title="Coming soon — repo attach UI ships with Phase 4D."
        >
          Attach repo
        </button>
      </div>
    </section>
  );
}
