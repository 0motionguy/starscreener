// /ideas/[id] — Idea workspace. Phase 3D of the UI v6 rebuild.
//
// Renders the gradient hero, snapshot grid, 4-tab body
// (Overview / Contributions / Build brief / Related repos), and the
// sticky side stack (workspace facts + progress + claimed box).
//
// Render policy: dynamic = "force-dynamic" — per-idea reactions and
// contributions vary per request, so ISR would pin stale per-id data.
//
// Backend gaps shipped as honest empty states:
//   - Contributions feed
//   - Claim wire (POST /api/ideas/[id]/claim)
//   - Save wire (POST /api/me/saved)

import { notFound } from "next/navigation";

import { getOptionalUser } from "@/lib/auth/server";
import { getIdeaById } from "@/lib/ideas";
import {
  countReactions,
  listReactionsForObject,
  userReactionsFor,
} from "@/lib/reactions";

import { IdeaBriefModal } from "@/components/ideas/IdeaBriefModal";
import { IdeaBriefTab } from "@/components/ideas/IdeaBriefTab";
import { IdeaContributionsTab } from "@/components/ideas/IdeaContributionsTab";
import { IdeaDetailSnapshotGrid } from "@/components/ideas/IdeaDetailSnapshotGrid";
import { IdeaDetailSummary } from "@/components/ideas/IdeaDetailSummary";
import {
  IdeaDetailTabs,
  IDEA_TABS,
  type IdeaTab,
} from "@/components/ideas/IdeaDetailTabs";
import { IdeaOverviewTab } from "@/components/ideas/IdeaOverviewTab";
import { IdeaRelatedReposTab } from "@/components/ideas/IdeaRelatedReposTab";
import { IdeaSideStack } from "@/components/ideas/IdeaSideStack";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function parseTab(raw: string | undefined): IdeaTab {
  const id = raw && IDEA_TABS.find((t) => t.id === raw)?.id;
  return (id ?? "overview") as IdeaTab;
}

async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const idea = await safeAsync(
    () => getIdeaById(id),
    null as Awaited<ReturnType<typeof getIdeaById>>,
  );
  if (!idea) return { title: "Idea not found" };
  return {
    title: `${idea.title} — Ideas — TrendingRepo`,
    description: idea.pitch,
  };
}

export default async function IdeaWorkspacePage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tab = parseTab(typeof sp.tab === "string" ? sp.tab : undefined);

  const idea = await getIdeaById(id);
  if (!idea) notFound();

  const loadedUser = await getOptionalUser();
  const userId = loadedUser?.clerkUserId ?? null;
  const signedIn = !!userId;

  const records = await safeAsync(
    () => listReactionsForObject("idea", id),
    [] as Awaited<ReturnType<typeof listReactionsForObject>>,
  );
  const counts = countReactions(records);
  const mine = userId ? userReactionsFor(userId, records) : null;

  return (
    <>
      <div
        style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}
      >
        <div
          className="idea-detail-cols"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 340px",
            gap: 18,
          }}
        >
          <div className="idea-detail-main">
            <IdeaDetailSummary
              idea={idea}
              counts={counts}
              mine={mine}
              signedIn={signedIn}
            />
            <IdeaDetailSnapshotGrid idea={idea} counts={counts} />
            <IdeaDetailTabs ideaId={idea.id} active={tab} />
            <div className="idea-tab-body">
              {tab === "overview" ? <IdeaOverviewTab idea={idea} /> : null}
              {tab === "contributions" ? (
                <IdeaContributionsTab ideaId={idea.id} />
              ) : null}
              {tab === "brief" ? <IdeaBriefTab idea={idea} /> : null}
              {tab === "related" ? <IdeaRelatedReposTab idea={idea} /> : null}
            </div>
          </div>
          <IdeaSideStack idea={idea} counts={counts} signedIn={signedIn} />
        </div>
      </div>
      <IdeaBriefModal />
    </>
  );
}
