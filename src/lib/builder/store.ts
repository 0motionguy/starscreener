// TrendingRepo — Builder-layer storage interface.
//
// Strategy: single `BuilderStore` interface, two implementations:
//   • JsonBuilderStore — atomic writes to data/builder/*.json (ships today)
//   • SupabaseBuilderStore — same interface over Postgres (flips on when
//     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY land in env)
//
// The factory selects by env at import time. Every API route calls
// `getBuilderStore()` — the concrete class stays out of route code so the
// swap is a one-file change.
//
// JSON writes use a simple `.tmp` + rename pattern. For the P0 traffic
// profile (pre-launch, <10 writes/min) this is safe. A future Supabase
// move handles true concurrency.

import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  Builder,
  Idea,
  IdeaFeedCard,
  IdeaFeedQuery,
  IdeaPhase,
  Prediction,
  Reaction,
  ReactionKind,
  ReactionTally,
  Sprint,
} from "./types";
import { readSupabaseEnv } from "./supabase";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface BuilderStore {
  // Builders
  getBuilder(id: string): Promise<Builder | null>;
  upsertBuilder(b: Builder): Promise<void>;

  // Ideas
  getIdea(slugOrId: string): Promise<Idea | null>;
  listIdeas(q: IdeaFeedQuery): Promise<IdeaFeedCard[]>;
  createIdea(i: Idea): Promise<void>;
  updateIdea(slugOrId: string, patch: Partial<Idea>): Promise<Idea | null>;
  ideasByRepoId(repoId: string, limit?: number): Promise<IdeaFeedCard[]>;

  // Reactions
  addReaction(r: Reaction): Promise<void>;
  removeReaction(reactionId: string, builderId: string): Promise<boolean>;
  getReactions(subjectType: "repo" | "idea", subjectId: string): Promise<Reaction[]>;
  getTally(subjectType: "repo" | "idea", subjectId: string): Promise<ReactionTally>;
  reactionsByBuilder(builderId: string, limit?: number): Promise<Reaction[]>;

  // Sprints
  getSprint(id: string): Promise<Sprint | null>;
  upsertSprint(s: Sprint): Promise<void>;
  sprintsByIdea(ideaId: string): Promise<Sprint[]>;

  // Predictions
  getPrediction(id: string): Promise<Prediction | null>;
  upsertPrediction(p: Prediction): Promise<void>;
  predictionsForSubject(
    subjectType: Prediction["subjectType"],
    subjectId: string,
  ): Promise<Prediction[]>;
}

// ---------------------------------------------------------------------------
// JSON implementation
// ---------------------------------------------------------------------------

interface BuilderFileShape {
  builders: Record<string, Builder>;
  ideas: Record<string, Idea>; // keyed by id
  reactions: Record<string, Reaction>; // keyed by id
  sprints: Record<string, Sprint>;
  predictions: Record<string, Prediction>;
  meta: { version: 1; updatedAt: string };
}

function emptyShape(): BuilderFileShape {
  return {
    builders: {},
    ideas: {},
    reactions: {},
    sprints: {},
    predictions: {},
    meta: { version: 1, updatedAt: new Date(0).toISOString() },
  };
}

