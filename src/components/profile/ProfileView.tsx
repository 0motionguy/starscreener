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
import { EntityLogo } from "@/components/ui/EntityLogo";
import { profileLogoUrl, repoDisplayLogoUrl } from "@/lib/logos";

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
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <header
          className="pb-6 space-y-3"
          style={{ borderBottom: "1px solid var(--v2-line-std)" }}
        >
          <div
            className="flex items-center justify-between gap-3 pb-1"
            style={{ borderBottom: "1px solid var(--v2-line-std)" }}
          >
            <span
              className="v2-mono"
              style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
            >
              {`// 01 · PROFILE · @${handle.toUpperCase()}`}
            </span>
            {exists ? (
              <span
                className="v2-mono v2-stat tabular-nums"
                style={{ fontSize: 10, color: "var(--v2-ink-300)" }}
              >
                <span className="v2-live-dot mr-2 inline-block" aria-hidden />
                ACTIVE
              </span>
            ) : (
              <span
                className="v2-mono"
                style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
              >
                NO ACTIVITY YET
              </span>
            )}
          </div>
          <h1
            className="inline-flex items-center gap-3"
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontSize: "clamp(24px, 3vw, 32px)",
              fontWeight: 510,
              letterSpacing: "-0.022em",
              color: "var(--v2-ink-000)",
              lineHeight: 1.1,
            }}
          >
            <EntityLogo
              src={profileLogoUrl(handle, 40)}
              name={handle}
              size={40}
              shape="circle"
              alt=""
            />
            <span>@{handle}</span>
          </h1>
          {exists ? (
            <p
              className="v2-mono-tight tabular-nums"
              style={{ fontSize: 11, color: "var(--v2-ink-300)" }}
            >
              <span style={{ color: "var(--v2-ink-100)" }}>{ideas.length}</span>{" "}
              idea{ideas.length === 1 ? "" : "s"}
              <span style={{ color: "var(--v2-line-300)", margin: "0 8px" }}>·</span>
              <span style={{ color: "var(--v2-ink-100)" }}>{shippedRepos.length}</span>{" "}
              shipped
              <span style={{ color: "var(--v2-line-300)", margin: "0 8px" }}>·</span>
              <span style={{ color: "var(--v2-acc)" }}>{reactionsGiven.total}</span>{" "}
              reaction{reactionsGiven.total === 1 ? "" : "s"} given
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
                  className="v2-card p-3"
                  style={{
                    background: "var(--v2-sig-green-soft)",
                    borderColor: "var(--v2-sig-green)",
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <EntityLogo
                        src={repoDisplayLogoUrl(repoFullNameFromUrl(ref.repoUrl), null, 24)}
                        name={repoFullNameFromUrl(ref.repoUrl) ?? ref.ideaTitle}
                        size={24}
                        shape="square"
                        alt=""
                      />
                      <Link
                        href={`/ideas/${ref.ideaId}`}
                        className="truncate font-mono text-sm font-semibold text-text-primary hover:underline"
                      >
                        {ref.ideaTitle}
                      </Link>
                    </div>
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
          <div
            className="v2-card px-4 py-12 text-center"
            style={{
              borderStyle: "dashed",
              background: "var(--v2-bg-100)",
              fontSize: 12,
              color: "var(--v2-ink-400)",
            }}
          >
            <User2 className="size-6 mx-auto mb-3 opacity-50" aria-hidden />
            No posts or reactions from @{handle} yet.
          </div>
        ) : null}
      </div>
    </main>
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
    <div className="v2-card p-3">
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

function repoFullNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/github\.com$/i.test(parsed.hostname)) return null;
    const [owner, name] = parsed.pathname.split("/").filter(Boolean);
    return owner && name ? `${owner}/${name.replace(/\.git$/i, "")}` : null;
  } catch {
    return null;
  }
}

export default ProfileView;
