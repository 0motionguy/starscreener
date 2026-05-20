// IdeaContributionsTab — Pixel-faithful to ideas-detail.html:1171-1267.
//
// Two stacked section-blocks:
//   1. Composer (8-type chip row + textarea + @mention autocomplete)
//   2. Sample contribution feed — 5 cards rendered from
//      SAMPLE_CONTRIBUTIONS until the persistence layer publishes real
//      contributions. Banner copy mirrors Wave A spec.
//
// Real contributions list (Phase 4C) will replace SAMPLE_CONTRIBUTIONS
// once /api/ideas/[id]/contributions returns rows for this idea — the
// banner copy already promises that.

import {
  SAMPLE_CONTRIBUTIONS,
  CONTRIBUTION_TYPE_LABEL,
  type SampleContribution,
} from "@/lib/ideas/sample-contributions";

import { IdeaContributionComposer } from "./IdeaContributionComposer";

interface IdeaContributionsTabProps {
  ideaId: string;
  signedIn: boolean;
}

interface SampleReactionBtn {
  key: "fire" | "bulb" | "rocket" | "target" | "check" | "money";
  emoji: string;
}

const REACTION_DEFS: SampleReactionBtn[] = [
  { key: "fire", emoji: "🔥" },
  { key: "bulb", emoji: "💡" },
  { key: "rocket", emoji: "🚀" },
  { key: "target", emoji: "🎯" },
  { key: "check", emoji: "✅" },
  { key: "money", emoji: "💸" },
];

function avatarInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function SampleCard({ contribution }: { contribution: SampleContribution }) {
  return (
    <div className="contribution-card" data-sample={contribution.id}>
      <div className={`contribution-avatar b${contribution.avatarTone}`}>
        {avatarInitials(contribution.authorName)}
      </div>
      <div className="contribution-body">
        <div className="contribution-header contribution-head">
          <span className="who contribution-author">{contribution.authorName}</span>
          <span className="contribution-handle">{contribution.authorHandle}</span>
          <span className="badge contribution-type">
            {CONTRIBUTION_TYPE_LABEL[contribution.type]}
          </span>
          <span className="contribution-age">{contribution.timeAgoLabel} ago</span>
        </div>
        <p className="contribution-text contribution-text-body">
          {contribution.body}
        </p>
        <div className="reactions contribution-reactions">
          {REACTION_DEFS.map((def) => {
            const count = contribution.reactions[def.key] ?? 0;
            return (
              <button
                key={def.key}
                type="button"
                className={`react-btn ${count > 0 ? "on" : ""}`}
                data-react={def.key}
                aria-label={`React with ${def.key}`}
                aria-pressed={count > 0}
              >
                <span className="emoji" aria-hidden="true">
                  {def.emoji}
                </span>
                <span className="n">{count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function IdeaContributionsTab({
  ideaId,
  signedIn,
}: IdeaContributionsTabProps) {
  return (
    <section
      className="tab-pane tab-contributions"
      role="tabpanel"
      aria-labelledby="idea-tab-contributions"
    >
      <section className="section-block">
        <div className="section-title">
          <h2>
            <span className="sparkle" aria-hidden="true">
              ✨
            </span>{" "}
            Contribute to this idea
          </h2>
          <span>type @ to tag a repo or skill</span>
        </div>
        <IdeaContributionComposer ideaId={ideaId} signedIn={signedIn} />
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>Comments &amp; contributions</h2>
          <span id="contribution-count">
            {SAMPLE_CONTRIBUTIONS.length} contributions
          </span>
        </div>
        <div className="contribution-sample-banner" role="note">
          Sample contributions — your post will replace these once a real one
          lands.
        </div>
        <div className="contribution-feed">
          {SAMPLE_CONTRIBUTIONS.map((c) => (
            <SampleCard contribution={c} key={c.id} />
          ))}
        </div>
      </section>
    </section>
  );
}
