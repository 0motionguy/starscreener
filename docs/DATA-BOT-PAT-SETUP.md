# Data-bot PAT setup (`DATA_BOT_TOKEN`)

## Why this exists

GitHub deliberately suppresses `workflow_run` and `pull_request` triggers
when an action is performed by `GITHUB_TOKEN` — anti-infinite-loop
protection. The 26 cron data-collection workflows in this repo all push
a "data" branch and open a PR via `.github/actions/git-commit-data`.
With the default token, those PRs sit forever waiting for the required
`Typecheck, guards, tests, build, e2e` status check, which never runs
because the PR's `pull_request` event is suppressed. Branch protection
then blocks the merge. Result before this fix: 30+ stuck open data PRs.

The action now accepts an optional `gh-token` input. Passing a PAT or
GitHub App installation token attributes the push to a non-Actions
identity, which lets CI fire normally.

## Mint the token (pick one)

### Option A — fine-grained PAT (faster, expires)

1. github.com → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → **Generate new token**
2. Resource owner: `0motionguy`. Repository access: `0motionguy/starscreener`.
3. Repository permissions:
   - **Contents:** Read and write
   - **Pull requests:** Read and write
   - **Actions:** Read
   - **Metadata:** Read (auto-required)
4. Expiration: 90 days max (set a calendar reminder to rotate).
5. Generate and copy the token.

### Option B — GitHub App (preferred, no expiry)

1. Settings → Developer settings → GitHub Apps → **New GitHub App**.
2. Permissions: `contents:write`, `pull_requests:write`, `actions:read`.
3. Install on `0motionguy/starscreener`.
4. Generate an installation token via your existing app-token action
   (e.g. `actions/create-github-app-token@v1`) inside each workflow.
   Pass the resulting token as `gh-token`.

Option B is the long-term answer (no rotation). Option A unblocks the
current backlog today.

## Store as a repo secret

`gh secret set DATA_BOT_TOKEN --repo 0motionguy/starscreener --body "<token>"`

Or via the UI: Settings → Secrets and variables → Actions →
**New repository secret** → name `DATA_BOT_TOKEN`.

## Roll out to workflows

The action defaults `gh-token` to `${{ github.token }}`, so workflows
that don't pass `gh-token` keep working with the legacy (broken)
behavior. Migration is per-workflow, additive:

```yaml
- uses: ./.github/actions/git-commit-data
  with:
    gh-token: ${{ secrets.DATA_BOT_TOKEN }}
    message: "..."
    paths: |
      ...
```

If `DATA_BOT_TOKEN` is unset on a fork or before rollout, the action
falls back to `GITHUB_TOKEN` automatically — empty-secret-safe.

## Rollout order (recommended)

`scrape-trending.yml` is wired as the reference example in this PR.
After verifying CI fires on its next data PR, bulk-update the remaining
25 callers via grep:

```bash
grep -rl 'git-commit-data' .github/workflows/
```

Drain the stuck PR backlog by re-running each workflow once the secret
is in place — the next data PR from each will trigger CI and merge.

## Rotation

Fine-grained PATs expire. When `gh-token` 401s, the push step fails
loud (no silent fallback to GITHUB_TOKEN once a value is passed). Mint
a replacement and update the secret. GitHub App tokens (Option B) are
minted per-run by the app-token action and don't need rotation.
