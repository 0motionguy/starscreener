# Lighthouse audits

Per-run output goes to subdirectories of this folder, named after the ISO timestamp
(e.g. `docs/audits/lighthouse/2026-05-15T15-30-00/`). Each subdirectory holds:

- One `<route>.json` Lighthouse report per route in `perf/routes.json`.
- A `summary.md` table with the per-route scores + threshold pass/fail.

## Running

Pick **one** base URL:

```bash
# Against local dev server (start it first):
npm run dev &
npm run lighthouse:routes

# Against local production build (preferred — matches Vercel):
npm run build && npm run start &
npm run lighthouse:routes

# Against live production:
npm run lighthouse:routes:prod
```

Optional flags:

- `--only=/foo,/bar` — run a subset of routes.
- `--out-dir=./somewhere/` — override default timestamped dir.
- `--base-url=https://...` — override base URL (e.g. a Vercel preview).

## Threshold

The script targets:

| Category | Target |
|---|---|
| Performance | ≥ 80 |
| Accessibility | ≥ 90 |
| Best Practices | ≥ 90 |
| SEO | ≥ 90 |

Failures exit non-zero. Use `--summary-only` to silence the per-route logs and just dump the summary at the end.

## Notes

- Each route takes ~30 seconds, so the full sweep is ~12 minutes serial. Don't parallelise — concurrent runs against the same dev server skew scores.
- `--preset=desktop` is set (default). For mobile-perspective audits, edit the script or pass through Lighthouse CLI directly.
- Reports are JSON for machine-readability. To get the rich interactive HTML report for a single route, run `npx lighthouse <url> --output=html --output-path=./report.html` directly.

## Output is git-ignored

Run output dirs (`*-T*/`) are listed in this folder's `.gitignore` so audit runs don't pollute commits. Commit the `README.md`, leave the runs out.
