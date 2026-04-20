import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  getDerivedRepos,
  __resetDerivedReposCache,
} from "../../derived-repos";

test("derived-repos smoke — assemble + classify + score + rank", () => {
  __resetDerivedReposCache();
  const repos = getDerivedRepos();
  const counts: Record<string, number> = {};
  for (const r of repos) {
    counts[r.movementStatus] = (counts[r.movementStatus] || 0) + 1;
  }
  console.log("total:", repos.length);
  console.log("by movementStatus:", JSON.stringify(counts));
  console.log("top 5 by momentum:");
  for (const r of repos.slice(0, 5)) {
    console.log(
      `  ${r.fullName}  m=${r.momentumScore}  st=${r.movementStatus}  d24=${r.starsDelta24h}  d7=${r.starsDelta7d}`,
    );
  }
  assert.ok(repos.length > 100, "expected >100 derived repos");
  const top = repos[0];
  assert.ok(top.momentumScore > 0, "expected top repo to have momentum > 0");
  assert.ok(top.rank === 1, "top repo should have rank 1");

  // stars should be the GitHub lifetime total, not the period-delta pulled
  // from an OSSInsights bucket.
  assert.ok(
    top.stars > top.starsDelta24h,
    "top repo's total stars should exceed its 24h delta",
  );

  // Real movement variance — cold-start fallback to OSS Insight period
  // deltas should give us at least some hot/breakout/rising signal even
  // before the authoritative 24h window is populated. If this assertion
  // fails, the fallback broke: every repo collapsed to declining/stable.
  const interesting =
    (counts.breakout ?? 0) + (counts.hot ?? 0) + (counts.rising ?? 0);
  assert.ok(
    interesting > 0,
    "expected at least one hot/breakout/rising repo — cold-start fallback is probably broken",
  );
});
