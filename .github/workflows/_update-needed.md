# Manual workflow edit needed: docs-freshness.yml

The `protect-files.mjs` PreToolUse hook blocks edits to
`.github/workflows/*.yml`. The new guard
`scripts/check-living-docs-have-frontmatter.mjs` (added 2026-05-05)
must be wired into the docs-freshness workflow as a sibling step.

## Required edit to `.github/workflows/docs-freshness.yml`

Append this step right after the existing freshness check step:

```yaml
      - name: Run frontmatter validity check
        run: node scripts/check-living-docs-have-frontmatter.mjs
```

Resulting `steps:` block should look like:

```yaml
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Run freshness check
        run: node scripts/check-docs-freshness.mjs
      - name: Run frontmatter validity check
        run: node scripts/check-living-docs-have-frontmatter.mjs
```

Also add `scripts/check-living-docs-have-frontmatter.mjs` to the
workflow's `pull_request.paths` filter so PRs that touch the new
guard re-trigger the job.

## Why this note exists

`protect-files.mjs` is the gate. Run the edit yourself (or
temporarily disable the hook) once reviewed.
