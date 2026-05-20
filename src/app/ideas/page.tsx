import { getOptionalUser } from "@/lib/auth/server";
import {
  hotScore,
  listIdeas,
  type IdeaRecord,
  type ReactionTallyForIdea,
} from "@/lib/ideas";
import {
  displayReactionCounts,
  getDisplayIdeas,
  tallyFromCounts,
} from "@/lib/ideas/display-data";
import {
  countReactions,
  listReactionsForObjects,
  userReactionsFor,
} from "@/lib/reactions";
import { getTrending } from "@/lib/trending";

import { IdeaBriefModal } from "@/components/ideas/IdeaBriefModal";
import { IdeaRow } from "@/components/ideas/IdeaRow";
import { IdeaSelectedPreviewPanel } from "@/components/ideas/IdeaSelectedPreviewPanel";
import { IdeaSubmitModal } from "@/components/ideas/IdeaSubmitModal";
import { IdeaTrendModal } from "@/components/ideas/IdeaTrendModal";
import { IdeasBoardHero } from "@/components/ideas/IdeasBoardHero";
import {
  IDEA_FILTERS,
  IDEA_SORTS,
  IdeasBoardToolbar,
  type IdeaFilter,
  type IdeaSort,
} from "@/components/ideas/IdeasBoardToolbar";
import { IdeasContextTicker } from "@/components/ideas/IdeasContextTicker";
import { IdeasSummaryBar } from "@/components/ideas/IdeasSummaryBar";

export const revalidate = 600;

export const metadata = {
  title: "Ideas Board",
  description:
    "Where contribution meets opportunity. Builders post unmet needs from trending repos. The community scores demand with Would Build / Use / Buy / Invest. The best ideas get claimed and shipped.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function parseSort(raw: string | undefined): IdeaSort {
  const id = raw && IDEA_SORTS.find((s) => s.id === raw)?.id;
  return (id ?? "hot") as IdeaSort;
}

function parseFilter(raw: string | undefined): IdeaFilter {
  const id = raw && IDEA_FILTERS.find((f) => f.id === raw)?.id;
  return (id ?? "all") as IdeaFilter;
}

function tallyFor(records: ReturnType<typeof countReactions>): ReactionTallyForIdea {
  return {
    build: records.build,
    use: records.use,
    buy: records.buy,
    invest: records.invest,
  };
}

function applyFilter(
  records: IdeaRecord[],
  filter: IdeaFilter,
  countsById: Map<string, ReactionTallyForIdea>,
): IdeaRecord[] {
  if (filter === "all") return records;
  const now = Date.now();
  switch (filter) {
    case "trending":
      return records
        .map((r) => ({
          r,
          h: hotScore(
            r,
            countsById.get(r.id) ?? { build: 0, use: 0, buy: 0, invest: 0 },
          ),
        }))
        .filter((x) => x.h > 0)
        .map((x) => x.r);
    case "high-demand":
      return records.filter((r) => {
        const t = countsById.get(r.id);
        if (!t) return false;
        return t.build + t.use + t.buy + t.invest >= 120;
      });
    case "fresh":
      return records.filter(
        (r) => now - Date.parse(r.createdAt) < 24 * 60 * 60 * 1000,
      );
    case "easy":
      return records.filter((r) =>
        r.tags.some((t) => /easy|small|starter/i.test(t)),
      );
    case "unclaimed":
      return records.filter((r) => r.buildStatus === "exploring");
    case "shipped":
      return records.filter(
        (r) => r.buildStatus === "shipped" || r.status === "shipped",
      );
    case "devtools":
    case "ai-agents":
    case "infra":
    case "saas":
    case "open-source":
      return records.filter(
        (r) =>
          r.category === filter ||
          r.tags.some((tag) => tag.toLowerCase() === filter),
      );
    default:
      return records;
  }
}

function applyQuery(records: IdeaRecord[], q: string): IdeaRecord[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((r) => {
    if (r.title.toLowerCase().includes(needle)) return true;
    if (r.pitch.toLowerCase().includes(needle)) return true;
    if ((r.body ?? "").toLowerCase().includes(needle)) return true;
    if (r.tags.some((t) => t.toLowerCase().includes(needle))) return true;
    if (r.targetRepos.some((t) => t.toLowerCase().includes(needle))) return true;
    return false;
  });
}

function applySort(
  records: IdeaRecord[],
  sort: IdeaSort,
  scoresById: Map<string, number>,
): IdeaRecord[] {
  switch (sort) {
    case "new":
      return [...records].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
    case "easy":
      return [...records].sort((a, b) => {
        const aEasy = a.tags.some((t) => /easy|small|starter/i.test(t)) ? 1 : 0;
        const bEasy = b.tags.some((t) => /easy|small|starter/i.test(t)) ? 1 : 0;
        if (bEasy !== aEasy) return bEasy - aEasy;
        return (scoresById.get(b.id) ?? 0) - (scoresById.get(a.id) ?? 0);
      });
    case "launch":
      return [...records].sort((a, b) => {
        const order: Record<string, number> = {
          shipped: 4,
          building: 3,
          scoping: 2,
          exploring: 1,
          abandoned: 0,
        };
        const da = order[a.buildStatus] ?? 0;
        const db = order[b.buildStatus] ?? 0;
        if (db !== da) return db - da;
        return (scoresById.get(b.id) ?? 0) - (scoresById.get(a.id) ?? 0);
      });
    case "saved":
    case "hot":
    default:
      return [...records].sort(
        (a, b) => (scoresById.get(b.id) ?? 0) - (scoresById.get(a.id) ?? 0),
      );
  }
}

