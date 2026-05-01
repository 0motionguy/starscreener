// TwitterSignalBuilder — the only public surface for src/lib/twitter/*.
//
// Audit A4 / GitHub issue #87: untangle the Twitter pipeline by funnelling
// every external consumer through a single namespace. Internal modules
// (scoring.ts, query-bundle.ts, storage.ts, signal-data.ts, ingest-contract.ts,
// outbound/audit.ts) are marked @internal and must not be imported from
// outside src/lib/twitter/.
//
// Public types stay in ./types.ts — this barrel only re-exports the runtime
// surface. Consumers should import named members from "@/lib/twitter"
// (the index barrel re-exports this builder).
//
// Behaviour-preserving facade. No logic lives here; every member is a
// re-export of the same function it replaces.

import {
  getTwitterAdminReview,
  getTwitterLeaderboard,
  getTwitterOverviewStats,
  getTwitterRepoPanel,
  getTwitterRepoSignal,
  getTwitterScanCandidates,
  getTwitterTrendingRepoLeaderboard,
  ingestTwitterAgentFindings,
  ingestTwitterFindings,
  isTwitterIngestError,
} from "./service";
import {
  getTwitterSignalSync,
  getTwitterSignalsDataVersion,
} from "./signal-data";
import {
  getTopTwitterBuzz,
  getTopTwitterPosts,
  getTwitterLatestUpdatedAt,
  getTwitterTrackedRepoCount,
} from "./trending-tweets";
import { buildTwitterQueryBundle } from "./query-bundle";

export const TwitterSignalBuilder = {
  // Read API — repo-level rollups consumed by /twitter, /api/repos, etc.
  getTwitterRepoPanel,
  getTwitterRepoSignal,
  getTwitterAdminReview,
  getTwitterLeaderboard,
  getTwitterTrendingRepoLeaderboard,
  getTwitterOverviewStats,
  // Sync getters — used by derived-repos decorators + cross-signal pipeline.
  getTwitterSignalSync,
  getTwitterSignalsDataVersion,
  getTwitterTrackedRepoCount,
  getTwitterLatestUpdatedAt,
  // Buzz / post lists — used by /signals.
  getTopTwitterBuzz,
  getTopTwitterPosts,
  // Ingest API — used by internal cron + agent ingest routes.
  getTwitterScanCandidates,
  ingestTwitterAgentFindings,
  ingestTwitterFindings,
  isTwitterIngestError,
  // Query bundle — used by collectors / agent platform.
  buildTwitterQueryBundle,
} as const;

// Named re-exports so consumers can `import { getTwitterRepoPanel } from "@/lib/twitter"`
// without going through the namespace object.
export {
  getTwitterAdminReview,
  getTwitterLeaderboard,
  getTwitterOverviewStats,
  getTwitterRepoPanel,
  getTwitterRepoSignal,
  getTwitterScanCandidates,
  getTwitterTrendingRepoLeaderboard,
  ingestTwitterAgentFindings,
  ingestTwitterFindings,
  isTwitterIngestError,
  getTwitterSignalSync,
  getTwitterSignalsDataVersion,
  getTopTwitterBuzz,
  getTopTwitterPosts,
  getTwitterLatestUpdatedAt,
  getTwitterTrackedRepoCount,
  buildTwitterQueryBundle,
};
