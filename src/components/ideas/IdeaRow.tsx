// IdeaRow — full board row. Pure server component for the layout; pulls
// in two client islands (IdeaReactionsRow + IdeaInlineComments) for the
// interactive surfaces. The whole row is wrapped in a <Link> to the
// detail view; the interactive children stop propagation themselves
// (buttons capture click before the row link fires).

import Link from "next/link";

import type { IdeaRecord } from "@/lib/ideas";
import type {
  ReactionCounts,
  UserReactionState,
} from "@/lib/reactions-shape";

import { IdeaInlineComments } from "./IdeaInlineComments";
import { IdeaMarkMini } from "./IdeaMarkMini";
import { IdeaReactionsRow } from "./IdeaReactionsRow";

interface IdeaRowProps {
  idea: IdeaRecord;
  counts: ReactionCounts;
  mine: UserReactionState | null;
  signedIn: boolean;
  hotScore: number | null;
}

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  pending_moderation: { label: "PENDING", cls: "pill-warn" },
  published: { label: "LIVE", cls: "pill-live" },
  shipped: { label: "SHIPPED", cls: "pill-ok" },
  archived: { label: "ARCHIVED", cls: "pill-mute" },
  rejected: { label: "REJECTED", cls: "pill-bad" },
};

const BUILD_STATUS_LABEL: Record<string, string> = {
  exploring: "Exploring",
  scoping: "Scoping",
  building: "Building",
  shipped: "Shipped",
  abandoned: "Abandoned",
};

function relAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h`;
  const mins = Math.floor(ms / 60_000);
  return `${Math.max(1, mins)}m`;
}

export function IdeaRow({
  idea,
  counts,
  mine,
  signedIn,
  hotScore,
}: IdeaRowProps) {
  const pill = STATUS_PILL[idea.status] ?? STATUS_PILL.published!;
  const buildLabel = BUILD_STATUS_LABEL[idea.buildStatus] ?? idea.buildStatus;
  const demandTotal =
    counts.build + counts.use + counts.buy + counts.invest;

  return (
    <article className="idea-row" data-idea-id={idea.id}>
      <div className="idea-row-main">
        <IdeaMarkMini ideaId={idea.id} />
        <div className="idea-row-content">
          <div className="idea-title-line">
            <Link href={`/ideas/${idea.id}`} className="idea-title">
              {idea.title}
            </Link>
            <span className={`idea-pill ${pill.cls}`}>{pill.label}</span>
            {idea.category ? (
              <span className="idea-cat">{idea.category}</span>
            ) : null}
            <span className="idea-age">{relAge(idea.createdAt)}</span>
          </div>
          <p className="idea-pitch">{idea.pitch}</p>

          <div className="idea-signals">
            {idea.targetRepos.slice(0, 3).map((repo) => (
              <Link
                key={repo}
                href={`/repo/${repo}`}
                className="signal-pill signal-repo"
                prefetch={false}
              >
                {repo}
              </Link>
            ))}
            {idea.tags.slice(0, 3).map((t) => (
              <span key={t} className="signal-pill signal-tag">
                {t}
              </span>
            ))}
            {hotScore !== null && hotScore > 0 ? (
              <span className="signal-pill signal-hot">
                hot {hotScore.toFixed(1)}
              </span>
            ) : null}
          </div>

          <IdeaReactionsRow
            ideaId={idea.id}
            initialCounts={counts}
            initialMine={mine}
            signedIn={signedIn}
          />

          <IdeaInlineComments ideaId={idea.id} />
        </div>
      </div>

      <aside className="idea-row-cols">
        <div className="idea-col">
          <div className="col-label">Evidence</div>
          <div className="col-value">
            {idea.targetRepos.length > 0
              ? `${idea.targetRepos.length} repo${
                  idea.targetRepos.length === 1 ? "" : "s"
                } cited`
              : "No repos cited"}
          </div>
          <div className="col-hint">@{idea.authorHandle}</div>
        </div>
        <div className="idea-col">
          <div className="col-label">Build</div>
          <div className="col-value">{buildLabel}</div>
          <div className="col-hint">
            {idea.shippedRepoUrl ? "Shipped repo linked" : "Open for claim"}
          </div>
        </div>
        <div className="idea-col">
          <div className="col-label">Demand</div>
          <div className="col-value">{demandTotal.toLocaleString()}</div>
          <div className="col-hint">
            {counts.build} build · {counts.use} use · {counts.buy} buy ·{" "}
            {counts.invest} invest
          </div>
        </div>
        <div className="idea-col idea-col-actions">
          <Link
            href={`/ideas/${idea.id}`}
            className="row-action"
            prefetch={false}
          >
            Open
          </Link>
          <button
            type="button"
            className="row-action"
            data-idea-action="brief"
            data-idea-id={idea.id}
          >
            Brief
          </button>
        </div>
      </aside>
    </article>
  );
}