export default async function IdeasBoardPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const q = typeof params.q === "string" ? params.q : "";
  const sort = parseSort(
    typeof params.sort === "string" ? params.sort : undefined,
  );
  const filter = parseFilter(
    typeof params.filter === "string" ? params.filter : undefined,
  );

  const loadedUser = await getOptionalUser();
  const userId = loadedUser?.clerkUserId ?? null;
  const signedIn = Boolean(userId);

  const all = await safeAsync(() => listIdeas(), [] as IdeaRecord[]);
  const trendingRows = safe(() => getTrending("past_week", "All"), []);
  const visible = getDisplayIdeas(all, trendingRows);
  const ids = visible.map((r) => r.id);

  const reactionsMap = await safeAsync(
    () => listReactionsForObjects("idea", ids),
    new Map() as Awaited<ReturnType<typeof listReactionsForObjects>>,
  );

  const countsById = new Map<string, ReactionTallyForIdea>();
  const reactionCountsById = new Map<string, ReturnType<typeof countReactions>>();
  const mineById = new Map<string, ReturnType<typeof userReactionsFor>>();
  const scoresById = new Map<string, number>();

  for (const idea of visible) {
    const records = reactionsMap.get(idea.id) ?? [];
    const counts =
      records.length > 0 ? countReactions(records) : displayReactionCounts(idea);
    const tally = records.length > 0 ? tallyFor(counts) : tallyFromCounts(counts);
    reactionCountsById.set(idea.id, counts);
    countsById.set(idea.id, tally);
    if (userId) mineById.set(idea.id, userReactionsFor(userId, records));
    scoresById.set(idea.id, hotScore(idea, tally));
  }

  let rendered = applyQuery(visible, q);
  const queryHadMatches = rendered.length > 0;
  rendered = applyFilter(rendered, filter, countsById);
  rendered = applySort(rendered, sort, scoresById);
  if (rendered.length === 0) {
    rendered = applySort(visible, sort, scoresById).slice(0, 5);
  }

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const totalLive = visible.length;
  const reactionsThisWeek = [...reactionCountsById.values()].reduce(
    (acc, c) => acc + c.build + c.use + c.buy + c.invest,
    0,
  );
  const shippedThisMonth = visible.filter(
    (i) =>
      (i.status === "shipped" || i.buildStatus === "shipped") &&
      now - Date.parse(i.createdAt) < monthMs,
  ).length;
  const topClaimable = visible.filter(
    (i) =>
      i.buildStatus === "exploring" &&
      now - Date.parse(i.createdAt) < weekMs &&
      (scoresById.get(i.id) ?? 0) > 0,
  ).length;
  const newThisWeek = visible.filter(
    (i) => now - Date.parse(i.createdAt) < weekMs,
  ).length;
  const shippedCount = visible.filter(
    (i) => i.status === "shipped" || i.buildStatus === "shipped",
  ).length;

  const trendingRepos = trendingRows.slice(0, 8).map((row) => ({
    fullName: row.repo_name,
    pitch:
      row.description?.slice(0, 140) ??
      `Trending ${row.primary_language} repo.`,
  }));

  const selectedIdea = rendered[0] ?? visible[0] ?? null;
  const newestIdeaAt =
    visible
      .map((i) => i.createdAt)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

  return (
    <>
      <IdeasContextTicker ideas={visible} limit={12} />
      <main className="ideas-shell">
        <IdeasBoardHero
          totalCount={totalLive}
          shippedCount={shippedCount}
          newThisWeek={newThisWeek}
          fetchedAt={newestIdeaAt}
        />

        <IdeasSummaryBar
          totalLive={totalLive}
          reactionsThisWeek={reactionsThisWeek}
          shippedThisMonth={shippedThisMonth}
          topClaimable={topClaimable}
        />

        <IdeasBoardToolbar q={q} sort={sort} filter={filter} />

        <section className="ideas-cols" aria-label="Ideas board">
          <div className="ideas-list">
            {q && !queryHadMatches ? (
              <div className="ideas-match-note">
                Closest live opportunities for <code>{q}</code>
              </div>
            ) : null}
            {rendered.map((idea, index) => (
              <IdeaRow
                key={idea.id}
                idea={idea}
                counts={
                  reactionCountsById.get(idea.id) ?? displayReactionCounts(idea)
                }
                mine={mineById.get(idea.id) ?? null}
                signedIn={signedIn}
                hotScore={scoresById.get(idea.id) ?? null}
                selected={index === 0}
              />
            ))}
          </div>
          <div className="ideas-rail">
            <IdeaSelectedPreviewPanel idea={selectedIdea} />
          </div>
        </section>
      </main>

      <IdeaSubmitModal signedIn={signedIn} />
      <IdeaTrendModal trendingRepos={trendingRepos} />
      <IdeaBriefModal />
    </>
  );
}
