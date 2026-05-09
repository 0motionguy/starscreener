# PR #7 (Supabase ideas) — pre-existing CI failure

**Status:** UNRESOLVED. Out of scope for the 2026-04-28 audit-driven PR wave.

## Summary

PR #7 (`claude/quizzical-kilby-9a529a` — "feat(builder): ideas + reactions + predictions layer on Supabase") has been failing CI since 2026-04-24 (run id `24869225846`). The PR is mergeable (no merge conflicts) but its CI is RED.

## The failure

Test: `currentDataDir() rejects any path containing '..' segments`
Location: [src/lib/pipeline/__tests__/data-dir-validation.test.ts](../src/lib/pipeline/__tests__/data-dir-validation.test.ts)

Error message:
```
STARSCREENER_DATA_DIR must not contain '..' segments (got "../foo")
```

## Diagnosis

The error fires at **module load time**, not assertion time. Stack:
1. `file-persistence.ts:187` — top-level invocation (module-init)
2. `file-persistence.ts:70:33` (function body)
3. `file-persistence.ts:54:11` — `currentDataDir()` throws

So when the test file `data-dir-validation.test.ts` imports `file-persistence.ts`, that import eagerly invokes `currentDataDir()` with whatever env/default state it has. The test was written expecting the function to validate-on-call, but in this branch it validates-on-import. The throw happens before any test assertion runs.

The "got `../foo`" in the error suggests that during the test setup, `STARSCREENER_DATA_DIR` was already set to `../foo` (likely via test fixtures or env injection earlier in the suite), and the eager validation rejected it before the test could exercise the rejection contract.

## Likely fix path

One of:
1. Move the `currentDataDir()` invocation in `file-persistence.ts:187` from module-init to lazy/on-first-use.
2. Reorder test setup so `STARSCREENER_DATA_DIR` is reset to a valid value before importing `file-persistence.ts`.
3. Refactor the test to not rely on module-load env, use a setter that doesn't fire validation.

## Why deferred

Per the [2026-04-28 audit §6](AUDIT_TRENDINGREPO_2026-04-28.md), PR #7 is the LAST in the recommended merge sequence (after #19 events firehose → #20 engagement → #21 funding → #7 Supabase ideas). It also has a critical pre-merge action: flip `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env in Vercel so `getBuilderStore()` returns `SupabaseBuilderStore` instead of the P0 `JsonBuilderStore`. Both the env flip and this CI fix should happen at the same time, by whoever owns the Supabase migration.
