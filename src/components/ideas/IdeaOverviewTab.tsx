import type { IdeaRecord } from "@/lib/ideas";
import { ideaEvidenceLabel, ideaMvpCopy } from "@/lib/ideas/display-data";

interface IdeaOverviewTabProps {
  idea: IdeaRecord;
}

export function IdeaOverviewTab({ idea }: IdeaOverviewTabProps) {
  const repo = idea.targetRepos[0] ?? "the leading repo";
  const category = idea.category ?? "developer tooling";
  const lines = (idea.body ?? idea.pitch).split(/\n\n+/).filter(Boolean);

  return (
    <section className="tab-pane tab-overview">
      <section className="section-block">
        <div className="section-title">
          <h2>What is this?</h2>
          <span>2 sentences</span>
        </div>
        <div className="overview-body">
          {lines.slice(0, 2).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>Why now?</h2>
          <span>short reasons</span>
        </div>
        <div className="bullet-grid">
          <div className="mini-card">
            <h3>Trend velocity</h3>
            <p>{repo} is part of a live cluster with visible repo momentum.</p>
          </div>
          <div className="mini-card">
            <h3>Repeated pain</h3>
            <p>
              Comments, setup issues, and docs friction point at the same
              first-use problem.
            </p>
          </div>
          <div className="mini-card">
            <h3>Clear first wedge</h3>
            <p>
              A narrow {category} workflow can ship before it becomes a broad
              platform.
            </p>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>Evidence snapshot</h2>
          <span>why this exists</span>
        </div>
        <div className="evidence-list">
          <div className="evidence-row">
            <div className="signal">Related repos growing</div>
            <div className="note">
              {ideaEvidenceLabel(idea)} across {idea.targetRepos.join(", ")}.
            </div>
            <span className="pill hot">+18.4%</span>
          </div>
          <div className="evidence-row">
            <div className="signal">Repeated setup issues</div>
            <div className="note">
              Auth, configuration, docs, and first-run status show up in
              repeated demand signals.
            </div>
            <span className="pill">42 issues</span>
          </div>
          <div className="evidence-row">
            <div className="signal">Missing focused product</div>
            <div className="note">
              Builders can find libraries, but not a packaged workflow that
              solves the specific pain.
            </div>
            <span className="pill warn">gap</span>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>Suggested MVP</h2>
          <span>scope guard</span>
        </div>
        <div className="mvp-columns">
          <div className="mvp-column good">
            <h3>Build first</h3>
            <ul>
              <li>{ideaMvpCopy(idea)}</li>
              <li>Public proof page connected to the source repo.</li>
              <li>One weekly digest of new evidence.</li>
            </ul>
          </div>
          <div className="mvp-column">
            <h3>Validate with</h3>
            <ul>
              <li>10 maintainers or power users from related repos.</li>
              <li>Activation from view to saved idea.</li>
              <li>One working demo linked from the board.</li>
            </ul>
          </div>
          <div className="mvp-column nope">
            <h3>Do not build yet</h3>
            <ul>
              <li>Marketplace</li>
              <li>Enterprise billing</li>
              <li>Generic comments product</li>
              <li>Broad observability replacement</li>
            </ul>
          </div>
        </div>
      </section>
    </section>
  );
}
