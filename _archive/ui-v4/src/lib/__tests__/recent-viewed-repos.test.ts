import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  readRecentViewedRepos,
  RECENT_VIEWED_REPOS_EVENT,
  RECENT_VIEWED_REPOS_KEY,
  trackRepoViewed,
} from "@/lib/recent-viewed-repos";

const originalWindow = globalThis.window;
const originalCustomEvent = globalThis.CustomEvent;

class TestCustomEvent {
  readonly type: string;
  readonly detail: unknown;

  constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
}

function installBrowserMock() {
  const store = new Map<string, string>();
  const events: Array<{ type: string; detail: unknown }> = [];

  const windowMock = {
    localStorage: {
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
    },
    dispatchEvent(event: { type: string; detail?: unknown }) {
      events.push({ type: event.type, detail: event.detail });
      return true;
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowMock,
  });
  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: TestCustomEvent,
  });

  return { store, events };
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: originalCustomEvent,
  });
});

test("recent viewed repos are MRU-deduped and emit a same-tab update", () => {
  const { events } = installBrowserMock();

  trackRepoViewed({ owner: "vercel", name: "next.js" });
  trackRepoViewed({ owner: "openai", name: "codex" });
  trackRepoViewed({ owner: "vercel", name: "next.js" });

  assert.deepEqual(
    readRecentViewedRepos().map((repo) => repo.fullName),
    ["vercel/next.js", "openai/codex"],
  );
  assert.equal(events.at(-1)?.type, RECENT_VIEWED_REPOS_EVENT);
});

test("recent viewed reader drops malformed or unsafe stored entries", () => {
  const { store } = installBrowserMock();
  store.set(
    RECENT_VIEWED_REPOS_KEY,
    JSON.stringify([
      {
        fullName: "vercel/next.js",
        owner: "vercel",
        name: "next.js",
        viewedAt: Date.now(),
      },
      {
        fullName: "evil/../../x",
        owner: "evil",
        name: "../../x",
        viewedAt: Date.now(),
      },
      {
        fullName: "mismatch/repo",
        owner: "other",
        name: "repo",
        viewedAt: Date.now(),
      },
    ]),
  );

  assert.deepEqual(
    readRecentViewedRepos().map((repo) => repo.fullName),
    ["vercel/next.js"],
  );
});
