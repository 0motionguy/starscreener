// PLAN_ONLY (LIB-07) — this file is intent-only, not runnable.
//
// StarScreener DB — Postgres store scaffolds.
//
// **WARNING:** every method here throws `NOT_IMPLEMENTED`. Nothing in
// production calls these classes; they exist purely to document the
// swap-from-JSONL-to-Postgres path so a future migration has a
// concrete interface to fill in. Operators reading this file should
// NOT assume the in-memory pipeline is "almost on Postgres" — the
// actual data layer is the JSONL + Redis path under
// src/lib/pipeline/storage/.
//
// When (if) the time comes:
//   1. `npm install drizzle-orm drizzle-kit postgres`
//   2. Import `db` from `./client` (create a thin wrapper over `postgres`)
//   3. Replace each `throw NOT_IMPLEMENTED` with a Drizzle query backed by
//      the schema in `./schema.ts`.
//   4. Swap the InMemoryX singletons in `src/lib/pipeline/storage/singleton.ts`
//      for their Postgres counterparts, gated on `process.env.DATABASE_URL`.
//
// See `docs/DATABASE.md` for the full playbook.

/* eslint-disable @typescript-eslint/no-unused-vars */

import type { Repo } from "../types";
import type {
  AlertEvent,
  AlertEventStore,
  AlertRule,
  AlertRuleStore,
  CategoryStore,
  MentionStore,
  ReasonStore,
  RepoCategory,
  RepoMention,
  RepoReason,
  RepoScore,
  RepoSnapshot,
  RepoStore,
  ScoreStore,
  SnapshotStore,
  SocialAggregate,
} from "../pipeline/types";

const NOT_IMPLEMENTED = new Error(
  "PostgresStore is a scaffold — not implemented. See docs/DATABASE.md.",
);

// ---------------------------------------------------------------------------
// RepoStore
// ---------------------------------------------------------------------------

export class PostgresRepoStore implements RepoStore {
  upsert(_repo: Repo): void {
    throw NOT_IMPLEMENTED;
  }
  get(_repoId: string): Repo | undefined {
    throw NOT_IMPLEMENTED;
  }
  getAll(): Repo[] {
    throw NOT_IMPLEMENTED;
  }
  getActive(): Repo[] {
    throw NOT_IMPLEMENTED;
  }
  getByFullName(_fullName: string): Repo | undefined {
    throw NOT_IMPLEMENTED;
  }
}

// ---------------------------------------------------------------------------
// SnapshotStore
// ---------------------------------------------------------------------------

export class PostgresSnapshotStore implements SnapshotStore {
  append(_snapshot: RepoSnapshot): void {
    throw NOT_IMPLEMENTED;
  }
  list(_repoId: string, _limit?: number): RepoSnapshot[] {
    throw NOT_IMPLEMENTED;
  }
  getAt(_repoId: string, _atOrBefore: string): RepoSnapshot | undefined {
    throw NOT_IMPLEMENTED;
  }
  getLatest(_repoId: string): RepoSnapshot | undefined {
    throw NOT_IMPLEMENTED;
  }
  clear(_repoId?: string): void {
    throw NOT_IMPLEMENTED;
  }
  totalCount(): number {
    throw NOT_IMPLEMENTED;
  }
}

// ---------------------------------------------------------------------------
// ScoreStore
// ---------------------------------------------------------------------------

export class PostgresScoreStore implements ScoreStore {
  save(_score: RepoScore): void {
    throw NOT_IMPLEMENTED;
  }
  get(_repoId: string): RepoScore | undefined {
    throw NOT_IMPLEMENTED;
  }
  getAll(): RepoScore[] {
    throw NOT_IMPLEMENTED;
  }
}

// ---------------------------------------------------------------------------
// CategoryStore
// ---------------------------------------------------------------------------

export class PostgresCategoryStore implements CategoryStore {
  save(_classification: RepoCategory): void {
    throw NOT_IMPLEMENTED;
  }
  get(_repoId: string): RepoCategory | undefined {
    throw NOT_IMPLEMENTED;
  }
  getAll(): RepoCategory[] {
    throw NOT_IMPLEMENTED;
  }
}

// ---------------------------------------------------------------------------
// ReasonStore
// ---------------------------------------------------------------------------

export class PostgresReasonStore implements ReasonStore {
  save(_reasons: RepoReason): void {
    throw NOT_IMPLEMENTED;
  }
  get(_repoId: string): RepoReason | undefined {
    throw NOT_IMPLEMENTED;
  }
}

// ---------------------------------------------------------------------------
// MentionStore
// ---------------------------------------------------------------------------

export class PostgresMentionStore implements MentionStore {
  append(_mention: RepoMention): void {
    throw NOT_IMPLEMENTED;
  }
  listForRepo(_repoId: string, _limit?: number): RepoMention[] {
    throw NOT_IMPLEMENTED;
  }
  aggregateForRepo(_repoId: string): SocialAggregate | undefined {
    throw NOT_IMPLEMENTED;
  }
  saveAggregate(_agg: SocialAggregate): void {
    throw NOT_IMPLEMENTED;
  }
  reassociate(_oldRepoId: string, _newRepoId: string): void {
    throw NOT_IMPLEMENTED;
  }
}

// ---------------------------------------------------------------------------
// AlertRuleStore
// ---------------------------------------------------------------------------

export class PostgresAlertRuleStore implements AlertRuleStore {
  save(_rule: AlertRule): AlertRule {
    throw NOT_IMPLEMENTED;
  }
  remove(_id: string): boolean {
    throw NOT_IMPLEMENTED;
  }
  listForUser(_userId: string): AlertRule[] {
    throw NOT_IMPLEMENTED;
  }
  listAll(): AlertRule[] {
    throw NOT_IMPLEMENTED;
  }
}

// ---------------------------------------------------------------------------
// AlertEventStore
// ---------------------------------------------------------------------------

export class PostgresAlertEventStore implements AlertEventStore {
  append(_event: AlertEvent): void {
    throw NOT_IMPLEMENTED;
  }
  listForUser(_userId: string, _unreadOnly?: boolean): AlertEvent[] {
    throw NOT_IMPLEMENTED;
  }
  markRead(_id: string): void {
    throw NOT_IMPLEMENTED;
  }
}