export class JsonBuilderStore implements BuilderStore {
  private readonly file: string;
  private cache: BuilderFileShape | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "builder", "store.json");
  }

  private async ensureLoaded(): Promise<BuilderFileShape> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      this.cache = JSON.parse(raw) as BuilderFileShape;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.cache = emptyShape();
        await this.persist();
      } else {
        throw err;
      }
    }
    return this.cache!;
  }

  /** Atomic write: stringify → .tmp → rename. Serialized via a single queue. */
  private async persist(): Promise<void> {
    if (!this.cache) return;
    const snapshot = this.cache;
    this.writeQueue = this.writeQueue.then(async () => {
      snapshot.meta = { version: 1, updatedAt: new Date().toISOString() };
      const tmp = `${this.file}.tmp.${process.pid}.${Date.now()}`;
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
      await fs.rename(tmp, this.file);
    });
    await this.writeQueue;
  }

  // ---- Builders ----------------------------------------------------------
  async getBuilder(id: string): Promise<Builder | null> {
    const s = await this.ensureLoaded();
    return s.builders[id] ?? null;
  }

  async upsertBuilder(b: Builder): Promise<void> {
    const s = await this.ensureLoaded();
    s.builders[b.id] = b;
    await this.persist();
  }

  // ---- Ideas -------------------------------------------------------------
  async getIdea(slugOrId: string): Promise<Idea | null> {
    const s = await this.ensureLoaded();
    if (s.ideas[slugOrId]) return s.ideas[slugOrId];
    for (const idea of Object.values(s.ideas)) {
      if (idea.slug === slugOrId) return idea;
    }
    return null;
  }

  async listIdeas(q: IdeaFeedQuery): Promise<IdeaFeedCard[]> {
    const s = await this.ensureLoaded();
    let all = Object.values(s.ideas).filter((i) => i.public);
    if (q.tag) {
      all = all.filter((i) => i.tags.includes(q.tag!));
    }
    if (q.phase) {
      all = all.filter((i) => i.phase === q.phase);
    }

    // Sort
    if (q.sort === "new") {
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (q.sort === "resolving") {
      // Nearest active sprint endsAt ≤ 48h wins
      const now = Date.now();
      const withEnd = await Promise.all(
        all.map(async (i) => {
          if (!i.currentSprintId) return { i, end: Infinity };
          const sp = s.sprints[i.currentSprintId];
          return { i, end: sp ? Math.max(0, Date.parse(sp.endsAt) - now) : Infinity };
        }),
      );
      withEnd.sort((a, b) => a.end - b.end);
      all = withEnd.map((x) => x.i);
    } else {
      // hot — freshness*0.35 + conviction*0.25 + authorDepth*0.15 + anchorMomentum*0.15 + recency*0.10
      // simplified for P0: we compute with only what we have locally.
      const now = Date.now();
      const scored = await Promise.all(
        all.map(async (i) => {
          const tally = this.computeTallySync(s, "idea", i.slug);
          const author = s.builders[i.authorBuilderId];
          const ageH = (now - Date.parse(i.createdAt)) / 3_600_000;
          const recency = Math.exp(-ageH / 48);
          const conviction = tally.conviction;
          const depth = author?.depthScore ?? 0.5;
          const score =
            0.35 * recency + // freshness proxy until we can tie to signal age
            0.35 * Math.tanh(conviction) +
            0.15 * depth +
            0.15 * recency;
          return { i, score };
        }),
      );
      scored.sort((a, b) => b.score - a.score);
      all = scored.map((x) => x.i);
    }

    const sliced = all.slice(q.offset, q.offset + q.limit);
    return sliced.map((i) => this.toFeedCardSync(s, i));
  }

  async createIdea(i: Idea): Promise<void> {
    const s = await this.ensureLoaded();
    if (s.ideas[i.id]) throw new Error(`idea already exists: ${i.id}`);
    for (const existing of Object.values(s.ideas)) {
      if (existing.slug === i.slug) throw new Error(`slug already taken: ${i.slug}`);
    }
    s.ideas[i.id] = i;
    await this.persist();
  }

  async updateIdea(slugOrId: string, patch: Partial<Idea>): Promise<Idea | null> {
    const s = await this.ensureLoaded();
    let target: Idea | undefined = s.ideas[slugOrId];
    if (!target) {
      target = Object.values(s.ideas).find((x) => x.slug === slugOrId);
    }
    if (!target) return null;
    const updated: Idea = {
      ...target,
      ...patch,
      id: target.id,
      slug: target.slug,
      updatedAt: new Date().toISOString(),
    };
    s.ideas[target.id] = updated;
    await this.persist();
    return updated;
  }

  async ideasByRepoId(repoId: string, limit = 6): Promise<IdeaFeedCard[]> {
    const s = await this.ensureLoaded();
    const matches = Object.values(s.ideas)
      .filter((i) => i.public && i.linkedRepoIds.includes(repoId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
    return matches.map((i) => this.toFeedCardSync(s, i));
  }

  // ---- Reactions ---------------------------------------------------------
  async addReaction(r: Reaction): Promise<void> {
    const s = await this.ensureLoaded();
    s.reactions[r.id] = r;
    await this.persist();
  }

  async removeReaction(reactionId: string, builderId: string): Promise<boolean> {
    const s = await this.ensureLoaded();
    const r = s.reactions[reactionId];
    if (!r || r.builderId !== builderId) return false;
    delete s.reactions[reactionId];
    await this.persist();
    return true;
  }

  async getReactions(
    subjectType: "repo" | "idea",
    subjectId: string,
  ): Promise<Reaction[]> {
    const s = await this.ensureLoaded();
    return Object.values(s.reactions).filter(
      (r) => r.subjectType === subjectType && r.subjectId === subjectId,
    );
  }

  async getTally(
    subjectType: "repo" | "idea",
    subjectId: string,
  ): Promise<ReactionTally> {
    const s = await this.ensureLoaded();
    return this.computeTallySync(s, subjectType, subjectId);
  }

  async reactionsByBuilder(builderId: string, limit = 100): Promise<Reaction[]> {
    const s = await this.ensureLoaded();
    return Object.values(s.reactions)
      .filter((r) => r.builderId === builderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  // ---- Sprints -----------------------------------------------------------
  async getSprint(id: string): Promise<Sprint | null> {
    const s = await this.ensureLoaded();
    return s.sprints[id] ?? null;
  }

  async upsertSprint(sp: Sprint): Promise<void> {
    const s = await this.ensureLoaded();
    s.sprints[sp.id] = sp;
    await this.persist();
  }

  async sprintsByIdea(ideaId: string): Promise<Sprint[]> {
    const s = await this.ensureLoaded();
    return Object.values(s.sprints)
      .filter((x) => x.ideaId === ideaId)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  // ---- Predictions -------------------------------------------------------
  async getPrediction(id: string): Promise<Prediction | null> {
    const s = await this.ensureLoaded();
    return s.predictions[id] ?? null;
  }

  async upsertPrediction(p: Prediction): Promise<void> {
    const s = await this.ensureLoaded();
    s.predictions[p.id] = p;
    await this.persist();
  }

  async predictionsForSubject(
    subjectType: Prediction["subjectType"],
    subjectId: string,
  ): Promise<Prediction[]> {
    const s = await this.ensureLoaded();
    return Object.values(s.predictions)
      .filter((p) => p.subjectType === subjectType && p.subjectId === subjectId)
      .sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  }

  // ---- Helpers -----------------------------------------------------------
  private computeTallySync(
    s: BuilderFileShape,
    subjectType: "repo" | "idea",
    subjectId: string,
  ): ReactionTally {
    const kinds: ReactionKind[] = ["use", "build", "buy", "invest"];
    const rs = Object.values(s.reactions).filter(
      (r) => r.subjectType === subjectType && r.subjectId === subjectId,
    );

    const counts: Record<ReactionKind, number> = { use: 0, build: 0, buy: 0, invest: 0 };
    const builders = new Set<string>();
    const topPayloads: ReactionTally["topPayloads"] = {
      use: [],
      build: [],
      buy: [],
      invest: [],
    };

    for (const r of rs) {
      counts[r.kind] += 1;
      builders.add(r.builderId);
      const text = payloadText(r);
      if (text) {
        topPayloads[r.kind].push({
          builderId: r.builderId,
          text,
          createdAt: r.createdAt,
        });
      }
    }

    for (const k of kinds) {
      topPayloads[k].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      topPayloads[k] = topPayloads[k].slice(0, 3);
    }

    const uniqueBuilders = builders.size;
    const conviction =
      (counts.build + 2 * counts.invest) / Math.max(uniqueBuilders, 1);

    return {
      subjectType,
      subjectId,
      use: counts.use,
      build: counts.build,
      buy: counts.buy,
      invest: counts.invest,
      conviction,
      uniqueBuilders,
      topPayloads,
      updatedAt: new Date().toISOString(),
    };
  }

  private toFeedCardSync(s: BuilderFileShape, i: Idea): IdeaFeedCard {
    const author = s.builders[i.authorBuilderId];
    const tally = this.computeTallySync(s, "idea", i.slug);
    let sprintEndsInMs: number | undefined;
    let commitsThisSprint: number | undefined;
    if (i.currentSprintId) {
      const sp = s.sprints[i.currentSprintId];
      if (sp) {
        sprintEndsInMs = Math.max(0, Date.parse(sp.endsAt) - Date.now());
        commitsThisSprint = sp.actualCommits;
      }
    }
    return {
      id: i.id,
      slug: i.slug,
      thesis: i.thesis,
      whyNow: i.whyNow,
      tags: i.tags,
      stack: i.stack,
      phase: i.phase,
      authorHandle: author?.handle ?? "builder",
      authorDepth: author?.depthScore ?? 0.5,
      linkedRepoIds: i.linkedRepoIds,
      tally: {
        use: tally.use,
        build: tally.build,
        buy: tally.buy,
        invest: tally.invest,
        conviction: tally.conviction,
        uniqueBuilders: tally.uniqueBuilders,
      },
      sprintEndsInMs,
      commitsThisSprint,
      createdAt: i.createdAt,
    };
  }
}

function payloadText(r: Reaction): string | null {
  switch (r.kind) {
    case "use":
      return r.payload.useCase?.trim() || null;
    case "build":
      return r.payload.buildThesis?.trim() || null;
    case "buy":
      return r.payload.priceUsd != null ? `$${r.payload.priceUsd}` : null;
    case "invest":
      return r.publicInvest && r.payload.amountUsd != null
        ? `$${r.payload.amountUsd}${r.payload.horizonYears ? ` / ${r.payload.horizonYears}y` : ""}`
        : null;
  }
}

// ---------------------------------------------------------------------------
// Supabase implementation — PostgREST over fetch (no SDK dep).
// Schema lives in docs/BUILDER_DB.md. Tables: builder_builders, builder_ideas,
// builder_reactions, builder_sprints, builder_predictions.
// ---------------------------------------------------------------------------

import {
  insertRows,
  selectRows,
  updateRows,
  deleteRows,
  type SupabaseEnv,
} from "./supabase";
// readSupabaseEnv is imported at the top of this file; re-importing here would
// clash with the hoisted import. The type alias SupabaseEnv above is enough.

/** Row shapes as stored in Supabase (snake_case). */
interface BuilderRow {
  id: string;
  handle: string;
  github_login: string | null;
  depth_score: number;
  created_at: string;
  last_active_at: string;
}
interface IdeaRow {
  id: string;
  slug: string;
  author_builder_id: string;
  thesis: string;
  problem: string;
  why_now: string;
  linked_repo_ids: string[];
  stack: Idea["stack"];
  tags: string[];
  phase: IdeaPhase;
  current_sprint_id: string | null;
  public: boolean;
  agent_readiness: Idea["agentReadiness"] | null;
  x_post_id: string | null;
  created_at: string;
  updated_at: string;
}
interface ReactionRow {
  id: string;
  kind: ReactionKind;
  subject_type: "repo" | "idea";
  subject_id: string;
  builder_id: string;
  payload: Reaction["payload"];
  public_invest: boolean;
  created_at: string;
}
interface SprintRow {
  id: string;
  idea_id: string;
  phase: IdeaPhase;
  starts_at: string;
  ends_at: string;
  commitments: Sprint["commitments"];
  actual_commits: number;
  highlights: Sprint["highlights"];
  outcome: string | null;
  next_sprint_id: string | null;
  created_at: string;
  updated_at: string;
}
interface PredictionRow {
  id: string;
  subject_type: Prediction["subjectType"];
  subject_id: string;
  archetype: Prediction["archetype"];
  question: string;
  method: Prediction["method"];
  horizon_days: number;
  p20: number;
  p50: number;
  p80: number;
  metric: string;
  unit: string;
  opened_at: string;
  resolves_at: string;
  outcome: Prediction["outcome"] | null;
  created_at: string;
  updated_at: string;
}

// -- row <-> domain mappers --------------------------------------------------

function builderFromRow(r: BuilderRow): Builder {
  return {
    id: r.id,
    handle: r.handle,
    githubLogin: r.github_login ?? undefined,
    depthScore: r.depth_score,
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at,
  };
}
function builderToRow(b: Builder): BuilderRow {
  return {
    id: b.id,
    handle: b.handle,
    github_login: b.githubLogin ?? null,
    depth_score: b.depthScore,
    created_at: b.createdAt,
    last_active_at: b.lastActiveAt,
  };
}

function ideaFromRow(r: IdeaRow): Idea {
  return {
    id: r.id,
    slug: r.slug,
    authorBuilderId: r.author_builder_id,
    thesis: r.thesis,
    problem: r.problem,
    whyNow: r.why_now,
    linkedRepoIds: r.linked_repo_ids,
    stack: r.stack,
    tags: r.tags,
    phase: r.phase,
    currentSprintId: r.current_sprint_id ?? undefined,
    public: r.public,
    agentReadiness: r.agent_readiness ?? undefined,
    xPostId: r.x_post_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function ideaToRow(i: Idea): IdeaRow {
  return {
    id: i.id,
    slug: i.slug,
    author_builder_id: i.authorBuilderId,
    thesis: i.thesis,
    problem: i.problem,
    why_now: i.whyNow,
    linked_repo_ids: i.linkedRepoIds,
    stack: i.stack,
    tags: i.tags,
    phase: i.phase,
    current_sprint_id: i.currentSprintId ?? null,
    public: i.public,
    agent_readiness: i.agentReadiness ?? null,
    x_post_id: i.xPostId ?? null,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  };
}

function reactionFromRow(r: ReactionRow): Reaction {
  return {
    id: r.id,
    kind: r.kind,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    builderId: r.builder_id,
    payload: r.payload,
    publicInvest: r.public_invest,
    createdAt: r.created_at,
  };
}
function reactionToRow(r: Reaction): ReactionRow {
  return {
    id: r.id,
    kind: r.kind,
    subject_type: r.subjectType,
    subject_id: r.subjectId,
    builder_id: r.builderId,
    payload: r.payload,
    public_invest: r.publicInvest ?? false,
    created_at: r.createdAt,
  };
}

function sprintFromRow(r: SprintRow): Sprint {
  return {
    id: r.id,
    ideaId: r.idea_id,
    phase: r.phase,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    commitments: r.commitments,
    actualCommits: r.actual_commits,
    highlights: r.highlights,
    outcome: r.outcome ?? undefined,
    nextSprintId: r.next_sprint_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function sprintToRow(s: Sprint): SprintRow {
  return {
    id: s.id,
    idea_id: s.ideaId,
    phase: s.phase,
    starts_at: s.startsAt,
    ends_at: s.endsAt,
    commitments: s.commitments,
    actual_commits: s.actualCommits,
    highlights: s.highlights,
    outcome: s.outcome ?? null,
    next_sprint_id: s.nextSprintId ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function predictionFromRow(r: PredictionRow): Prediction {
  return {
    id: r.id,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    archetype: r.archetype,
    question: r.question,
    method: r.method,
    horizonDays: r.horizon_days,
    p20: r.p20,
    p50: r.p50,
    p80: r.p80,
    metric: r.metric,
    unit: r.unit,
    openedAt: r.opened_at,
    resolvesAt: r.resolves_at,
    outcome: r.outcome ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function predictionToRow(p: Prediction): PredictionRow {
  return {
    id: p.id,
    subject_type: p.subjectType,
    subject_id: p.subjectId,
    archetype: p.archetype,
    question: p.question,
    method: p.method,
    horizon_days: p.horizonDays,
    p20: p.p20,
    p50: p.p50,
    p80: p.p80,
    metric: p.metric,
    unit: p.unit,
    opened_at: p.openedAt,
    resolves_at: p.resolvesAt,
    outcome: p.outcome ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

const T = {
  builders: "builder_builders",
  ideas: "builder_ideas",
  reactions: "builder_reactions",
  sprints: "builder_sprints",
  predictions: "builder_predictions",
} as const;

export class SupabaseBuilderStore implements BuilderStore {
  constructor(private readonly env: SupabaseEnv) {}

  // ---- Builders ----------------------------------------------------------
  async getBuilder(id: string): Promise<Builder | null> {
    const rows = await selectRows<BuilderRow>(this.env, T.builders, {
      id: `eq.${id}`,
      limit: "1",
    });
    return rows[0] ? builderFromRow(rows[0]) : null;
  }

  async upsertBuilder(b: Builder): Promise<void> {
    await insertRows(this.env, T.builders, builderToRow(b), {
      onConflict: "id",
      returning: "minimal",
    });
  }

  // ---- Ideas -------------------------------------------------------------
  async getIdea(slugOrId: string): Promise<Idea | null> {
    // PostgREST `or` filter: match on id or slug.
    const rows = await selectRows<IdeaRow>(this.env, T.ideas, {
      or: `(id.eq.${slugOrId},slug.eq.${slugOrId})`,
      limit: "1",
    });
    return rows[0] ? ideaFromRow(rows[0]) : null;
  }

  async listIdeas(q: IdeaFeedQuery): Promise<IdeaFeedCard[]> {
    const query: Record<string, string> = {
      public: "eq.true",
      limit: String(q.limit),
      offset: String(q.offset),
    };
    if (q.tag) query.tags = `cs.{${q.tag}}`;
    if (q.phase) query.phase = `eq.${q.phase}`;
    if (q.sort === "new") {
      query.order = "created_at.desc";
    } else {
      // Hot + resolving are ranked on the app side (we need reactions joined).
      query.order = "created_at.desc";
    }
    const ideaRows = await selectRows<IdeaRow>(this.env, T.ideas, query);
    if (ideaRows.length === 0) return [];

    const [allBuilders, allReactions, allSprints] = await Promise.all([
      selectRows<BuilderRow>(this.env, T.builders, {
        id: `in.(${ideaRows.map((i) => i.author_builder_id).join(",")})`,
      }),
      selectRows<ReactionRow>(this.env, T.reactions, {
        subject_type: "eq.idea",
        subject_id: `in.(${ideaRows.map((i) => i.slug).join(",")})`,
      }),
      selectRows<SprintRow>(this.env, T.sprints, {
        id: `in.(${ideaRows
          .map((i) => i.current_sprint_id)
          .filter((x): x is string => !!x)
          .join(",") || "never"})`,
      }),
    ]);

    const builderMap = new Map(allBuilders.map((b) => [b.id, b]));
    const sprintMap = new Map(allSprints.map((s) => [s.id, s]));

    const cards = ideaRows.map((row) => {
      const idea = ideaFromRow(row);
      const author = builderMap.get(idea.authorBuilderId);
      const tally = tallyFromReactions(
        allReactions.filter((r) => r.subject_id === idea.slug),
      );
      const sp = idea.currentSprintId ? sprintMap.get(idea.currentSprintId) : undefined;
      const sprintEndsInMs = sp ? Math.max(0, Date.parse(sp.ends_at) - Date.now()) : undefined;
      const card: IdeaFeedCard = {
        id: idea.id,
        slug: idea.slug,
        thesis: idea.thesis,
        whyNow: idea.whyNow,
        tags: idea.tags,
        stack: idea.stack,
        phase: idea.phase,
        authorHandle: author?.handle ?? "builder",
        authorDepth: author?.depth_score ?? 0.5,
        linkedRepoIds: idea.linkedRepoIds,
        tally: {
          use: tally.use,
          build: tally.build,
          buy: tally.buy,
          invest: tally.invest,
          conviction: tally.conviction,
          uniqueBuilders: tally.uniqueBuilders,
        },
        sprintEndsInMs,
        commitsThisSprint: sp?.actual_commits,
        createdAt: idea.createdAt,
      };
      return card;
    });

    // App-side sort for hot + resolving (PostgREST can't compute conviction).
    if (q.sort === "hot") {
      const now = Date.now();
      cards.sort((a, b) => hotScore(b, now) - hotScore(a, now));
    } else if (q.sort === "resolving") {
      cards.sort(
        (a, b) => (a.sprintEndsInMs ?? Infinity) - (b.sprintEndsInMs ?? Infinity),
      );
    }

    return cards;
  }

  async createIdea(i: Idea): Promise<void> {
    await insertRows(this.env, T.ideas, ideaToRow(i), { returning: "minimal" });
  }

  async updateIdea(slugOrId: string, patch: Partial<Idea>): Promise<Idea | null> {
    const existing = await this.getIdea(slugOrId);
    if (!existing) return null;
    const updated: Idea = {
      ...existing,
      ...patch,
      id: existing.id,
      slug: existing.slug,
      updatedAt: new Date().toISOString(),
    };
    const rows = await updateRows<IdeaRow>(
      this.env,
      T.ideas,
      { id: `eq.${existing.id}` },
      ideaToRow(updated),
    );
    return rows[0] ? ideaFromRow(rows[0]) : null;
  }

  async ideasByRepoId(repoId: string, limit = 6): Promise<IdeaFeedCard[]> {
    const rows = await selectRows<IdeaRow>(this.env, T.ideas, {
      public: "eq.true",
      linked_repo_ids: `cs.["${repoId}"]`,
      order: "created_at.desc",
      limit: String(limit),
    });
    if (rows.length === 0) return [];
    const reactions = await selectRows<ReactionRow>(this.env, T.reactions, {
      subject_type: "eq.idea",
      subject_id: `in.(${rows.map((r) => r.slug).join(",")})`,
    });
    return rows.map((row) => {
      const idea = ideaFromRow(row);
      const tally = tallyFromReactions(reactions.filter((r) => r.subject_id === idea.slug));
      return {
        id: idea.id,
        slug: idea.slug,
        thesis: idea.thesis,
        whyNow: idea.whyNow,
        tags: idea.tags,
        stack: idea.stack,
        phase: idea.phase,
        authorHandle: "builder",
        authorDepth: 0.5,
        linkedRepoIds: idea.linkedRepoIds,
        tally: {
          use: tally.use,
          build: tally.build,
          buy: tally.buy,
          invest: tally.invest,
          conviction: tally.conviction,
          uniqueBuilders: tally.uniqueBuilders,
        },
        createdAt: idea.createdAt,
      } as IdeaFeedCard;
    });
  }

  // ---- Reactions ---------------------------------------------------------
  async addReaction(r: Reaction): Promise<void> {
    await insertRows(this.env, T.reactions, reactionToRow(r), {
      onConflict: "builder_id,kind,subject_type,subject_id",
      returning: "minimal",
    });
  }

  async removeReaction(reactionId: string, builderId: string): Promise<boolean> {
    const n = await deleteRows(this.env, T.reactions, {
      id: `eq.${reactionId}`,
      builder_id: `eq.${builderId}`,
    });
    return n > 0;
  }

  async getReactions(
    subjectType: "repo" | "idea",
    subjectId: string,
  ): Promise<Reaction[]> {
    const rows = await selectRows<ReactionRow>(this.env, T.reactions, {
      subject_type: `eq.${subjectType}`,
      subject_id: `eq.${subjectId}`,
      order: "created_at.desc",
    });
    return rows.map(reactionFromRow);
  }

  async getTally(
    subjectType: "repo" | "idea",
    subjectId: string,
  ): Promise<ReactionTally> {
    const rows = await selectRows<ReactionRow>(this.env, T.reactions, {
      subject_type: `eq.${subjectType}`,
      subject_id: `eq.${subjectId}`,
    });
    const t = tallyFromReactions(rows);
    return {
      subjectType,
      subjectId,
      use: t.use,
      build: t.build,
      buy: t.buy,
      invest: t.invest,
      conviction: t.conviction,
      uniqueBuilders: t.uniqueBuilders,
      topPayloads: t.topPayloads,
      updatedAt: new Date().toISOString(),
    };
  }

  async reactionsByBuilder(builderId: string, limit = 100): Promise<Reaction[]> {
    const rows = await selectRows<ReactionRow>(this.env, T.reactions, {
      builder_id: `eq.${builderId}`,
      order: "created_at.desc",
      limit: String(limit),
    });
    return rows.map(reactionFromRow);
  }

  // ---- Sprints -----------------------------------------------------------
  async getSprint(id: string): Promise<Sprint | null> {
    const rows = await selectRows<SprintRow>(this.env, T.sprints, {
      id: `eq.${id}`,
      limit: "1",
    });
    return rows[0] ? sprintFromRow(rows[0]) : null;
  }

  async upsertSprint(sp: Sprint): Promise<void> {
    await insertRows(this.env, T.sprints, sprintToRow(sp), {
      onConflict: "id",
      returning: "minimal",
    });
  }

  async sprintsByIdea(ideaId: string): Promise<Sprint[]> {
    const rows = await selectRows<SprintRow>(this.env, T.sprints, {
      idea_id: `eq.${ideaId}`,
      order: "starts_at.asc",
    });
    return rows.map(sprintFromRow);
  }

  // ---- Predictions -------------------------------------------------------
  async getPrediction(id: string): Promise<Prediction | null> {
    const rows = await selectRows<PredictionRow>(this.env, T.predictions, {
      id: `eq.${id}`,
      limit: "1",
    });
    return rows[0] ? predictionFromRow(rows[0]) : null;
  }

  async upsertPrediction(p: Prediction): Promise<void> {
    await insertRows(this.env, T.predictions, predictionToRow(p), {
      onConflict: "id",
      returning: "minimal",
    });
  }

  async predictionsForSubject(
    subjectType: Prediction["subjectType"],
    subjectId: string,
  ): Promise<Prediction[]> {
    const rows = await selectRows<PredictionRow>(this.env, T.predictions, {
      subject_type: `eq.${subjectType}`,
      subject_id: `eq.${subjectId}`,
      order: "opened_at.asc",
    });
    return rows.map(predictionFromRow);
  }
}

// -- shared tally + hot-score helpers ---------------------------------------

function tallyFromReactions(rs: ReactionRow[]): {
  use: number;
  build: number;
  buy: number;
  invest: number;
  conviction: number;
  uniqueBuilders: number;
  topPayloads: ReactionTally["topPayloads"];
} {
  const counts = { use: 0, build: 0, buy: 0, invest: 0 };
  const builders = new Set<string>();
  const topPayloads: ReactionTally["topPayloads"] = {
    use: [],
    build: [],
    buy: [],
    invest: [],
  };
  for (const r of rs) {
    counts[r.kind] += 1;
    builders.add(r.builder_id);
    const text = reactionRowText(r);
    if (text) {
      topPayloads[r.kind].push({
        builderId: r.builder_id,
        text,
        createdAt: r.created_at,
      });
    }
  }
  (Object.keys(topPayloads) as ReactionKind[]).forEach((k) => {
    topPayloads[k].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    topPayloads[k] = topPayloads[k].slice(0, 3);
  });
  const uniqueBuilders = builders.size;
  const conviction = (counts.build + 2 * counts.invest) / Math.max(uniqueBuilders, 1);
  return { ...counts, conviction, uniqueBuilders, topPayloads };
}

function reactionRowText(r: ReactionRow): string | null {
  const p = r.payload;
  switch (r.kind) {
    case "use":
      return p.useCase?.trim() || null;
    case "build":
      return p.buildThesis?.trim() || null;
    case "buy":
      return p.priceUsd != null ? `$${p.priceUsd}` : null;
    case "invest":
      return r.public_invest && p.amountUsd != null
        ? `$${p.amountUsd}${p.horizonYears ? ` / ${p.horizonYears}y` : ""}`
        : null;
  }
}

function hotScore(card: IdeaFeedCard, now: number): number {
  const ageH = (now - Date.parse(card.createdAt)) / 3_600_000;
  const recency = Math.exp(-ageH / 48);
  const conviction = card.tally.conviction;
  const depth = card.authorDepth;
  return (
    0.35 * recency +
    0.35 * Math.tanh(conviction) +
    0.15 * depth +
    0.15 * recency
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _store: BuilderStore | null = null;

/**
 * Select the store implementation based on env:
 *   • BUILDER_STORE=supabase + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → Supabase
 *   • otherwise → JSON (under BUILDER_DATA_DIR || STARSCREENER_DATA_DIR || ./data)
 */
export function getBuilderStore(): BuilderStore {
  if (_store) return _store;

  const mode = process.env.BUILDER_STORE ?? "json";
  if (mode === "supabase") {
    const env = readSupabaseEnv();
    if (env) {
      _store = new SupabaseBuilderStore(env);
      return _store;
    }
    // Fall through to JSON if env is incomplete — log once for operator visibility.
    console.warn(
      "[builder/store] BUILDER_STORE=supabase but SUPABASE_URL / SUPABASE_SECRET_KEY missing; falling back to JSON.",
    );
  }

  const dataDir =
    process.env.BUILDER_DATA_DIR ??
    process.env.STARSCREENER_DATA_DIR ??
    path.resolve(process.cwd(), "data");
  _store = new JsonBuilderStore(dataDir);
  return _store;
}

/** Reset — test-only. */
export function _resetBuilderStoreForTests(): void {
  _store = null;
}
