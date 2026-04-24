// TrendingRepo — /ideas/[slug]

import { notFound } from "next/navigation";
import Link from "next/link";
import { getBuilderStore } from "@/lib/builder/store";
import { ReactionsBar } from "@/components/builder/ReactionsBar";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = getBuilderStore();
  const idea = await store.getIdea(slug);
  if (!idea) return { title: "Idea not found · TrendingRepo" };
  return {
    title: `${idea.thesis.slice(0, 80)} · Idea`,
    description: idea.whyNow.slice(0, 200),
  };
}

export default async function IdeaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = getBuilderStore();
  const idea = await store.getIdea(slug);
  if (!idea || !idea.public) notFound();

  const [tally, sprints, author] = await Promise.all([
    store.getTally("idea", idea.slug),
    store.sprintsByIdea(idea.id),
    store.getBuilder(idea.authorBuilderId),
  ]);

  const stackGroups: Array<[string, string[]]> = [
    ["Models", idea.stack.models],
    ["APIs", idea.stack.apis],
    ["Tools", idea.stack.tools],
    ["Skills", idea.stack.skills],
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <Link
        href="/ideas"
        className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary hover:text-text-secondary"
      >
        ← ideas
      </Link>

      <article className="mt-3 rounded-card border border-border-primary bg-bg-card p-5 sm:p-6 shadow-card">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-text-tertiary">
          <span className="text-text-secondary">@{author?.handle ?? "builder"}</span>
          <span>·</span>
          <time dateTime={idea.createdAt}>
            {new Date(idea.createdAt).toLocaleDateString()}
          </time>
          <span>·</span>
          <span className="uppercase font-bold text-text-primary">
            {idea.phase}
          </span>
        </header>

        <h1 className="mt-3 text-xl sm:text-2xl font-semibold text-text-primary">
          {idea.thesis}
        </h1>

        <section className="mt-4">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
            Problem
          </h2>
          <p className="mt-1 text-sm text-text-secondary">{idea.problem}</p>
        </section>

        <section className="mt-4">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
            Why now
          </h2>
          <p className="mt-1 text-sm text-text-secondary">{idea.whyNow}</p>
        </section>

        <section className="mt-4">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
            Anchors
          </h2>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {idea.linkedRepoIds.map((r) => (
              <li key={r}>
                <Link
                  href={`/repo/${r}`}
                  className="inline-block rounded-badge bg-accent-green/10 px-2 py-0.5 font-mono text-xs text-accent-green hover:bg-accent-green/20"
                >
                  {r}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {stackGroups.some(([, arr]) => arr.length > 0) && (
          <section className="mt-4">
            <h2 className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
              Stack
            </h2>
            <dl className="mt-1 flex flex-col gap-1">
              {stackGroups.map(([label, arr]) =>
                arr.length === 0 ? null : (
                  <div
                    key={label}
                    className="flex flex-wrap items-baseline gap-2 font-mono text-xs"
                  >
                    <dt className="w-16 text-text-tertiary">{label}</dt>
                    <dd className="flex flex-wrap gap-1">
                      {arr.map((x) => (
                        <span
                          key={x}
                          className="rounded-badge bg-bg-secondary px-2 py-0.5 text-text-secondary"
                        >
                          {x}
                        </span>
                      ))}
                    </dd>
                  </div>
                ),
              )}
            </dl>
          </section>
        )}

        {idea.tags.length > 0 && (
          <section className="mt-4 flex flex-wrap gap-1">
            {idea.tags.map((t) => (
              <Link
                key={t}
                href={`/ideas?tag=${encodeURIComponent(t)}`}
                className="rounded-badge bg-bg-secondary px-2 py-0.5 font-mono text-[11px] text-text-tertiary hover:text-text-secondary"
              >
                #{t}
              </Link>
            ))}
          </section>
        )}

        <section className="mt-5 border-t border-border-primary pt-4">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary mb-2">
            Conviction
          </h2>
          <ReactionsBar
            subjectType="idea"
            subjectId={idea.slug}
            initialTally={tally}
          />
        </section>

        {idea.agentReadiness && idea.agentReadiness.length > 0 && (
          <section className="mt-5 border-t border-border-primary pt-4">
            <h2 className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary mb-2">
              Agent-ready sketch
            </h2>
            <ul className="flex flex-col gap-2">
              {idea.agentReadiness.map((a, idx) => (
                <li
                  key={idx}
                  className="rounded-card border border-border-primary bg-bg-secondary p-2 font-mono text-[11px] text-text-secondary"
                >
                  <div className="text-text-primary">{a.toolName}</div>
                  <div className="text-text-tertiary">in: {a.inputSketch}</div>
                  <div className="text-text-tertiary">out: {a.outputShape}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sprints.length > 0 && (
          <section className="mt-5 border-t border-border-primary pt-4">
            <h2 className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary mb-2">
              Sprints
            </h2>
            <ul className="flex flex-col gap-2">
              {sprints.map((sp) => (
                <li
                  key={sp.id}
                  className="rounded-card border border-border-primary bg-bg-secondary p-2 text-xs font-mono text-text-secondary"
                >
                  <span className="text-text-primary">
                    {new Date(sp.startsAt).toLocaleDateString()} →{" "}
                    {new Date(sp.endsAt).toLocaleDateString()}
                  </span>
                  <span className="ml-2 text-text-tertiary">
                    · {sp.actualCommits} commits · {sp.highlights.length} highlights
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}
