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

import type { Repo, SocialPlatform } from "../../types";
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
import { normalizeUrl } from "../adapters/normalizer";

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

/**
 * Binary-insert `item` into a newest-first sorted array by `postedAt`.
 * Replaces the `arr.push(item); arr.sort(...)` pattern, dropping the
 * dominant cost from O(N log N) to O(log N) lookup + O(N) splice.
 *
 * Caller is responsible for ensuring the array is already sorted
 * newest-first by ISO `postedAt`. Mutates `arr` in place.
 *
 * Used by InMemoryMentionStore.append (LIB-10).
 */
function insertMentionSortedDesc(
  arr: { postedAt: string }[],
  item: { postedAt: string },
): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    // Newest-first ordering: if arr[mid] is OLDER than item, item goes
    // before arr[mid]; otherwise after. ISO 8601 lex compare is correct.
    if (arr[mid].postedAt < item.postedAt) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  arr.splice(lo, 0, item);
  return lo;
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
    // LIB-05: scan for a dupe before allocating a filtered copy. The vast
    // majority of appends are unique (snapshots are time-sequenced); the
    // old `existing.filter(...)` allocated a new array on every call.
    let dupeIndex = -1;
    for (let i = 0; i < existing.length; i++) {
      if (existing[i].id === snapshot.id) {
        dupeIndex = i;
        break;
      }
    }
    let working: RepoSnapshot[];
    if (dupeIndex >= 0) {
      // Replace in place to keep the array structurally simple — slice off
      // the dupe and rebuild only when we have to.
      working = existing.slice();
      working.splice(dupeIndex, 1);
      working.push(snapshot);
    } else {
      // Hot path: clone the existing array, push, sort. Avoids mutating
      // the array a list() consumer might still hold a reference to.
      working = existing.slice();
      working.push(snapshot);
    }
    working.sort((a, b) => descByIso(a.capturedAt, b.capturedAt));
    // Enforce retention cap — slice keeps newest N, drops the oldest tail.
    const capped =
      working.length > SNAPSHOT_HISTORY_CAP
        ? working.slice(0, SNAPSHOT_HISTORY_CAP)
        : working;
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
 * Opaque cursor for `listForRepoPaginated`. Clients receive the base64url
 * encoding via the API; the shape is internal to the store + the API route
 * that wraps it. Cursor is exclusive: rows strictly BEFORE this coordinate
 * (in (postedAt desc, id desc) order) are returned on the next page.
 */
export interface MentionPageCursor {
  postedAt: string;
  id: string;
}

/**
 * Options for `listForRepoPaginated`. `limit` is capped by the store to a
 * safe upper bound regardless of what the caller asks for — see
 * `MENTION_PAGE_MAX_LIMIT`.
 */
export interface MentionListOptions {
  /** Filter down to a single platform, matching `RepoMention.platform`. */
  source?: SocialPlatform;
  /** Exclusive lower bound (newer-than-cursor excluded) on (postedAt desc, id desc). */
  cursor?: MentionPageCursor;
  /** Default 50, hard-capped at MENTION_PAGE_MAX_LIMIT. */
  limit?: number;
}

export interface MentionListPage {
  items: RepoMention[];
  /** Cursor for the next page, or null when no more rows exist. */
  nextCursor: MentionPageCursor | null;
}

