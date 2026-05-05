---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---


## Completed scan capture (unblocked)

- Scan ID: `f3058017-7df2-42d7-8c0b-99c13348d1ee`
- Result artifact: `docs/forensic/AGN-792-AISO-RESULT-20260505T041559Z.json`
- Domain score: `51` (`partial`)
- Completed at: `2026-05-05T04:15:48.27+00:00`

### Lowest weighted dimensions observed

- `ai-discovery` � score `0`, weight `5`
- `delegate_economy` � score `0`, weight `6`
- `entity` � score `0`, weight `10`
- `csp-audit` � score `0`, weight `5`
- `crawler_block_audit` � score `0`, weight `4`
- `audience_reviews` � score `0`, weight `4`
- `offsite` � score `0`, weight `5`

### Dimension selected for this heartbeat

- Selected: `ai-discovery` (0/5) because scanner marked it auto-fixable with missing:
  - `/ai/summary.json`
  - `/.well-known/ai.txt`

### Fix implemented

- Added `src/app/ai/summary.json/route.ts`
- Added `src/app/.well-known/ai.txt/route.ts`
- Added automation runner script `scripts/agn792-aiso-scan.mjs`
- Added npm command: `npm run agn792:aiso-scan`

### Verification

- `npx eslint src/app/ai/summary.json/route.ts src/app/.well-known/ai.txt/route.ts scripts/agn792-aiso-scan.mjs` ?

## Automated attempt � 2026-05-05T04:18:57.507Z
- Target: `https://trendingrepo.com`
- Endpoint: `https://aiso.tools/api/scan`
- Status: `200`
- Artifact: `docs/forensic/AGN-792-AISO-SCAN-20260505T041857.507Z.json`

## Post-fix re-scan attempt (pre-merge baseline)

- Scan ID: `7cc48a9f-de01-4cf7-be38-b8aa462fd189`
- Result artifact: `docs/forensic/AGN-792-AISO-RESULT-20260505T041920Z.json`
- Domain score: `51` (unchanged from prior run) because STARSCREENER fixes are in-branch and not deployed yet.
- Lowest weighted dimension remains `ai-discovery` at `0/5`.

Interpretation:
- This run is a valid **pre-merge baseline confirmation**.
- Acceptance delta (`>=10` improvement) must be measured after merge+deploy.
