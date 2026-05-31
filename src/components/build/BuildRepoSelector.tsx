// BuildRepoSelector - 2-column connection and selected-repo panel.

import Link from "next/link";

import { AuthGateButton } from "@/components/auth/AuthGateButton";
import type { Repo } from "@/lib/types";

interface BuildRepoSelectorProps {
  selectedRepo: Repo | null;
  trackedRepos: Pick<Repo, "fullName" | "owner" | "name">[];
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function ageHours(iso: string | null): string {
  if (!iso) return "-";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "-";
  const ageMs = Date.now() - ts;
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  if (hours < 1) return `${Math.max(1, Math.floor(ageMs / (60 * 1000)))}m`;
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function visibilityScore(stars: number): number {
  if (stars >= 100_000) return 100;
  if (stars >= 10_000) {
    return 80 + Math.min(20, Math.floor((stars - 10_000) / 4_500));
  }
  if (stars >= 1_000) return 55 + Math.floor((stars - 1_000) / 200);
  if (stars >= 100) return 25 + Math.floor((stars - 100) / 40);
  return Math.max(5, Math.floor(stars / 5));
}

function buildMomentum(repo: Repo): number {
  return Math.round(repo.momentumScore ?? 0);
}

function launchReadiness(repo: Repo): number {
  const momentum = repo.momentumScore ?? 0;
  const contribBoost = Math.min(20, Math.floor((repo.contributors ?? 0) / 10));
  const releaseBoost = repo.lastReleaseAt ? 10 : 0;
  const score = Math.round(momentum * 0.6 + contribBoost + releaseBoost);
  return Math.max(0, Math.min(100, score));
}

function repoMark(fullName: string): string {
  const [owner = "", name = ""] = fullName.split("/");
  return (
    (owner[0] ?? "?").toUpperCase() + (name[0] ?? "?").toUpperCase()
  ).slice(0, 2);
}

export function BuildRepoSelector({
  selectedRepo,
  trackedRepos,
}: BuildRepoSelectorProps) {
  const visibility = selectedRepo ? visibilityScore(selectedRepo.stars) : 0;
  const momentum = selectedRepo ? buildMomentum(selectedRepo) : 0;
  const readiness = selectedRepo ? launchReadiness(selectedRepo) : 0;

  return (
    <section className="panel" id="repo-selector">
      <div className="panel-head">
        <h2>Repo selector / connection state</h2>
        <span className="meta">approval based</span>
      </div>
      <div className="connection-grid">
        <div className="connect-state">
          <div className="gh-row">
            <div className="gh-mark">GH</div>
            <div>
              <h3>Connect a repo to start</h3>
              <p>
                TrendingRepo suggests updates. Nothing is published without
                approval.
              </p>
            </div>
          </div>
          <div className="permission-list">
            <span>Read public repo metadata and releases</span>
            <span>Read merged PRs, issues, contributors, and milestones</span>
            <span>Detect star spikes and documentation changes</span>
            <span>No write access required for review-only mode</span>
          </div>
          <AuthGateButton
            className="btn primary"
            redirectUrl="/build"
            authenticatedHref="/build"
          >
            Sign in with GitHub
          </AuthGateButton>
        </div>

        {selectedRepo ? (
          <div className="repo-state">
            <div className="repo-head">
              <div className="repo-mark">{repoMark(selectedRepo.fullName)}</div>
              <div>
                <h3>{selectedRepo.fullName}</h3>
                <p>{selectedRepo.description || "No description set."}</p>
              </div>
              <Link className="tiny-btn" href="/build">
                Change
              </Link>
            </div>
            <div className="score-grid">
              <div className="score-cell">
                <div className="label">Stars</div>
                <div className="value">{formatStars(selectedRepo.stars)}</div>
              </div>
              <div className="score-cell">
                <div className="label">Contributors</div>
                <div className="value">{selectedRepo.contributors}</div>
              </div>
              <div className="score-cell">
                <div className="label">Last activity</div>
                <div className="value">{ageHours(selectedRepo.lastCommitAt)}</div>
              </div>
              <div className={`score-cell${visibility >= 80 ? " hot" : ""}`}>
                <div className="label">Visibility score</div>
                <div className="value">{visibility}</div>
              </div>
              <div className="score-cell">
                <div className="label">Build momentum</div>
                <div className="value">{momentum}</div>
              </div>
              <div className={`score-cell${readiness >= 80 ? " hot" : ""}`}>
                <div className="label">Launch readiness</div>
                <div className="value">{readiness}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="repo-state">
            <div className="repo-head">
              <div className="repo-mark">TR</div>
              <div>
                <h3>Select tracked repo</h3>
                <p>Pick a tracked repo to inspect build signals.</p>
              </div>
            </div>
            <form method="GET" action="/build">
              <label className="field-label">
                Tracked repo
                <select className="field" name="repo" defaultValue="">
                  <option value="" disabled>
                    Choose a repo
                  </option>
                  {trackedRepos.slice(0, 200).map((r) => (
                    <option key={r.fullName} value={r.fullName}>
                      {r.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="review-actions">
                <button className="btn primary" type="submit">
                  Open repo workspace
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
