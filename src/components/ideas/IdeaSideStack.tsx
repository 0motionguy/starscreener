// IdeaSideStack — sticky right rail on /ideas/[id]. Pixel-faithful to
// ideas-detail.html:1317-1356. 11-fact list + 4 side actions + claimed
// box + progress line.
//
// Facts in mockup order: Status / Category / Signal strength / Evidence /
// Difficulty / MVP estimate / Launch potential / Would build / Would use /
// Saved / Related trend. `difficulty`, `mvpEstimate`, and `launchPotential`
// are author-set optional fields on IdeaRecord — present rows display the
// formatted enum, absent rows fall back to em-dash. `saved` is still
// per-user state with no backing store yet (TODO: requires saved_ideas
// join — Phase 4D). Counts that are derivable (signal strength from
// reactions, "would build" = counts.build, "would use" = counts.use)
// come from the live reactions tally.

import type {
  IdeaDifficulty,
  IdeaLaunchPotential,
  IdeaMvpEstimate,
  IdeaRecord,
} from "@/lib/ideas";
import { ideaEvidenceLabel } from "@/lib/ideas/display-data";
import type { ReactionCounts } from "@/lib/reactions-shape";

import { IdeaClaimedBox } from "./IdeaClaimedBox";
import { IdeaHeroActions } from "./IdeaHeroActions";
import { IdeaProgressLine } from "./IdeaProgressLine";

interface IdeaSideStackProps {
  idea: IdeaRecord;
  counts: ReactionCounts;
  signedIn: boolean;
}

function statusLabel(status: IdeaRecord["status"]): string {
  switch (status) {
    case "published":
      return "Open";
    case "shipped":
      return "Shipped";
    case "archived":
      return "Archived";
    case "pending_moderation":
      return "Pending";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

function signalStrengthLabel(counts: ReactionCounts): string {
  const total = counts.build + counts.use + counts.buy + counts.invest;
  if (total >= 50) return "Strong";
  if (total >= 10) return "Warm";
  if (total >= 1) return "Early";
  return "—";
}

function evidenceLabel(idea: IdeaRecord): string {
  const repos = idea.targetRepos.length;
  if (repos === 0) return "—";
  return `${repos} repo${repos === 1 ? "" : "s"}`;
}

// Em-dash fallback for the 3 workspace-fact enums. Absent fields on
// pre-existing JSONL rows render as em-dash; present rows show a
// human-formatted label (capitalized for difficulty / launch potential,
// raw for mvp estimate since "1-2 weeks" / "month+" are already display-
// ready).
function difficultyLabel(value: IdeaDifficulty | undefined): string {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function mvpEstimateLabel(value: IdeaMvpEstimate | undefined): string {
  return value ?? "—";
}

function launchPotentialLabel(value: IdeaLaunchPotential | undefined): string {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function IdeaSideStack({
  idea,
  counts,
  signedIn,
}: IdeaSideStackProps) {
  return (
    <aside className="idea-side side-stack">
      <section className="idea-side-card side-card">
        <h3>Workspace facts</h3>
        <div className="side-facts side-list">
          <div className="fact-row side-row">
            <span className="fact-label">Status</span>
            <b className="fact-value" data-side-status>
              {statusLabel(idea.status)}
            </b>
          </div>
          <div className="fact-row side-row">
            <span className="fact-label">Category</span>
            <b className="fact-value">{idea.category ?? "—"}</b>
          </div>
          <div className="fact-row side-row">
            <span className="fact-label">Signal strength</span>
            <b className="fact-value">{signalStrengthLabel(counts)}</b>
          </div>
          <div className="fact-row side-row">
            <span className="fact-label">Evidence</span>
            <b className="fact-value">{evidenceLabel(idea)}</b>
          </div>
          <div className="fact-row side-row">
            <span className="fact-label">Difficulty</span>
            <b className="fact-value">{difficultyLabel(idea.difficulty)}</b>
          </div>
          <div className="fact-row side-row">
            <span className="fact-label">MVP estimate</span>
            <b className="fact-value">{mvpEstimateLabel(idea.mvpEstimate)}</b>
          </div>
          <div className="fact-row side-row">
            <span className="fact-label">Launch potential</span>
            <b className="fact-value">
              {launchPotentialLabel(idea.launchPotential)}
            </b>
          </div>
          <div className="fact-row side-row">
            <span className="fact-label">Would build</span>
            <b className="fact-value">{counts.build || "—"}</b>
          </div>
          <div className="fact-row side-row">
            <span className="fact-label">Would use</span>
            <b className="fact-value">{counts.use || "—"}</b>
          </div>
          <div className="fact-row side-row">
            <span className="fact-label">Saved</span>
            {/* TODO: requires saved_ideas join — Phase 4D. `saved` is per-user
                state and doesn't belong on the global IdeaRecord. */}
            <b className="fact-value">—</b>
          </div>
          <div className="fact-row side-row">
            <span className="fact-label">Related trend</span>
            <b className="fact-value">
              {idea.tags[0] ?? "—"}
            </b>
          </div>
        </div>
        <IdeaHeroActions
          ideaId={idea.id}
          signedIn={signedIn}
          placement="side"
          claimedBy={idea.claimedBy}
        />
      </section>

      <section className="idea-side-card side-card">
        <h3>Build progress</h3>
        <IdeaProgressLine buildStatus={idea.buildStatus} />
      </section>

      <section className="idea-side-card side-card">
        <IdeaClaimedBox idea={idea} signedIn={signedIn} />
      </section>
    </aside>
  );
}
