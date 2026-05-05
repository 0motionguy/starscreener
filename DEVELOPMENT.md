# Development Notes

## OBS-6 long-task profiler (dev only)

`instrumentation-client.ts` starts a browser `PerformanceObserver` in `development` mode and warns when a main-thread task exceeds the local budget.

- Default budget: `50ms`
- Override budget: `NEXT_PUBLIC_DEV_LONG_TASK_BUDGET_MS`
- Console markers:
  - `[OBS-6][long-task][profiler-started]`
  - `[OBS-6][long-task][budget-exceeded]`

Quick local verification:

1. Start dev server.
2. Open any page in the browser.
3. In browser devtools console, run this three times:

```js
const t = performance.now(); while (performance.now() - t < 90) {}
```

Each run should emit a `[OBS-6][long-task][budget-exceeded]` warning.
