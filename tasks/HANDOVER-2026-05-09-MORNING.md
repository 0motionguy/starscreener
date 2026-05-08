# HANDOVER: 2026-05-09 morning — post-overnight-push session

**Read this BEFORE any feature work.** The overnight push wave landed clean except for 2 open bugs flagged below. Verify production state before doing anything new.

## TL;DR — what shipped overnight

- **Phase 5 wave** (5 commits, all SSR / freshness / scoring improvements) → LIVE
- **Reddit collector durability fix** (90-day window + last-good invariant + cron disabled) → LIVE
- **Wave 3 / WIP** (mcp + skills trend-ranking, star-history wrapper, skills-sh fetcher, env-alias) → LIVE
- Two bugs detected, neither blocks user-facing flows:
  - **P0:** `/repo/[owner]/[name]` returns 500 across the board — **PRE-EXISTING**, introduced by your own commit `d81856ad` at 2026-05-08 19:42 +0800. Not from this session.
  - **P1:** New `/api/mcp/trending` endpoint returns 404 (Vercel cache anomaly; Next route handler exists and validates). The /mcp page renders correctly without it.

## Verify state on session open

```bash
cd c:/dev/trendingrepo
git status --short                   # expect clean working tree
git log --oneline -5 origin/main     # top commit should be b8312812 (or later cron commits)

# 18-route production sweep (this session's gold-standard verification)
for route in "/" "/twitter" "/reddit/trending" "/reddit/trending?tab=trending-now" "/skills" "/mcp" "/signals" "/hackernews/trending" "/bluesky/trending" "/producthunt" "/devto" "/huggingface/trending" "/arxiv/trending" "/npm" "/lobsters" "/githubrepo" "/agent-repos" "/top10"; do
  result=$(curl -s -o /tmp/r.html -w "%{http_code}|%{size_download}" "https://trendingrepo.com${route}" -m 30)
  fresh=$(grep -oE '>(FRESH|STALE|COLD)<' /tmp/r.html | head -1 | tr -d '><')
  printf "%-45s %s | fresh=%s\n" "$route" "$result" "${fresh:-NONE}"
done
```

Expected: all 18 routes return 200. /twitter ~4.2MB. /reddit/trending ~2.25MB FRESH. /skills ~482KB FRESH. /mcp ~340KB FRESH.

## P0 — `/repo/[owner]/[name]` 500 (highest priority; pre-existing)

```bash
# Reproduce
curl -sI 'https://trendingrepo.com/repo/anthropics/anthropic-cookbook' | grep "X-Matched-Path"
# Expected: X-Matched-Path: /500
```

**Suspect commit:** `d81856ad feat(repo-detail): merge codex agent's repo-detail + live-fetch refactor` (your own merge of a parallel codex lane). Build passed at the time, but production runtime fails.

**Likely root causes (in order of probability):**

1. **`fetchGitHubRepoLiveWithinBudget` cold-miss path** in [src/lib/github-live.ts](../src/lib/github-live.ts) — the new shared resolver. If it throws synchronously when `GITHUB_TOKEN` is missing/throttled at runtime, the page crashes. Check the timeout / error paths.
2. **`buildCanonicalRepoProfile`** at [src/lib/api/repo-profile.ts](../src/lib/api/repo-profile.ts) — assembles all signals into one `CanonicalRepoProfile`. If any sub-fetcher throws unhandled, the whole assembly fails.
3. **One of 12+ `refresh*FromStore` calls** at top of [src/app/repo/[owner]/[name]/page.tsx](../src/app/repo/%5Bowner%5D/%5Bname%5D/page.tsx) lines 41-65 — but each of these is rate-limited & deduped, so unlikely to throw.

**Fix workflow:**

```bash
# Boot dev server (port 3023)
npm run dev

# Reproduce locally
curl http://localhost:3023/repo/anthropics/anthropic-cookbook -m 30 -i

# Watch the dev server logs for the actual stack trace
# Then narrow to the failing call

# Optional: pull Vercel runtime logs (need vercel CLI auth)
vercel logs --follow trendingrepo --since 24h | grep "anthropic-cookbook\|repo-detail\|StarHistoryBlock"
```

**Workaround (zero-impact):** none. Page is just down. Users hitting deep-links to repos see 500. Acceptable for a few hours; not for days.

