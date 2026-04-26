// Profile surface — where social density forms (per the strategy doc's
// "Missing Pieces" list). Shows three columns of a user's footprint:
//   - Ideas they've posted (published or shipped only)
//   - Repos they've shipped (ideas with buildStatus=shipped + URL)
//   - Reaction summary (counts of build/use/buy/invest given)
//
// Server-renderable — no client interactivity needed for v1. The
// IdeaCard renders reactions inline via its own client component.

import Link from "next/link";
import type { JSX } from "react";
import {
  ExternalLink,
  Hammer,
  Lightbulb,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  User2,
} from "lucide-react";

import type { Profile } from "@/lib/profile";
import type { ReactionCounts } from "@/lib/reactions-shape";
import { IdeaCard } from "@/components/ideas/IdeaCard";

interface ProfileViewProps {
  profile: Profile;
  /** Per-idea reaction counts, fetched server-side alongside the profile. */
  ideaReactionCounts: Record<string, ReactionCounts>;
}

export function ProfileView({
  profile,
  ideaReactionCounts,
}: ProfileViewProps): JSX.Element {
  const { handle, exists, ideas, shippedRepos, reactionsGiven } = profile;

  return (
    <div className="v2-frame py-6 space-y-6 max-w-[1000px]">
      <header
        className="pb-6"
        style={{ borderBottom: "1px solid var(--v2-line-200)" }}
      >
        <h1
          className="v2-mono mb-2 inline-flex items-center gap-2"
          style={{
            color: "var(--v2-ink-100)",
            fontSize: 12,
            letterSpacing: "0.20em",
          }}
        >
          <span aria-hidden>{"// "}</span>
          PROFILE ·{" "}
          <span
            style={{
              textTransform: "lowercase",
              letterSpacing: "0.04em",
            }}
          >
            @{handle}
          </span>
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
        <div className="flex flex-wrap items-baseline gap-3">
          <span
            className="inline-flex items-center gap-2"
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontWeight: 510,
              fontSize: 28,
              letterSpacing: "-0.02em",
              color: "var(--v2-ink-000)",
            }}
          >
            <User2
              className="size-6"
              style={{ color: "var(--v2-acc)" }}
              aria-hidden
            />
            @{handle}
          </span>
          {!exists ? (
            <span
              className="v2-mono"
              style={{ color: "var(--v2-ink-400)" }}
            >
              NO ACTIVITY YET
            </span>
          ) : null}
        </div>
        {exists ? (
          <p
            className="mt-2 v2-mono"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span className="tabular-nums" style={{ color: "var(--v2-ink-100)" }}>
              {ideas.length}
            </span>{" "}
            IDEA{ideas.length === 1 ? "" : "S"} ·{" "}
            <span className="tabular-nums" style={{ color: "var(--v2-ink-100)" }}>
              {shippedRepos.length}
            </span>{" "}
            SHIPPED ·{" "}
            <span className="tabular-nums" style={{ color: "var(--v2-ink-100)" }}>
              {reactionsGiven.total}
            </span>{" "}
            REACTION{reactionsGiven.total === 1 ? "" : "S"} GIVEN
          </p>
        ) : null}
      </header>

        {/* Reaction summary tiles — compact. Individual reactions are not
            listed in v1 (too long on power users); we surface totals by
            type instead. */}
        {exists ? (
          <section
            aria-label="Reactions given"
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            <ReactionTile
              label="Build"
              value={reactionsGiven.build}
              icon={Hammer}
            />
            <ReactionTile
              label="Use"
              value={reactionsGiven.use}
              icon={Sparkles}
            />
            <ReactionTile
              label="Buy"
              value={reactionsGiven.buy}
              icon={ShoppingCart}
            />
            <ReactionTile
              label="Invest"
              value={reactionsGiven.invest}
              icon={TrendingUp}
            />
          </section>
        ) : null}

        {/* Shipped repos — the killer loop ("ideas drive repo creation
            drives shipped badges"). Empty state is silent. */}
        {shippedRepos.length > 0 ? (
          <section aria-label="Shipped repos" className="space-y-3">
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary inline-flex items-center gap-1.5">
              <Sparkles className="size-3" aria-hidden /> Shipped
            </h2>
            <ul className="space-y-2">
              {shippedRepos.map((ref) => (
                <li
                  key={ref.ideaId}
                  className="rounded-card border border-up/40 bg-up/5 p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/ideas/${ref.ideaId}`}
                      className="font-mono text-sm font-semibold text-text-primary hover:underline"
                    >
                      {ref.ideaTitle}
                    </Link>
                    <a
                      href={ref.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary hover:underline"
                    >
                      {ref.repoUrl.replace(/^https?:\/\//, "")}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Ideas feed — reuses IdeaCard with reactions. */}
        {ideas.length > 0 ? (
          <section aria-label="Ideas" className="space-y-3">
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary inline-flex items-center gap-1.5">
              <Lightbulb className="size-3" aria-hidden /> Ideas
            </h2>
            <ul className="space-y-3">
              {ideas.map((idea) => (
                <li key={idea.id}>
                  <IdeaCard
                    idea={idea}
                    reactionCounts={
                      ideaReactionCounts[idea.id] ?? {
                        build: 0,
                        use: 0,
                        buy: 0,
                        invest: 0,
                      }
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!exists ? (
          <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/40 px-4 py-12 text-center text-sm text-text-tertiary">
            <User2 className="size-6 mx-auto mb-3 opacity-50" aria-hidden />
            No posts or reactions from @{handle} yet.
          </div>
        ) : null}
    </div>
  );
}

function ReactionTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Hammer;
}): JSX.Element {
  return (
    <div className="rounded-card border border-border-primary bg-bg-card p-3 shadow-card">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-text-tertiary" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
      </div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-text-primary">
        {value}
      </div>
    </div>
  );
}

export default ProfileView;
