# AGN-851 - [OBS-6] Long-tasks profiler in dev - local performance budget

Date: 2026-05-05

## Implemented

1. Added dev-only long-task profiler in `instrumentation-client.ts`.
2. Default local budget is now `50ms` (`NEXT_PUBLIC_DEV_LONG_TASK_BUDGET_MS` override supported).
3. Added stable console markers:
   - `[OBS-6][long-task][profiler-started]`
   - `[OBS-6][long-task][budget-exceeded]`
4. Added usage and verification instructions in `DEVELOPMENT.md`.

## Live Verification Evidence

Dependency restore:
- Ran `npm install` and confirmed `node_modules/.bin/next.cmd` exists.

Runtime capture:
- Started local dev server on `http://localhost:4173`.
- Ran headless Playwright probe to trigger long tasks and capture console output.
- Raw capture stored at `.tmp-agn851-longtask.log`.

Observed markers:
- `[OBS-6][long-task][profiler-started] budget=50ms`
- `OBS6_EXCEEDED_COUNT=7`

Required sample logs (3+):
1. `[OBS-6][long-task][budget-exceeded] 52ms at +46656ms (budget 50ms)`
2. `[OBS-6][long-task][budget-exceeded] 98ms at +46775ms (budget 50ms)`
3. `[OBS-6][long-task][budget-exceeded] 274ms at +47125ms (budget 50ms)`

## Next Action

- Ready for issue close after reviewer confirms the captured sample logs and `DEVELOPMENT.md` guidance satisfy AGN-851 acceptance.
