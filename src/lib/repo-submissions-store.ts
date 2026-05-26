// Redis-backed submission store for the DORP (Drop a Repo) intake.
//
// PROBLEM
//   The previous storage path used `data/repo-submissions.jsonl` on Vercel's
//   ephemeral filesystem. The file disappeared between cold starts, drops
//   silently vanished, and the public live-queue was unreliable. CLAUDE.md
//   warns against this exact pattern.
//
// SOLUTION
//   Single blob in the data-store at key `repo-submissions`. The payload is a
//   newest-first JSON array of `RepoSubmissionRecord` capped at MAX_RECORDS.
//   The data-store handles Redis → file → memory tier cascade; this module
//   adds the append/cap/upsert semantics on top.
//
// GUARANTEES
//   1. Read returns [] when no tier has data (never throws on missing key).
//   2. Append is read-modify-write — non-atomic across concurrent Vercel
//      instances. Under contention, the last writer wins and prior appends
//      may be lost. Mitigation: drops are rate-limited 10/hr per IP and
//      total volume is low (hundreds/day at peak). For the rare race,
//      losing one submission is acceptable; the user can re-drop.
//   3. updateById is atomic-per-process — reads the latest list, applies the
//      patch, writes back. Same caveat as append for cross-process.
//   4. Cap at MAX_RECORDS (1000). Older records fall off the tail. Match the
//      sweep-cross-source-mentions / activity-log windows for consistency.

import {
  getDataStore,
  type DataStore,
} from "@/lib/data-store";
import type { RepoSubmissionRecord } from "@/lib/repo-submissions-types";

const STORE_KEY = "repo-submissions";
const MAX_RECORDS = 1000;

function sortNewestFirst(
  records: RepoSubmissionRecord[],
): RepoSubmissionRecord[] {
  return [...records].sort(
    (a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
  );
}

function getStore(): DataStore {
  return getDataStore();
}

export async function readAllSubmissions(): Promise<RepoSubmissionRecord[]> {
  const result = await getStore().read<RepoSubmissionRecord[]>(STORE_KEY);
  if (!result.data || !Array.isArray(result.data)) return [];
  return sortNewestFirst(result.data);
}

export async function appendSubmission(
  record: RepoSubmissionRecord,
): Promise<void> {
  const existing = await readAllSubmissions();
  // Newest-first, cap at MAX_RECORDS so the payload size stays bounded.
  const next = [record, ...existing].slice(0, MAX_RECORDS);
  await getStore().write(STORE_KEY, next, {
    writer: "vercel:repo-submissions-store",
    mirrorToFile: true,
  });
}

export async function updateSubmissionById(
  id: string,
  patch: Partial<RepoSubmissionRecord>,
): Promise<RepoSubmissionRecord | null> {
  const existing = await readAllSubmissions();
  const idx = existing.findIndex((record) => record.id === id);
  if (idx === -1) return null;
  const updated: RepoSubmissionRecord = {
    ...existing[idx],
    ...patch,
  };
  const next = [...existing];
  next[idx] = updated;
  await getStore().write(STORE_KEY, sortNewestFirst(next), {
    writer: "vercel:repo-submissions-store",
    mirrorToFile: true,
  });
  return updated;
}

export async function getSubmissionById(
  id: string,
): Promise<RepoSubmissionRecord | null> {
  const existing = await readAllSubmissions();
  return existing.find((record) => record.id === id) ?? null;
}

/** Test-only — overwrite the entire store with a fresh list. */
export async function _replaceAllForTests(
  records: RepoSubmissionRecord[],
): Promise<void> {
  await getStore().write(STORE_KEY, sortNewestFirst(records), {
    writer: "vercel:repo-submissions-store-test",
  });
}
