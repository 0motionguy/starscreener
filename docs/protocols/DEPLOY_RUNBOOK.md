# Phase 8 — Production Deploy Runbook

All prior phases are complete and verified locally. Phase 8 actions require human auth (Vercel, DNS, npm) so they are staged here rather than run in CI.

## Pre-flight (run from a clean working tree)

```bash
cd C:/Users/mirko/OneDrive/Desktop/STARSCREENER
git status                          # expect: clean, on main
npm test                            # expect: 215/215 pass
npm run typecheck                   # expect: clean
npm run portal:conformance          # expect: 8/8 checks pass (dev server on :3023)
```

## Step 1 — Deploy Next.js to production

Two supported paths depending on which host serves `starscreener.xyz`.

### Path A: Vercel (recommended for this integration)

1. `vercel link` (once, if not linked).
2. `vercel --prod`.
3. Note the deployment URL from the CLI output.
4. Update DNS: point `starscreener.xyz` A record at Vercel per [Vercel domain docs](https://vercel.com/docs/projects/domains).
5. **Before DNS flip**, remove the blanket Railway redirect in `vercel.json`:
   ```bash
   git rm vercel.json   # or reduce to just the $schema line if you want to keep the file
   git commit -m "deploy(portal): drop Railway redirect so Vercel serves Next.js directly"
   ```

### Path B: Railway (keeps current `vercel.json` hybrid)

1. Push `main` to the connected Railway project.
2. Wait for the build to go green.
3. The existing `vercel.json` redirect already forwards all traffic to Railway — no change needed.

## Step 2 — Smoke test from a third-party host

From a machine that's NOT your development laptop (a VPS, GitHub Actions runner, or phone on cellular):

```bash
# 1. Manifest
curl -s https://starscreener.xyz/portal | jq '.portal_version, .tools[].name'

# 2. Real data for each tool
curl -s -X POST https://starscreener.xyz/portal/call \
  -H 'Content-Type: application/json' \
  -d '{"tool":"top_gainers","params":{"limit":3}}' | jq .

curl -s -X POST https://starscreener.xyz/portal/call \
  -H 'Content-Type: application/json' \
  -d '{"tool":"search_repos","params":{"query":"agent","limit":3}}' | jq .

curl -s -X POST https://starscreener.xyz/portal/call \
  -H 'Content-Type: application/json' \
  -d '{"tool":"maintainer_profile","params":{"handle":"anthropics"}}' | jq .

# 3. Health probe
curl -s https://starscreener.xyz/api/health/portal | jq .

# 4. Automated conformance (same script CI would run)
npm run portal:conformance https://starscreener.xyz/portal

# 5. Regression — existing routes unchanged
curl -s 'https://starscreener.xyz/api/repos?period=week&limit=3' | jq '.repos[0].fullName'
curl -s 'https://starscreener.xyz/api/search?q=next' | jq '.results[0].fullName'
```

Expected:
- Every Portal call returns the v0.1 envelope shape.
- All three tools return real indexed data (or `NOT_FOUND` honestly when the index lacks matches for the test input).
- Existing `/api/*` responses are structurally unchanged.

## Step 3 — Publish the MCP package to npm

Only after Step 2 is green.

```bash
cd mcp
npm publish --dry-run                # review the tarball contents
# Expected: README.md, dist/**, package.json — no node_modules, no .env.
npm login                            # if needed
npm publish                          # publishes starscreener-mcp@0.1.0
```

Post-publish: verify install works from a clean directory:

```bash
cd /tmp && mkdir mcp-smoke && cd mcp-smoke
npx -y starscreener-mcp --help       # or wire into claude_desktop_config.json
```

## Step 4 — Tag the release

```bash
cd C:/Users/mirko/OneDrive/Desktop/STARSCREENER
git tag -a v0.1.0-portal -m "Portal v0.1 + MCP + Agent Skills — first agent-native adopter"
git push origin main v0.1.0-portal
```

## Step 5 — Skills validation in a live Claude session

Open Claude Code in this repo, try each skill:

- Start a message with "What's trending on GitHub this week?" → `screen-trending-repos` should auto-invoke.
- "Tell me about All-Hands-AI — what's their top repo?" → `investigate-maintainer`.
- "Give me a weekly GitHub report." → `weekly-report`.

Each should invoke `top_gainers` or `maintainer_profile` via `@starscreener/mcp` (if installed) or the Portal endpoint, and return a ranked/filtered output per the skill playbook.

## Rollback

If Step 2 finds an issue:
- **Vercel:** `vercel rollback` to the previous production deployment.
- **Railway:** redeploy the prior commit.
- **npm:** the first publish cannot be unpublished after 72 hours except as `starscreener-mcp@0.1.1` replacing it. Don't publish until smoke tests are green.

## Acceptance criteria recap

All must be green:
- [ ] `GET https://starscreener.xyz/portal` returns a v0.1-valid manifest.
- [ ] POST calls for each of the 3 tools return real production data.
- [ ] Upstream / vendored conformance runner passes.
- [ ] `npx -y starscreener-mcp` spins up an MCP server.
- [ ] MCP Inspector shows 10 tools.
- [ ] Claude Desktop with `starscreener-mcp` config loaded can call a tool.
- [ ] 3 SKILL.md files in `/skills/` have valid frontmatter.
- [ ] Skills trigger correctly and produce useful output in Claude Code.
- [ ] Existing `/api/*` routes return the same shape they always have.
- [ ] Same `src/tools/` source of truth backs all three protocols.
- [ ] Rate limit enforced on `/portal/*` only; docs published.
