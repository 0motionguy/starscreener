# AGN-564 [AC-SETUP-3] Verify Protocol + Fixtures + Smoke Test

Checked at: 2026-05-04
Owner: Release QA

## Protocol
1. Run mandatory opening bundle and `npm run freshness:check`.
2. Capture freshness state as binary gate context:
   - `localhost:3023` missing => environment blocker.
   - reachable + non-green blocking rows => product stale/degraded.
3. Run deterministic smoke fixtures via:
   - `node --test scripts/__tests__/agn-564-verify-protocol.smoke.test.mjs`
4. Binary acceptance for AC-SETUP-3:
   - GREEN: all 3 fixtures pass and smoke test exits 0.
   - RED: any fixture assertion fails.
5. Record evidence artifact:
   - `qa-artifacts/AGN-564/smoke-result.json`

## Fixture contract
Each fixture has:
- `name`: string
- `input`: `{ localhostMissing: boolean, blockingNonGreen: number, advisoryNonGreen: number }`
- `expected`: `{ classification: "environment_blocker" | "product_stale" | "green" }`

Classification logic under test:
- `localhostMissing=true` => `environment_blocker`
- else if `blockingNonGreen>0` => `product_stale`
- else => `green`

## Current heartbeat freshness classification
From this heartbeat (`2026-05-04T13:22:04.652Z`):
- localhost missing: `false`
- blocking non-green: `2`
- classification: `product_stale`
