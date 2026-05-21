import { notFound } from "next/navigation";

import { getOptionalUser } from "@/lib/auth/server";
import { getIdeaById, listIdeas, type IdeaRecord } from "@/lib/ideas";
import {
  displayReactionCounts,
  getDisplayIdeaById,
  tallyFromCounts,
} from "@/lib/ideas/display-data";
import {
  countReactions,
  listReactionsForObject,
  userReactionsFor,
} from "@/lib/reactions";
import { getTrending } from "@/lib/trending";

import { IdeaBriefModal } from "@/components/ideas/IdeaBriefModal";
import { IdeaBriefTab } from "@/components/ideas/IdeaBriefTab";
import { IdeaContributionsTab } from "@/components/ideas/IdeaContributionsTab";
import { IdeaDetailSnapshotGrid } from "@/components/ideas/IdeaDetailSnapshotGrid";
import { IdeaDetailSummary } from "@/components/ideas/IdeaDetailSummary";
import {
  IDEA_TABS,
  IdeaDetailTabs,
  type IdeaTab,
} from "@/components/ideas/IdeaDetailTabs";
import { IdeaOverviewTab } from "@/components/ideas/IdeaOverviewTab";
import { IdeaRelatedReposTab } from "@/components/ideas/IdeaRelatedReposTab";
import { IdeaShareMenu } from "@/components/ideas/IdeaShareMenu";
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

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

async function loadDisplayIdea(id: string): Promise<IdeaRecord | null> {
  const real = await safeAsync(
    () => getIdeaById(id),
    null as Awaited<ReturnType<typeof getIdeaById>>,
  );
  if (
    real &&
    (real.status === "published" ||
      real.status === "shipped" ||
      real.status === "archived")
  ) {
    return real;
  }
  const all = await safeAsync(() => listIdeas(), [] as IdeaRecord[]);
  const rows = safe(() => getTrending("past_week", "All"), []);
  return getDisplayIdeaById(id, all, rows);
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const idea = await loadDisplayIdea(id);
  if (!idea) return { title: "Idea not found" };
  const ogPath = `/api/og/idea/${id}`;
  return {
    title: `${idea.title} - Ideas - TrendingRepo`,
    description: idea.pitch,
    openGraph: {
      title: `${idea.title} — Ideas — TrendingRepo`,
      description: idea.pitch,
      images: [{ url: ogPath, width: 1200, height: 630, alt: idea.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: idea.title,
      description: idea.pitch,
      images: [ogPath],
    },
  };
}

export default async function IdeaWorkspacePage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tab = parseTab(typeof sp.tab === "string" ? sp.tab : undefined);

  const idea = await loadDisplayIdea(id);
  if (!idea) notFound();

  const loadedUser = await getOptionalUser();
  const userId = loadedUser?.clerkUserId ?? null;
  const signedIn = Boolean(userId);

  const records = await safeAsync(
    () => listReactionsForObject("idea", idea.id),
    [] as Awaited<ReturnType<typeof listReactionsForObject>>,
  );
  const counts =
    records.length > 0 ? countReactions(records) : displayReactionCounts(idea);
  const mine = userId ? userReactionsFor(userId, records) : null;
  const tally = tallyFromCounts(counts);

  return (
    <>
      <main className="idea-detail-shell">
        <div className="idea-detail-cols">
          <div className="idea-detail-main">
            <div
              className="idea-share-strip"
              style={{ display: "flex", justifyContent: "flex-end", padding: "0 0 6px" }}
            >
              <IdeaShareMenu ideaId={idea.id} ideaTitle={idea.title} />
            </div>
            <IdeaDetailSummary
              idea={idea}
              counts={counts}
              mine={mine}
              signedIn={signedIn}
            />
            <IdeaDetailSnapshotGrid idea={idea} counts={counts} tally={tally} />
            <IdeaDetailTabs ideaId={idea.id} active={tab} />
            <div
              className="idea-tab-body"
              data-panel={tab}
              data-panel-group="idea-tabs"
              id={`idea-panel-${tab}`}
            >
              {tab === "overview" ? <IdeaOverviewTab idea={idea} /> : null}
              {tab === "contributions" ? (
                <IdeaContributionsTab ideaId={idea.id} signedIn={signedIn} />
              ) : null}
              {tab === "brief" ? <IdeaBriefTab idea={idea} /> : null}
              {tab === "related" ? (
                <IdeaRelatedReposTab idea={idea} signedIn={signedIn} />
              ) : null}
            </div>
          </div>
          <IdeaSideStack idea={idea} counts={counts} signedIn={signedIn} />
        </div>
      </main>
      <IdeaBriefModal />
    </>
  );
}
