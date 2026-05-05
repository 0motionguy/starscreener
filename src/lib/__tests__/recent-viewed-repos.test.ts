import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readRecentViewedRepos,
  recordRecentRepoView,
} from "../recent-viewed-repos";

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

test("recordRecentRepoView keeps newest first and dedupes repo ids", () => {
  const storage = new FakeStorage();
  recordRecentRepoView(storage, "a--repo");
  recordRecentRepoView(storage, "b--repo");
  recordRecentRepoView(storage, "a--repo");

  const out = readRecentViewedRepos(storage);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.repoId, "a--repo");
  assert.equal(out[1]?.repoId, "b--repo");
});

test("recordRecentRepoView caps history at 5", () => {
  const storage = new FakeStorage();
  for (let i = 1; i <= 7; i++) {
    recordRecentRepoView(storage, `repo-${i}`);
  }

  const out = readRecentViewedRepos(storage);
  assert.equal(out.length, 5);
  assert.deepEqual(
    out.map((x) => x.repoId),
    ["repo-7", "repo-6", "repo-5", "repo-4", "repo-3"],
  );
});
