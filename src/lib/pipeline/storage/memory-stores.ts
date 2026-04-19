// StarScreener Pipeline — in-memory store implementations
//
// These implement the storage interfaces defined in `../types.ts`. Each store
// wraps a Map for O(1) lookup by primary key and keeps listings sorted
// newest-first. State lives in memory for fast reads; `persist()` / `hydrate()`
// now read/write JSONL files via `file-persistence.ts` so a restarted server
// can resume exactly where the previous process left off.
//
// Each mutator invokes a module-level persistence hook (`onStoreMutation`)
// after marking dirty so the singleton layer can debounce disk writes without
// every call site having to remember. Tests leave the hook unset (no-op).

import type { Repo } from "../../types";
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
} from "../types";
import {
  FILES,
  readJsonlFile,
  writeJsonlFile,
} from "./file-persistence";

// ---------------------------------------------------------------------------
// Shared mutation hook — singleton layer wires this up to debounce persists.
// ---------------------------------------------------------------------------

type MutationHook = () => void;

let onStoreMutation: MutationHook | null = null;

/**
 * Install a callback that every store mutator fires after marking dirty.
 * The singleton module uses this to schedule a debounced flush. Tests can
 * leave it unset — stores still mark dirty and `persistIfDirty()` still
 * writes on explicit flushes.
 */
export function setStoreMutationHook(hook: MutationHook | null): void {
  onStoreMutation = hook;
}

/** Invoke the hook, if one is installed. Safe to call from hot paths. */
function notifyMutation(): void {
  if (onStoreMutation) onStoreMutation();
}

// ---------------------------------------------------------------------------
// Snapshot retention policy
// ---------------------------------------------------------------------------

/**
 * Maximum snapshots retained per repo in memory.
 *
 * ~30 days at 6h ingestion cadence. On append, the oldest snapshots beyond
 * this cap are silently dropped so the working set stays bounded even after
 * years of recompute cycles. If you need longer history, increase this cap
 * or swap to the durable DB (see `docs/DATABASE.md`).
 */
export const SNAPSHOT_HISTORY_CAP = 120;

// ---------------------------------------------------------------------------
// Utility — compare two ISO timestamps descending (newest first).
// ---------------------------------------------------------------------------

function descByIso(a: string, b: string): number {
  // Lexicographic comparison works on ISO 8601 strings.
  if (a < b) return 1;
  if (a > b) return -1;
  return 0;
}

// ---------------------------------------------------------------------------
// RepoStore
// ---------------------------------------------------------------------------

/** In-memory repo store keyed by repo id. */
export class InMemoryRepoStore implements RepoStore {
  private byId = new Map<string, Repo>();
  private byFullName = new Map<string, string>(); // fullName -> id
  private dirty = false;

  upsert(repo: Repo): void {
    // Rename detection: if the same id already exists under a different
    // fullName, drop the stale byFullName key before writing the new one.
    // Without this, GitHub repo renames (e.g. vercel/next -> vercel/next.js)
    // leave an orphan lookup that can return a different repo later.
    const prior = this.byId.get(repo.id);
    if (prior && prior.fullName !== repo.fullName) {
      this.byFullName.delete(prior.fullName);
    }
    this.byId.set(repo.id, repo);
    this.byFullName.set(repo.fullName, repo.id);
    this.markDirty();
    notifyMutation();
  }

  get(repoId: string): Repo | undefined {
    return this.byId.get(repoId);
  }

  getAll(): Repo[] {
    return Array.from(this.byId.values());
  }

  /**
   * Repos not flagged `deleted`. Use for user-facing queries; use `getAll()`
   * for operational paths (cleanup, scheduler) that need to see tombstones.
   */
  getActive(): Repo[] {
    const out: Repo[] = [];
    for (const repo of this.byId.values()) {
      if (repo.deleted !== true) out.push(repo);
    }
    return out;
  }

  getByFullName(fullName: string): Repo | undefined {
    const id = this.byFullName.get(fullName);
    return id ? this.byId.get(id) : undefined;
  }

  /** Mark the store as having unwritten changes. */
  markDirty(): void {
    this.dirty = true;
  }

  /** Flush to disk only if there are unsaved changes. */
  async persistIfDirty(): Promise<void> {
    if (!this.dirty) return;
    await this.persist();
  }

  /** Write the full set of repos to disk. */
  async persist(): Promise<void> {
    await writeJsonlFile<Repo>(FILES.repos, Array.from(this.byId.values()));
    this.dirty = false;
  }

