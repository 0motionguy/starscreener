import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import {
  useCompareRepos,
  _resetCompareReposCacheForTests,
} from "../useCompareRepos";

// Stable id-array references — the hook's effect deps include `repoIds`,
// so reusing a constant prevents incidental re-renders during tests.
const IDS_EMPTY: ReadonlyArray<string> = Object.freeze([]);
const IDS_AB: ReadonlyArray<string> = Object.freeze(["a/b"]);
const IDS_AB_CD: ReadonlyArray<string> = Object.freeze(["a/b", "c/d"]);
const IDS_CD_AB: ReadonlyArray<string> = Object.freeze(["c/d", "a/b"]);
const IDS_XY: ReadonlyArray<string> = Object.freeze(["x/y"]);

const FAKE_REPO = {
  fullName: "vercel/next.js",
  name: "next.js",
  owner: "vercel",
  description: "",
  url: "https://github.com/vercel/next.js",
  language: "TypeScript",
  stars: 100,
  starsDelta24h: 0,
  starsDelta7d: 0,
  starsDelta30d: 0,
  momentumScore: 0,
  crossSignalScore: 0,
  movementStatus: "stable",
  lastCommitAt: "2026-04-27T00:00:00Z",
  topics: [] as string[],
};

// Plain stub: avoids happy-dom's Response/fetch surface entirely.
function makeFakeResponse(body: unknown, status = 200): unknown {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Map<string, string>(),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  _resetCompareReposCacheForTests();
  fetchMock = vi
    .fn()
    .mockImplementation(async () =>
      makeFakeResponse({ repos: [FAKE_REPO] }),
    );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCompareRepos", () => {
  it("holds an empty array until hasHydrated flips true", async () => {
    const { result, rerender } = renderHook(
      ({ ids, hyd }: { ids: ReadonlyArray<string>; hyd: boolean }) =>
        useCompareRepos(ids, hyd),
      { initialProps: { ids: IDS_AB, hyd: false } },
    );
    expect(result.current.repos).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ ids: IDS_AB, hyd: true });
    await waitFor(() => expect(result.current.repos.length).toBe(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array immediately for an empty id list", async () => {
    const { result } = renderHook(() => useCompareRepos(IDS_EMPTY, true));
    expect(result.current.repos).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dedupes two concurrent consumers of the same id set into ONE fetch", async () => {
    const a = renderHook(() => useCompareRepos(IDS_AB_CD, true));
    const b = renderHook(() => useCompareRepos(IDS_AB_CD, true));

    await waitFor(() =>
      expect(a.result.current.repos.length).toBeGreaterThan(0),
    );
    await waitFor(() =>
      expect(b.result.current.repos.length).toBeGreaterThan(0),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hits the cache on a second mount within the TTL", async () => {
    const first = renderHook(() => useCompareRepos(IDS_AB, true));
    await waitFor(() => expect(first.result.current.repos.length).toBe(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    first.unmount();

    const second = renderHook(() => useCompareRepos(IDS_AB, true));
    expect(second.result.current.repos.length).toBe(1);
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats id sets as set-equivalent regardless of array order", async () => {
    const a = renderHook(() => useCompareRepos(IDS_AB_CD, true));
    await waitFor(() => expect(a.result.current.repos.length).toBe(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const b = renderHook(() => useCompareRepos(IDS_CD_AB, true));
    expect(b.result.current.repos.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list when the API errors", async () => {
    fetchMock.mockResolvedValueOnce(makeFakeResponse({}, 500));
    const { result } = renderHook(() => useCompareRepos(IDS_XY, true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.repos).toEqual([]);
  });
});
