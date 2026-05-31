import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  countTrendingPayloadRows,
  isUsableTrendingPayload,
} from "../../trending";

test("trending payload quality rejects fresh empty bucket payloads", () => {
  assert.equal(
    isUsableTrendingPayload({
      fetchedAt: "2026-06-01T00:00:00.000Z",
      buckets: {
        past_24_hours: {
          All: [],
        },
      },
    }),
    false,
  );
  assert.equal(
    countTrendingPayloadRows({
      fetchedAt: "2026-06-01T00:00:00.000Z",
      buckets: {
        past_24_hours: {
          All: [
            {
              repo_id: "1",
              repo_name: "cached/project",
              primary_language: "TypeScript",
              description: "cached row",
              stars: "10",
              forks: "1",
              pull_requests: "1",
              pushes: "1",
              total_score: "1",
              contributor_logins: "",
              collection_names: "",
            },
          ],
        },
      },
    }),
    1,
  );
});
