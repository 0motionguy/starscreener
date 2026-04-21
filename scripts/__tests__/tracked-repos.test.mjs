import assert from "node:assert/strict";
import { test } from "node:test";
import { collectTrackedRepos } from "../_tracked-repos.mjs";

test("collectTrackedRepos: reads recent-repos items shape", () => {
  const trending = {
    buckets: {
      past_24_hours: {
        All: [{ repo_name: "Trend/Repo" }],
      },
    },
  };
  const recent = {
    fetchedAt: "2026-04-21T00:00:00.000Z",
    items: [
      { fullName: "Acme/Fresh-Launch" },
      { repo_name: "Legacy/RowName" },
      { full_name: "Legacy/SnakeName" },
    ],
  };

  const tracked = collectTrackedRepos({ trending, recent });

  assert.equal(tracked.get("trend/repo"), "Trend/Repo");
  assert.equal(tracked.get("acme/fresh-launch"), "Acme/Fresh-Launch");
  assert.equal(tracked.get("legacy/rowname"), "Legacy/RowName");
  assert.equal(tracked.get("legacy/snakename"), "Legacy/SnakeName");
});

test("collectTrackedRepos: preserves first canonical casing for duplicates", () => {
  const tracked = collectTrackedRepos({
    trending: {
      buckets: {
        past_24_hours: {
          All: [{ repo_name: "Owner/Repo" }],
        },
      },
    },
    recent: {
      items: [{ fullName: "owner/repo" }],
    },
  });

  assert.equal(tracked.get("owner/repo"), "Owner/Repo");
});