  /** Replay a persisted JSONL file into the in-memory Map. */
  async hydrate(): Promise<void> {
    const items = await readJsonlFile<Repo>(FILES.repos);
    for (const item of items) {
      this.byId.set(item.id, item);
      this.byFullName.set(item.fullName, item.id);
    }
    this.dirty = false;
  }
}

// ---------------------------------------------------------------------------
// SnapshotStore
// ---------------------------------------------------------------------------

/**
 * In-memory snapshot store keyed by repoId.
 *
 * Each repo has its own array of snapshots kept sorted newest-first so list()
 * and getLatest() are O(1) for the common "most recent" cases. The per-repo
 * array is capped at `SNAPSHOT_HISTORY_CAP`; once the cap is exceeded the
 * oldest entries are evicted on the next append.
 */
export class InMemorySnapshotStore implements SnapshotStore {
  private byRepo = new Map<string, RepoSnapshot[]>();
  private dirty = false;
  // Running total across every repo, maintained in O(1) by append/clear so
  // callers (e.g. /api/pipeline/status) don't need an O(N*M) walk. See
  // Phase 2 P-114 (F-PERF-001).
  private countTotal = 0;

  append(snapshot: RepoSnapshot): void {
    const existing = this.byRepo.get(snapshot.repoId) ?? [];
    const prevLen = existing.length;
    // Guard against duplicate ids for the same capturedAt.
    const withoutDupe = existing.filter((s) => s.id !== snapshot.id);
    withoutDupe.push(snapshot);
    withoutDupe.sort((a, b) => descByIso(a.capturedAt, b.capturedAt));
    // Enforce retention cap — slice keeps newest N, drops the oldest tail.
    const capped =
      withoutDupe.length > SNAPSHOT_HISTORY_CAP
        ? withoutDupe.slice(0, SNAPSHOT_HISTORY_CAP)
        : withoutDupe;
    this.byRepo.set(snapshot.repoId, capped);
    this.countTotal += capped.length - prevLen;
    this.markDirty();
    notifyMutation();
  }

  list(repoId: string, limit?: number): RepoSnapshot[] {
    const snaps = this.byRepo.get(repoId) ?? [];
    if (limit === undefined) return snaps.slice();
    return snaps.slice(0, Math.max(0, limit));
  }

  getAt(repoId: string, atOrBefore: string): RepoSnapshot | undefined {
    const snaps = this.byRepo.get(repoId);
    if (!snaps || snaps.length === 0) return undefined;
    // Snaps are sorted newest-first; find the first whose capturedAt <= atOrBefore.
    for (const s of snaps) {
      if (s.capturedAt <= atOrBefore) return s;
    }
    return undefined;
  }

  getLatest(repoId: string): RepoSnapshot | undefined {
    const snaps = this.byRepo.get(repoId);
    return snaps && snaps.length > 0 ? snaps[0] : undefined;
  }

  clear(repoId?: string): void {
    if (repoId === undefined) {
      this.byRepo.clear();
      this.countTotal = 0;
    } else {
      const existing = this.byRepo.get(repoId);
      if (existing) {
        this.countTotal -= existing.length;
        this.byRepo.delete(repoId);
      }
    }
    this.markDirty();
    notifyMutation();
  }

  totalCount(): number {
    return this.countTotal;
  }

  markDirty(): void {
    this.dirty = true;
  }

  async persistIfDirty(): Promise<void> {
    if (!this.dirty) return;
    await this.persist();
  }

  async persist(): Promise<void> {
    const flat: RepoSnapshot[] = [];
    for (const snaps of this.byRepo.values()) {
      for (const s of snaps) flat.push(s);
    }
    await writeJsonlFile<RepoSnapshot>(FILES.snapshots, flat);
    this.dirty = false;
  }

  async hydrate(): Promise<void> {
    const items = await readJsonlFile<RepoSnapshot>(FILES.snapshots);
    let migrated = 0;
    for (const item of items) {
      // Legacy IDs were `${repoId}:${capturedAt}` — missing the `:source`
      // suffix that disambiguates snapshots captured at the same ms from
      // different sources (e.g. github + mock during mock-replay testing).
      // Rewrite on load and mark dirty so the next persist flushes the
      // upgraded shape.
      const expectedSuffix = `:${item.source}`;
      if (!item.id.endsWith(expectedSuffix)) {
        item.id = `${item.repoId}:${item.capturedAt}:${item.source}`;
        migrated += 1;
      }
      this.append(item);
    }
    if (migrated > 0) {
      console.info(
        `[snapshot-store] migrated ${migrated} legacy snapshot ids to composite shape`,
      );
      this.dirty = true;
    } else {
      this.dirty = false;
    }
  }
}

