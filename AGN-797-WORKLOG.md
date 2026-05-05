# AGN-797 — [SEO-009] Pluggable AISO-fix protocol

Date: 2026-05-04

## Wake handling

- Latest wake payload had no pending human comment (`pending comments: 0/0`), so this heartbeat proceeded directly with implementation work for AGN-797.

## Implemented in this heartbeat

1. Added a pluggable AISO scan protocol layer in [`src/lib/aiso-tools.ts`](src/lib/aiso-tools.ts):
   - Introduced `AisoProtocolConfig` (name, base URL, submit/status/result paths).
   - Added env-driven protocol knobs:
     - `AISO_SCAN_PROTOCOL`
     - `AISO_SCAN_SUBMIT_PATH`
     - `AISO_SCAN_STATUS_PATH_TEMPLATE`
     - `AISO_SCAN_RESULT_PATH_TEMPLATE`
   - Preserved existing defaults (dogfood mode):
     - protocol name: `aiso.tools`
     - submit: `/api/scan`
     - status: `/api/scan/{scanId}`
     - result: `/scan/{scanId}`
   - Kept existing base-url env aliases (`AISO_API_URL`, `AISO_TOOLS_API_URL`, `AISOTOOLS_API_URL`) and dev/prod fallback behavior.
   - Updated cache key to include protocol + base URL so different backends do not collide.

2. Added targeted regression coverage in [`src/lib/__tests__/aiso-tools.test.ts`](src/lib/__tests__/aiso-tools.test.ts):
   - Test 1 locks current `aiso.tools` wire behavior.
   - Test 2 validates custom protocol/path overrides.

3. Documented the new knobs in [`.env.example`](.env.example) under a dedicated AISO section.

## Verification run

- Command:
  - `npx tsx --test src/lib/__tests__/aiso-tools.test.ts`
- Result:
  - 2 tests passed, 0 failed.

## Next action

- Wire the same protocol env knobs into `scripts/enrich-repo-profiles.mjs` so offline profile enrichment uses the exact same pluggable backend contract as runtime API paths.

---

## 2026-05-05 heartbeat (issue_children_completed wake)

### Scan result (dogfood target)

- Executed in read-only AISO workspace:
  - `C:\Users\mirko\OneDrive\Desktop\Agnt\aiso`
  - command: `npx tsx scripts/scan-self.ts https://aiso.tools`
- Result:
  - score `60/100`
  - tier `partial`
  - high/critical findings include: missing definition lead, zero homepage citations, llms linked non-200 URLs, missing CSP header, missing FAQ route, comparison coverage gaps.

### Durable output created

- Manual-apply patchset with unified diffs for 7 high-impact fixes:
  - [AGN-797-AISO-PATCHSET.md](C:\Users\mirko\OneDrive\Desktop\STARSCREENER\AGN-797-AISO-PATCHSET.md)
- Pluggable protocol README for reuse on any project:
  - [docs/sergio-pluggable-protocol.md](C:\Users\mirko\OneDrive\Desktop\STARSCREENER\docs\sergio-pluggable-protocol.md)

### Next action

- Post the patchset into AGN-797 issue thread and set issue status to `in_review` once user confirms to proceed with manual apply/deploy flow in `Agnt/aiso`.
