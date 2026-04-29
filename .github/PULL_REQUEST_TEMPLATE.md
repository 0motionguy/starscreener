## Summary

<!-- 1–3 sentences: what changed and why. Link relevant issue(s). -->

## Test plan

<!-- Bullet list of what you ran / observed locally. Examples:
- [ ] `npm run typecheck` clean
- [ ] `npm run lint:guards` clean
- [ ] `npm test` passes
- [ ] Hit the affected route locally and verified the new behavior
- [ ] Vercel preview URL renders without errors
-->

## Checklist

- [ ] Branch is up to date with `main`
- [ ] Conventional-commits style commit messages
- [ ] No `console.log` left in production paths (`src/`)
- [ ] No `.env*` files committed
- [ ] If a workflow was touched: `permissions:`, `concurrency:`, and a comment explaining the schedule are present
- [ ] If a new collector was added: it dual-writes via `scripts/_data-store-write.mjs`
- [ ] Documentation updated (`docs/`, `README.md`, or inline) if user-visible behavior changed

## Screenshots / output

<!-- Optional. Drag-drop screenshots for UI changes; paste curl output or test results for backend changes. -->