// ---------------------------------------------------------------------------
// ScoreStore
// ---------------------------------------------------------------------------

/** In-memory score store keyed by repoId; holds only the latest score per repo. */
export class InMemoryScoreStore implements ScoreStore {
  private byRepo = new Map<string, RepoScore>();
  private dirty = false;

  save(score: RepoScore): void {
    this.byRepo.set(score.repoId, score);
    this.markDirty();
    notifyMutation();
  }

  get(repoId: string): RepoScore | undefined {
    return this.byRepo.get(repoId);
  }

  getAll(): RepoScore[] {
    return Array.from(this.byRepo.values()).sort((a, b) =>
      descByIso(a.computedAt, b.computedAt),
    );
  }

  markDirty(): void {
    this.dirty = true;
  }

  async persistIfDirty(): Promise<void> {
    if (!this.dirty) return;
    await this.persist();
  }

  async persist(): Promise<void> {
    await writeJsonlFile<RepoScore>(
      FILES.scores,
      Array.from(this.byRepo.values()),
    );
    this.dirty = false;
  }

  async hydrate(): Promise<void> {
    const items = await readJsonlFile<RepoScore>(FILES.scores);
    for (const item of items) this.save(item);
    this.dirty = false;
  }
}

// ---------------------------------------------------------------------------
// CategoryStore
// ---------------------------------------------------------------------------

/** In-memory category-classification store keyed by repoId. */
export class InMemoryCategoryStore implements CategoryStore {
  private byRepo = new Map<string, RepoCategory>();
  private dirty = false;

  save(classification: RepoCategory): void {
    this.byRepo.set(classification.repoId, classification);
    this.markDirty();
    notifyMutation();
  }

  get(repoId: string): RepoCategory | undefined {
    return this.byRepo.get(repoId);
  }

  getAll(): RepoCategory[] {
    return Array.from(this.byRepo.values()).sort((a, b) =>
      descByIso(a.classifiedAt, b.classifiedAt),
    );
  }

  markDirty(): void {
    this.dirty = true;
  }

  async persistIfDirty(): Promise<void> {
    if (!this.dirty) return;
    await this.persist();
  }

  async persist(): Promise<void> {
    await writeJsonlFile<RepoCategory>(
      FILES.categories,
      Array.from(this.byRepo.values()),
    );
    this.dirty = false;
  }

  async hydrate(): Promise<void> {
    const items = await readJsonlFile<RepoCategory>(FILES.categories);
    for (const item of items) this.save(item);
    this.dirty = false;
  }
}

// ---------------------------------------------------------------------------
// ReasonStore
// ---------------------------------------------------------------------------

/** In-memory reasons store keyed by repoId; holds the latest reason bundle per repo. */
export class InMemoryReasonStore implements ReasonStore {
  private byRepo = new Map<string, RepoReason>();
  private dirty = false;

  save(reasons: RepoReason): void {
    this.byRepo.set(reasons.repoId, reasons);
    this.markDirty();
    notifyMutation();
  }

  get(repoId: string): RepoReason | undefined {
    return this.byRepo.get(repoId);
  }

  markDirty(): void {
    this.dirty = true;
  }

  async persistIfDirty(): Promise<void> {
    if (!this.dirty) return;
    await this.persist();
  }

  async persist(): Promise<void> {
    await writeJsonlFile<RepoReason>(
      FILES.reasons,
      Array.from(this.byRepo.values()),
    );
    this.dirty = false;
  }

  async hydrate(): Promise<void> {
    const items = await readJsonlFile<RepoReason>(FILES.reasons);
    for (const item of items) this.save(item);
    this.dirty = false;
  }
}

// ---------------------------------------------------------------------------
// MentionStore
// ---------------------------------------------------------------------------

/**
 * In-memory mention store keyed by repoId.
 *
 * Mentions are kept sorted newest-first. Aggregates are stored separately
 * keyed by repoId, upserted via saveAggregate(). Persistence uses two files:
 * one for the flat mention list, one for aggregates.
 */
export class InMemoryMentionStore implements MentionStore {
  private byRepo = new Map<string, RepoMention[]>();
  private aggregates = new Map<string, SocialAggregate>();
  private dirty = false;

  append(mention: RepoMention): void {
    const existing = this.byRepo.get(mention.repoId) ?? [];
    const withoutDupe = existing.filter((m) => m.id !== mention.id);
    withoutDupe.push(mention);
    withoutDupe.sort((a, b) => descByIso(a.postedAt, b.postedAt));
    this.byRepo.set(mention.repoId, withoutDupe);
    this.markDirty();
    notifyMutation();
  }

