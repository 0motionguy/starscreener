// RepoEditorialOverview — the LLM-written "what this repo is" card for a
// freshly-dropped repo. Written by the worker drop-deep-enrich-drain and read
// via src/lib/repo-editorial-store.ts. Only rendered when an overview exists
// (i.e. the repo came through /drop deep-enrich); most repos rely on the richer
// RepoSignalSummary verdict instead. Tokens-only, no inline hex.

import type { RepoEditorial } from "@/lib/repo-editorial-store";

export function RepoEditorialOverview({
  editorial,
}: {
  editorial: RepoEditorial;
}) {
  return (
    <section className="card" aria-labelledby="repo-editorial-heading">
      <div className="card-head">
        <h2 className="card-title" id="repo-editorial-heading">
          <b>{"// WHAT IT IS"}</b>
          {editorial.tagline ? ` · ${editorial.tagline}` : ""}
        </h2>
        <span className="grow" />
        <a
          className="muted"
          href="https://aiso.tools"
          target="_blank"
          rel="noopener noreferrer"
        >
          AISO overview
        </a>
      </div>
      <p className="feat-desc">{editorial.overview}</p>
    </section>
  );
}