export const MENTION_PAGE_DEFAULT_LIMIT = 50;
export const MENTION_PAGE_MAX_LIMIT = 200;

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
    // Fill normalizedUrl at the store boundary when the adapter didn't set
    // it. Using `in` guards against accidental overwrite of an explicit
    // `null` that an adapter may have set to record "url was unparseable".
    let incoming: RepoMention = mention;
    if (!("normalizedUrl" in mention) && mention.url) {
      incoming = { ...mention, normalizedUrl: normalizeUrl(mention.url) };
    }

    const existing = this.byRepo.get(incoming.repoId) ?? [];

    // Dedup priority:
    //   1. Same `id` — treat as an update and replace in place. Same id is
    //      by definition the same row; an adapter re-ingesting the same
    //      item (e.g. an HN story with refreshed engagement counts) should
    //      see its newer payload land. This preserves prior behaviour.
    //   2. If `normalizedUrl` is set AND no id match was found, skip when
    //      an existing row for this repo has the same normalizedUrl. This
    //      collapses tracking-param + trailing-slash + www. variants across
    //      sources (e.g. HN link and Reddit link to the same GitHub page).
    // LIB-10: Path 1 (id match) and Path 3 (new mention) both used to
    // .push() then .sort() the entire array — O(M log M) per append.
    // Replaced with binary-insertion: O(log M) lookup + O(M) splice.
    // The URL-dedup .find() in Path 2 is still O(M); a per-repo
    // Map<normalizedUrl, RepoMention> index would make it O(1) but
    // requires more sync surface. Left as a follow-up — most repos
    // see normalizedUrl set on a small fraction of mentions.

    const idIndex = existing.findIndex((m) => m.id === incoming.id);
    if (idIndex >= 0) {
      // Path 1: id match → splice out old, binary-insert at new position.
      // postedAt could have shifted (engagement-refresh re-ingest), so we
      // can't just replace in-place and trust the sort to still hold.
      const next = existing.slice();
      next.splice(idIndex, 1);
      insertMentionSortedDesc(next, incoming);
      this.byRepo.set(incoming.repoId, next);
      this.markDirty();
      notifyMutation();
      return;
    }

    if (incoming.normalizedUrl) {
      const urlDup = existing.find(
        (m) => m.normalizedUrl && m.normalizedUrl === incoming.normalizedUrl,
      );
      if (urlDup) {
        // Different id, same canonical URL → cross-source duplicate. Skip.
        // First write wins; if adapters need to update metadata (engagement,
        // reach) they must flow through a dedicated update path, not append.
        return;
      }
    }

    // Path 3: new mention → clone and binary-insert. No full sort.
    const next = existing.slice();
    insertMentionSortedDesc(next, incoming);
    this.byRepo.set(incoming.repoId, next);
    this.markDirty();
    notifyMutation();
  }

  listForRepo(repoId: string, limit?: number): RepoMention[] {
    const mentions = this.byRepo.get(repoId) ?? [];
    if (limit === undefined) return mentions.slice();
    return mentions.slice(0, Math.max(0, limit));
  }

  /**
   * Paginated read over a repo's mentions, ordered by `(postedAt desc, id desc)`.
   *
   * The in-memory array is already sorted newest-first by postedAt, but ties
   * on postedAt aren't stable across platforms (two adapters can mint the
   * same ISO minute). We resort with a deterministic id tiebreak before
   * applying the cursor + filter so pagination is reproducible across calls
   * even when adapters re-ingest.
   *
   * O(n) walk per call — acceptable while the working set stays well below
   * ~10k mentions per repo. If we ever see a hot repo blow past that, swap
   * in a per-repo sorted index keyed on (postedAt, id).
   */
  listForRepoPaginated(
    repoId: string,
    opts: MentionListOptions = {},
  ): MentionListPage {
    const all = this.byRepo.get(repoId);
    if (!all || all.length === 0) {
      return { items: [], nextCursor: null };
    }

    const limit = Math.max(
      1,
      Math.min(opts.limit ?? MENTION_PAGE_DEFAULT_LIMIT, MENTION_PAGE_MAX_LIMIT),
    );

    // Copy + sort by (postedAt desc, id desc) for deterministic ordering.
    // The store's internal array sorts by postedAt only, so a second-level
    // id sort is required for pagination stability.
    const sorted = all.slice().sort((a, b) => {
      if (a.postedAt < b.postedAt) return 1;
      if (a.postedAt > b.postedAt) return -1;
      if (a.id < b.id) return 1;
      if (a.id > b.id) return -1;
      return 0;
    });

    // Apply source filter.
    const filtered = opts.source
      ? sorted.filter((m) => m.platform === opts.source)
      : sorted;

    // Apply exclusive cursor: keep rows strictly less than (postedAt, id).
    const cursor = opts.cursor;
    const afterCursor = cursor
      ? filtered.filter((m) => {
          if (m.postedAt < cursor.postedAt) return true;
          if (m.postedAt > cursor.postedAt) return false;
          // postedAt tie → compare id desc
          return m.id < cursor.id;
        })
      : filtered;

    const items = afterCursor.slice(0, limit);
    const nextCursor: MentionPageCursor | null =
      items.length === limit && items.length > 0
        ? { postedAt: items[items.length - 1].postedAt, id: items[items.length - 1].id }
        : null;

    return { items, nextCursor };
  }

  aggregateForRepo(repoId: string): SocialAggregate | undefined {
    return this.aggregates.get(repoId);
  }

  saveAggregate(agg: SocialAggregate): void {
    this.aggregates.set(agg.repoId, agg);
    this.markDirty();
    notifyMutation();
  }

  /**
   * Move every mention currently keyed under `oldRepoId` to `newRepoId`.
   *
   * Called by the ingest path when a GitHub repo rename produces a new
   * derived repoId (e.g. "vercel--next" → "vercel--next-js"). Without this,
   * mention history orphans under the stale key forever — see audit F8.
   *
   * Behaviour:
   *  - No-op when oldRepoId === newRepoId or when oldRepoId has no mentions.
   *  - When newRepoId already has mentions, merges the two arrays and dedupes
   *    by id (newer / incoming row wins) so the renamed key carries the union
   *    of history. Resulting array stays sorted newest-first by postedAt.
   */
  reassociate(oldRepoId: string, newRepoId: string): void {
    if (oldRepoId === newRepoId) return;
    const oldMentions = this.byRepo.get(oldRepoId);
    if (!oldMentions) return;

    // Rewrite each row's repoId so a downstream persist() emits the correct
    // foreign key. Mutating in place is safe — the array was owned by the
    // map slot we're about to delete.
    for (const m of oldMentions) {
      m.repoId = newRepoId;
    }

    const existing = this.byRepo.get(newRepoId);
    if (!existing || existing.length === 0) {
      this.byRepo.set(newRepoId, oldMentions);
    } else {
      // Merge: incoming (oldMentions, just-rewritten) wins on id collisions.
      // Build an id index of the incoming set, drop colliding rows from the
      // existing set, then binary-insert each surviving incoming row into
      // the existing array to preserve newest-first postedAt ordering.
      const incomingIds = new Set(oldMentions.map((m) => m.id));
      const merged = existing.filter((m) => !incomingIds.has(m.id));
      for (const m of oldMentions) {
        insertMentionSortedDesc(merged, m);
      }
      this.byRepo.set(newRepoId, merged);
    }

    this.byRepo.delete(oldRepoId);
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
    this.byId.clear();
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
    this.byId.clear();
    const items = await readJsonlFile<AlertEvent>(FILES.alertEvents);
    for (const item of items) {
      this.byId.set(item.id, item);
    }
    this.dirty = false;
  }
}
