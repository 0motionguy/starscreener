# Contract: Pre-Cutover Verify Gate

**Feature**: 001-v6-prod-cutover | **Date**: 2026-05-21

The pre-cutover verify gate is the human + machine checkpoint that decides whether to
flip DNS from the standby origin to the v6 origin. It satisfies FR-016.

---

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| `deploy_url` | The HOSTUP staging URL serving the cutover candidate build | Yes |
| `lighthouse_baseline` | `.perf/lighthouse-mobile-prod.json` (committed) | Yes |
| `smoke_targets` | `scripts/smoke/targets.json` (committed) | Yes |
| Operator checklist confirmation | PR-body checkboxes filled in by operator | Yes |

---

## Outputs

| Output | Form | Semantics |
|--------|------|-----------|
| `cutover-verify` GitHub status check | `success` / `failure` / `pending` | Single gate the operator watches; green = DNS flip authorized |
| Lighthouse per-route delta report | Artifact uploaded to the workflow run | Operator's verification surface |
| Smoke probe failure list (if any) | Artifact + workflow log | Operator's verification surface |

---

## Workflow: `.github/workflows/pre-cutover-verify.yml`

```yaml
name: Pre-Cutover Verify Gate
on:
  workflow_dispatch:
    inputs:
      deploy_url:
        description: 'HOSTUP staging URL of cutover candidate (https://...)'
        required: true
        type: string

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - name: Lighthouse mobile against 14 core routes
        env:
          PAGESPEED_API_KEY: ${{ secrets.PAGESPEED_API_KEY }}
          DEPLOY_URL: ${{ inputs.deploy_url }}
        run: npm run lighthouse:routes:prod
      - name: Assert no regression vs baseline
        run: node scripts/verify/assert-lighthouse-baseline.mjs
      - uses: actions/upload-artifact@v4
        with:
          name: lighthouse-report
          path: .perf/lighthouse-mobile-cutover.json

  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - name: Run extended smoke probe against cutover URL
        run: node scripts/smoke/probe-all.mjs --deploy-url=${{ inputs.deploy_url }} --strict
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: smoke-failures
          path: .smoke/failures.json

  gate:
    needs: [lighthouse, smoke]
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Emit cutover-verify status check
        uses: actions/github-script@v7
        with:
          script: |
            const lighthouse = '${{ needs.lighthouse.result }}';
            const smoke = '${{ needs.smoke.result }}';
            const verdict = (lighthouse === 'success' && smoke === 'success') ? 'success' : 'failure';
            await github.rest.repos.createCommitStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              sha: context.sha,
              state: verdict,
              context: 'cutover-verify',
              description: `lighthouse=${lighthouse} smoke=${smoke}`,
            });
            if (verdict === 'failure') core.setFailed(`Verify gate failed`);
```

---

## Assertion Details

### `assert-lighthouse-baseline.mjs`

Loads `.perf/lighthouse-mobile-prod.json` (baseline) and `.perf/lighthouse-mobile-cutover.json`
(this run). For each of the 14 core routes:

- Asserts `cutover.performance >= baseline.performance - 5` (5-point grace window per
  SC-004).
- Asserts mean `cutover.performance` across all 14 routes >= mean `baseline.performance`.

Exits non-zero (failing the job) on the first route that regresses more than 5 points
OR if mean regresses.

### Smoke job strict mode

Runs `scripts/smoke/probe-all.mjs --strict` — strict mode means:
- 100% coverage of v6 + moved/renamed (no sampling)
- Legacy redirects: probe 30 sampled (not 10) for higher confidence at the verify gate

---

## Operator Checklist (PR-body)

The cutover PR template MUST include:

```markdown
## Pre-Cutover Verify Gate

- [ ] `cutover-verify` GitHub status check is green
- [ ] Operator clicked through all 14 core routes in browser on `${deploy_url}`
- [ ] Operator verified Clerk sign-in/sign-up flow end-to-end
- [ ] Operator verified IdeaBrief degraded mode shows "Editing coming soon" toast on save/regenerate/attach
- [ ] Operator verified the standby HOSTUP origin is still serving the pre-cutover build (manual probe)
- [ ] Rollback runbook in `specs/001-v6-prod-cutover/quickstart.md` § Rollback has been rehearsed
```

Cutover is BLOCKED until every checkbox is checked AND the `cutover-verify` status
check is green.

---

## Failure Modes

| Failure | Workflow result | Operator action |
|---------|-----------------|-----------------|
| Lighthouse asset missing baseline | `lighthouse` job fails | Re-record baseline against current prod, commit, re-run gate |
| Lighthouse exceeds 5-pt regression on any route | `lighthouse` job fails | Inspect per-route report; either accept (commit new baseline) or fix the regression |
| Smoke probe failure on any v6/moved/renamed route | `smoke` job fails | Inspect `smoke-failures.json` artifact; fix the regression on the cutover branch; redeploy; re-run gate |
| Smoke probe failure on any sampled legacy route | `smoke` job fails | Add/update the missing redirect rule in `next.config.ts`; redeploy; re-run gate |
| Workflow itself times out | `cutover-verify` status = failure | Investigate workflow logs; cutover BLOCKED |

---

## Re-run Semantics

The verify gate can be re-run any number of times against the same deploy URL or
different deploy URLs. The `cutover-verify` status check on the cutover commit reflects
the LATEST run. Operators should re-run the gate after every push to the cutover branch
and immediately before flipping DNS.
