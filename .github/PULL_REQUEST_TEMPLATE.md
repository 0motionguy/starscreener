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

## V6 Cutover Gate

<!--
  ONLY fill in this section if this PR is the v6 production cutover
  (spec: specs/001-v6-prod-cutover/). Otherwise delete this whole section.
  Per FR-016: cutover is BLOCKED until every checkbox below is checked
  AND the `cutover-verify` status check is green.
-->

- [ ] `cutover-verify` GitHub status check is green (see `.github/workflows/pre-cutover-verify.yml`)
- [ ] Operator clicked through all v6 core routes in browser on the staging URL
- [ ] Operator verified Clerk sign-in / sign-up flow end-to-end
- [ ] Operator verified moved-tool redirects (`/top10`, `/tierlist`, `/compare`, `/digest`) terminate at v6 destinations
- [ ] Operator confirmed standby HOSTUP origin is serving the pre-cutover build (manual probe)
- [ ] Rollback runbook in `specs/001-v6-prod-cutover/quickstart.md` § Phase 2 has been rehearsed (record wall-clock seconds: __)
- [ ] FR-012 `document.referrer` preserved on cross-route navigation (DevTools check)
- [ ] FR-009 Vercel `starscreener` project still shows status `Paused`