  listForRepo(repoId: string, limit?: number): RepoMention[] {
    const mentions = this.byRepo.get(repoId) ?? [];
    if (limit === undefined) return mentions.slice();
    return mentions.slice(0, Math.max(0, limit));
  }

  aggregateForRepo(repoId: string): SocialAggregate | undefined {
    return this.aggregates.get(repoId);
  }

  saveAggregate(agg: SocialAggregate): void {
    this.aggregates.set(agg.repoId, agg);
    this.markDirty();
    notifyMutation();
  }

  markDirty(): void {
    this.dirty = true;
  }

  async persistIfDirty(): Promise<void> {
    if (!this.dirty) return;
    await this.persist();
  }

  async persist(): Promise<void> {
    const flat: RepoMention[] = [];
    for (const mentions of this.byRepo.values()) {
      for (const m of mentions) flat.push(m);
    }
    await writeJsonlFile<RepoMention>(FILES.mentions, flat);
    await writeJsonlFile<SocialAggregate>(
      FILES.mentionAggregates,
      Array.from(this.aggregates.values()),
    );
    this.dirty = false;
  }

  async hydrate(): Promise<void> {
    const mentions = await readJsonlFile<RepoMention>(FILES.mentions);
    for (const m of mentions) this.append(m);

    const aggs = await readJsonlFile<SocialAggregate>(FILES.mentionAggregates);
    for (const a of aggs) this.aggregates.set(a.repoId, a);
    this.dirty = false;
  }
}

// ---------------------------------------------------------------------------
// AlertRuleStore
// ---------------------------------------------------------------------------

/** In-memory alert rule store keyed by rule id. */
export class InMemoryAlertRuleStore implements AlertRuleStore {
  private byId = new Map<string, AlertRule>();
  private dirty = false;

  save(rule: AlertRule): AlertRule {
    this.byId.set(rule.id, rule);
    this.markDirty();
    notifyMutation();
    return rule;
  }

  remove(id: string): boolean {
    const removed = this.byId.delete(id);
    if (removed) {
      this.markDirty();
      notifyMutation();
    }
    return removed;
  }

  listForUser(userId: string): AlertRule[] {
    return Array.from(this.byId.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => descByIso(a.createdAt, b.createdAt));
  }

  listAll(): AlertRule[] {
    return Array.from(this.byId.values()).sort((a, b) =>
      descByIso(a.createdAt, b.createdAt),
    );
  }

  markDirty(): void {
    this.dirty = true;
  }

  async persistIfDirty(): Promise<void> {
    if (!this.dirty) return;
    await this.persist();
  }

  async persist(): Promise<void> {
    await writeJsonlFile<AlertRule>(
      FILES.alertRules,
      Array.from(this.byId.values()),
    );
    this.dirty = false;
  }

  async hydrate(): Promise<void> {
    const items = await readJsonlFile<AlertRule>(FILES.alertRules);
    for (const item of items) {
      this.byId.set(item.id, item);
    }
    this.dirty = false;
  }
}

// ---------------------------------------------------------------------------
// AlertEventStore
// ---------------------------------------------------------------------------

/** In-memory alert-event store keyed by event id; listings are newest-first. */
export class InMemoryAlertEventStore implements AlertEventStore {
  private byId = new Map<string, AlertEvent>();
  private dirty = false;

  append(event: AlertEvent): void {
    this.byId.set(event.id, event);
    this.markDirty();
    notifyMutation();
  }

  listForUser(userId: string, unreadOnly?: boolean): AlertEvent[] {
    return Array.from(this.byId.values())
      .filter((e) => e.userId === userId && (!unreadOnly || e.readAt === null))
      .sort((a, b) => descByIso(a.firedAt, b.firedAt));
  }

  markRead(id: string): void {
    const existing = this.byId.get(id);
    if (!existing || existing.readAt !== null) return;
    this.byId.set(id, { ...existing, readAt: new Date().toISOString() });
    this.markDirty();
    notifyMutation();
  }

  markDirty(): void {
    this.dirty = true;
  }

  async persistIfDirty(): Promise<void> {
    if (!this.dirty) return;
    await this.persist();
  }

  async persist(): Promise<void> {
    await writeJsonlFile<AlertEvent>(
      FILES.alertEvents,
      Array.from(this.byId.values()),
    );
    this.dirty = false;
  }

  async hydrate(): Promise<void> {
    const items = await readJsonlFile<AlertEvent>(FILES.alertEvents);
    for (const item of items) {
      this.byId.set(item.id, item);
    }
    this.dirty = false;
  }
}