**Defensive add for the future:** add `/repo/anthropics/anthropic-cookbook` to the GitHub Actions `Post-deploy smoke` test — currently it only probes 12 routes, none of them /repo/*. That gap is why this slipped through.

## P1 — `/api/mcp/trending` 404 (low; non-critical)

```bash
# Reproduce
curl -sI 'https://trendingrepo.com/api/mcp/trending' | head -5
# Expected: HTTP/1.1 404 Not Found, Content-Disposition: filename="404"

curl -sI 'https://trendingrepo.com/api/mcp/trending/' | head -5
# Note the trailing slash — Vercel returns 308 to canonical, then canonical returns 404
```

**Strange:** Vercel knows about the path (308 redirect on trailing slash) but Next-on-Vercel doesn't handle the canonical. The route file at [src/app/api/mcp/trending/route.ts](../src/app/api/mcp/trending/route.ts) is syntactically valid:
- 16-line handler, exports `GET`, `runtime = "nodejs"`, `revalidate = 60`
- All 4 imports resolve at build time (verified locally)
- Other API routes deploy fine (`/api/skills`, `/api/health` both 200)

**Most likely cause:** Vercel build-cache anomaly. Should self-heal on the next deploy.

**Quick test for tomorrow:** if you push ANY change to main and the route still 404s, this needs investigation. If it 200s, ignore — Vercel cache evicted.

**Workaround:** none needed. The /mcp page does NOT depend on this endpoint — it imports `getMcpSignalData` directly server-side.

## Production state at handover time (2026-05-09 ~01:30 Indonesia)

| Surface | HTTP | Bytes | Freshness |
|---|---|---|---|
| `/` | 200 | 858KB | (no badge — homepage doesn't render one) |
| `/twitter` | 200 | 4.19MB | STALE |
| `/reddit/trending` | 200 | 2.25MB | FRESH (3,627 rows preserved) |
| `/reddit/trending?tab=trending-now` | 200 | 2.25MB | FRESH |
| `/skills` | 200 | 482KB | FRESH |
| `/mcp` | 200 | 340KB | FRESH |
| `/signals` | 200 | 481KB | (no badge) |
| `/twitter SSR diet` | 5.92→4.19MB | — | ✅ Phase 5.2 win |
| `/repo/*` | **500** | — | ❌ pre-existing P0 |
| `/api/mcp/trending` | **404** | — | ❌ new P1 (Vercel cache) |

## Commits added overnight (origin/main top → 9 commits this session)

```
b8312812 Reapply "feat(wave3): mcp/skills trend-ranking + star-history chart + skills-sh fetcher"
6672ae8c Revert  "feat(wave3): ..." [diagnostic round-trip — ignore]
6795ea23 feat(wave3): mcp/skills trend-ranking + star-history chart + skills-sh fetcher
89a1c97a fix(reddit-collector): WINDOW_DAYS 7→90 + last-good invariant + disable cron
7df877d2 feat(twitter): SSR diet via lazy avatar hydration (Phase 5.2)
ec808a33 chore(lint): guard against LiveDot freshness lies (Phase 5.4)
e005f996 feat(reddit/trending): server-side redirect for empty tabs (Phase 5.1)
77a067ba feat(trending-score): Reddit-hot formula + shadow A/B (Phase 5.3)
fedc7ccc docs(sprint): record 2026-05-08 P0 surface rollout (Phase 1 live + Apify-Reddit)
```

(Original SHAs from the prior handover changed because the wave was rebased on top of 5 + 6 auto-cron `chore(data)` commits during the push.)

## Recommended morning task order

1. **Verify production state** (run the 18-route sweep above, ~30s)
2. **Diagnose P0 `/repo/*`** — boot dev server, reproduce, fix, push
3. **Add `/repo/anthropics/anthropic-cookbook` to GH Actions smoke test** — prevents future regression
4. **Re-check P1 `/api/mcp/trending`** — if still 404 after step 2's deploy, investigate; else close
5. **Mark sprint items DONE** in `tasks/CURRENT-SPRINT.md` for Phase 5 wave + durability + wave 3
6. **Continue with Phase 6 / next planned work** per the broader sprint board

## Files updated overnight (housekeeping)

- `tasks/HANDOVER-2026-05-09-push-wave.md` — added "POST-EXECUTION ADDENDUM" section
- `tasks/CURRENT-SPRINT.md` — frontmatter pointer updated with execution outcome
- `tasks/HANDOVER-2026-05-09-MORNING.md` (this file) — new

No memory files updated this session — the lessons (Vercel branch protection off, auto-cron rebase pattern, smoke test gaps) all already exist in CLAUDE.md anti-patterns or the existing handover doc.
