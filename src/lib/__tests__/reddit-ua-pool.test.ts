import assert from "node:assert/strict";
import { test } from "node:test";

import { redditUserAgentFingerprint } from "../pool/reddit-ua-pool";

test("redditUserAgentFingerprint keeps configured user-agents distinct", () => {
  const userAgents = [
    "trendingrepo-scanner/1.0 (+https://trendingrepo.com)",
    "trendingrepo-discovery/1.0 (+https://trendingrepo.com)",
    "trendingrepo-signals/1.0 (+https://trendingrepo.com)",
    "trendingrepo-aggregator/1.0 (+https://trendingrepo.com)",
    "trendingrepo-mentions/1.0 (+https://trendingrepo.com)",
  ];

  const fingerprints = userAgents.map(redditUserAgentFingerprint);

  assert.equal(new Set(fingerprints).size, userAgents.length);
  assert.ok(
    fingerprints.every((fingerprint) =>
      /^trendingrepo-[a-z0-9-]+-[0-9a-f]{8}$/.test(fingerprint),
    ),
  );
});
