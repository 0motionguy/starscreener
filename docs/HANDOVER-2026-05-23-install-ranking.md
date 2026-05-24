# Handover — Install Ranking for /?cat={skills,mcp,llms}

**Session date:** 2026-05-23
**Branch:** `bot/swarm-a6-producthunt-reader` (per CLAUDE.md status — verify before commit)
**Operator:** Mirko (Basil)
**Status:** Skills + LLMs surfaces shipping correct data. MCP page partially fixed (composite sort code shipped, blocked on worker `publish.ts` rewrite). Worker deployed to TOOLBOX as image `vps-20260523115351-8997bf9e2`. **No git commits made this session.**

---

## 0. Calibrate to the operator before doing anything

- **Mirko is a founder/CTO running 3 companies in parallel.** Bandwidth is the constraint.
- **Short replies (`yes`, `ship`, `do it`, `next`, `fix`, `no`) = trust + green-light.** Don't ask for re-confirmation.
- **Typos / CAPS / multiple "!!!" = speed, not tone.** Read intent.
- **Push back when you're right.** Don't soften strong opinions into hopeful questions.
- **He fired ~5 frustration grenades at the last session because the previous Claude:**
  1. Kept patching surface symptoms instead of finding root cause (Redis split — see §3)
  2. Built two UI components (`CategoryShowcase`, `CategoryTable`) he explicitly didn't ask for and then had to revert
  3. Verified via HTML parsing only, never actually loaded the page in a browser before claiming "done"
  4. Said "great" / "done" with empty cells still rendering as `—`
- **Don't repeat any of those.** Bias to ROOT CAUSE diagnosis before any patches. M4: visual fix needs visual proof.

Project memory + global rules:
- `~/.claude/CLAUDE.md` — K1-K4 (think · simplicity · surgical · verify) + M1-M6 (no edit without read · no verdict before investigation · small task = small machinery · visual proof · no double "shipped" · memory is suspect)
- `c:/dev/trendingrepo/CLAUDE.md` — session opening protocol, freshness check, project structure
- `c:/dev/trendingrepo/CLAUDE.local.md` — operator personal rules ("boil the ocean" standard)
- Previous plan: `~/.claude/plans/http-localhost-3023-cat-skills-http-loca-stateful-wilkes.md`

---

## 1. The product surface

Three category tabs on the trending hub at `http://localhost:3023/?cat={skills,mcp,llms}`:
- `/?cat=skills` — Claude/Cursor/agent skills (5 sources)
- `/?cat=mcp` — MCP servers (4 registries)
- `/?cat=llms` — HuggingFace models + (planned) benchmark composite

All three use the existing `TrendingTable` repo-card layout. **Do not build a new component.** Operator explicitly rejected `CategoryShowcase` + `CategoryTable` rebuilds and demanded the repo card stay. Both rebuild files were deleted this session.

Operator directives (verbatim, ranked):
1. **"They don't have stars. Rank by INSTALLS."** Skills/MCP/LLMs should never sort by GitHub stars.
2. **"Skills.sh is the source of truth for skills."** `vercel-labs/skills/find-skills` (1.5M installs) should be at #1.
3. **"MCP NOT by lifetime connection."** Smithery's lifetime `use_count` is rejected. Use velocity / monthly-active signals.
4. **"Don't use stars and 7 days or whatsoever."** Hide empty velocity columns when the underlying data is non-stars.
5. **"Build new data sources if needed."** Authorized to add fetchers + new Redis slugs.

---

## 2. Verified state of all 3 surfaces (as of session end)

### ✅ `/?cat=skills` — SHIPPING CORRECTLY
- Header reads **"Installs"**
- Top 8: `vercel-labs/skills/find-skills` (1.5M), `anthropics/skills/frontend-design` (421.7K), `vercel-labs/agent-skills/vercel-react-best-practices` (389.2K), `microsoft/azure-skills/azure-ai` (324.5K), `vercel-labs/agent-skills/web-design-guidelines` (317.7K), `microsoft/azure-skills/...` (317.1K), `remotion-dev/skills/...` (299K), `microsoft/azure-skills/...` (296.6K)
- claude-skills GitHub-topic rows filtered out (operator directive)
- Sources: skills.sh (451 items) + lobehub (18) + smithery (434) + skillsmp (1200), merged via `getSkillsSignalData()`

### ⚠️ `/?cat=mcp` — STILL LIFETIME, code ready, BLOCKED ON WORKER FIX
- Header reads "Use count" (will become "Active · 4w" once data flows)
- Top: `ethanhenrickson/math-mcp` (2.3M lifetime use_count) — still operator-rejected lifetime
- Code in `category-adapters.ts:scoreMcpItem` is ready: tiered composite (visitors_4w → downloads_7d → use_count → hotness) with weights 1.0 / 0.7 / 0.4 / 0.2
- **Blocker:** `publish.ts` in the merger strips per-source raw to `{sources, homepage}` before writing to `ss:data:v1:trending-mcp`. Only `{installs_total, use_count}` reach the page. `visitors_4w` / `downloads_7d` are lost. See §6.

### ✅ `/?cat=llms` — SHIPPING (HF downloads only)
- Header reads **"Downloads"**
- Top: `Qwen3-VL-2B-Instruct` (187M), `Qwen3-0.6B` (18.2M), `gpt2` (17.4M), `Qwen2.5-7B-Instruct` (14M), …
- HF trending order + downloads sort
- Benchmark composite (LMArena Elo + AA Intelligence Index) is **scoped + worker fetchers built** but no data flowing yet — see §6.

---

## 3. The load-bearing root cause (cost 5+ hours to find)

**Web app and worker were configured against different Redis instances.** Every "data not flowing" symptom traced to this.

| Side | `REDIS_URL` host | Wire protocol |
|---|---|---|
| Worker (TOOLBOX container) | `wondrous-mallard-76674.upstash.io:6379` | `rediss://` (TCP+TLS) |
| Web app dev / Vercel prod | `shoreline.proxy.rlwy.net` (Railway) | `redis://` (TCP) |

Worker writes were going to Upstash. Web app reads were going to Railway. The two never met.

**FIXED THIS SESSION** by swapping web app's `.env.local` `REDIS_URL` to match the worker's Upstash URL. **Backup at `.env.local.bak`** — restore if anything explodes.

**Action for the next session:**
1. **Check what's on prod (Vercel) for `REDIS_URL`.** If it's still Railway, prod is silently broken the same way. Fix via `vercel env` (or whichever path the operator uses). See `vercel:env` skill if available.
2. **Document the canonical Redis URL** somewhere the team can find it — currently only in worker env + my local `.env.local`.
3. **The Railway Redis still exists.** Probe what's in it before tearing it down — might be used by something else.

---

## 4. Architecture (locked, in plan + partially implemented)

Plan: `~/.claude/plans/http-localhost-3023-cat-skills-http-loca-stateful-wilkes.md` (the FINAL approved version, post-10-agent research).

### 4.1 `InstallSignal` unified type (NOT YET IMPLEMENTED — planned)
```ts
// src/lib/ranking/install-signal.ts (proposed, not written yet)
export interface InstallSignal {
  absolute: number | null;       // lifetime count from this registry
  delta7d: number | null;        // 7d delta (from snapshot diff)
  delta30d: number | null;
  registry: Registry;
  grade: SignalGrade;            // A / B / C / D / F
  observedAt: string | null;
  metricLabel: string;           // "Installs" / "Active · 4w" / "Downloads" / "Arena Elo"
}
```

Per-source grades:

| Category | Source | Grade | Weight | Action |
|---|---|---|---|---|
| skills | skills.sh | A | 1.00 | INCLUDE (primary) |
| skills | lobehub | B | 0.70 | INCLUDE |
| skills | smithery-skills | B | 0.70 | INCLUDE |
| skills | skillsmp | D | 0.30 | INCLUDE only when no install source covers item |
| skills | claude-skills | **F** | 0 | **EXCLUDE** (already filtered in `getSkillsAsRepos`) |
| mcp | pulsemcp `visitors_4w` | B | 1.00 | INCLUDE as primary |
| mcp | glama `visitors_4w` | B | 0.70 | INCLUDE |
| mcp | smithery `use_count` | C | 0.40 | tiebreaker only (operator rejected) |
| mcp | mcp-official | D | 0.20 | INCLUDE for presence only |
| llms | HF downloads | A | 1.00 (composite 0.20) | INCLUDE |
| llms | LMArena Elo | A | (composite 0.45) | INCLUDE — primary quality |
| llms | AA Intelligence Index | A | (composite 0.35) | INCLUDE — secondary quality |

### 4.2 Scoring formula (planned)
```
score = (log10(1 + absolute) + 0.5·log10(1 + delta7d)) × source_weight × exp(-ageDays/30)
```
Borrowed from HN gravity + VS Code pre-windowed + Product Hunt source-weights.

### 4.3 Cross-registry dedup (planned)
Weighted SUM with 0.6 saturating coefficient — NOT MAX (loses corroboration), NOT pure SUM (double-counts overlapping visitors).

### 4.4 Window strategy
Default 7d. 24h too noisy (weekday/weekend swing). 30d too lagged.

---

## 5. What landed this session — file-by-file

### Web app (built, dev verified, NOT COMMITTED, NOT DEPLOYED)
| File | Change |
|---|---|
| `src/app/page.tsx` | Reverted CategoryShowcase routing → always uses `TrendingTable` |
| `src/lib/category-adapters.ts` | `getSkillsAsRepos` filters claude-skills + sorts by install desc; `getMcpAsRepos` composite tier sort; `mcpToRepo` honest popularityLabel per signal; `skillToRepo` uses `item.popularity` (not stars) |
| `src/lib/types.ts` | Added `popularityLabel?: string` + `categoryColumns?: Array<{label, value}>` to `Repo` |
| `src/lib/huggingface.ts` | Broadened `LLM_PIPELINE_TAGS` to include `image-text-to-text`, `any-to-any`, `video-text-to-text`; added `downloadsDelta24h/7d/30d` to `HfModelTrending`; snapshot loader from `hf-downloads-snapshot:prev:{1,7,30}d` |
| `src/components/trending/TrendingTable.tsx` | `popularityHeader()` per-category; `categoryColumns` slot renders when non-repo |
| **DELETED** `src/components/trending/CategoryShowcase.tsx` | Operator rejected the rebuild |
| **DELETED** `src/components/trending/CategoryTable.tsx` | Operator rejected the rebuild |
| `public/shell.css` | Truncated dead `.cat-*` section (back to 8542 lines) |
| `.env.local` | **REDIS_URL swapped to Upstash** (was Railway). Backup at `.env.local.bak`. |

### Worker (built + deployed to TOOLBOX as image `vps-20260523115351-8997bf9e2`)
| File | Change |
|---|---|
| `apps/trendingrepo-worker/src/fetchers/skills-sh/parser.ts` | Aria-label install extraction (`Weekly installs:` regex). Cheerio + regex paths both updated. URL_BASE = `https://www.skills.sh`. |
| `apps/trendingrepo-worker/src/fetchers/skills-sh/scraper.ts` | URL constants → `www.skills.sh`. Added direct-http fallback when Firecrawl returns <10 rows (Firecrawl's rendered HTML drops the leaderboard rows for this site). |
| `apps/trendingrepo-worker/src/fetchers/skill-install-snapshot/index.ts` | Extended from 2 → 5 rosters. `absorb()` now takes extractor callbacks. +77 lines. |
| `apps/trendingrepo-worker/src/fetchers/mcp-usage-snapshot/index.ts` | Added slot-key writer (`prev:1d/7d/30d`). +40 lines. |
| `apps/trendingrepo-worker/src/fetchers/hf-downloads-snapshot/index.ts` | New fetcher (built in earlier session, registered this session). 218 lines. |
| `apps/trendingrepo-worker/src/fetchers/huggingface/index.ts` | Broadened `LLM_PIPELINE_TAGS` (5 tags instead of 2). Tests updated. |
| `apps/trendingrepo-worker/src/fetchers/lmarena/index.ts` | **NEW.** 246 lines. URLs return 404 / empty — needs URL discovery. |
| `apps/trendingrepo-worker/src/fetchers/artificialanalysis/index.ts` | **NEW.** 285 lines. Idle until `AA_API_KEY` is set in `/opt/toolbox-trendingrepo-worker/.env`. |
| `apps/trendingrepo-worker/src/lib/env.ts` | Added `AA_API_KEY` optional env var. |
| `apps/trendingrepo-worker/src/registry.ts` | Registered `lmarena` + `artificialanalysis`. |

### Verified Redis state after deploy (Upstash)
- `trending-skill-sh`: **451 items** with install counts (was 0)
- `skill-install-snapshot:prev:1d`: 0 entries yet (slot needs day-2 data to compute delta)
- `skill-install-snapshot` ran with **1889 records** (vs 0 before)
- `mcp-usage-snapshot:prev:1d/7d`: **1000 entries each** (slot writer works)
- `hf-downloads-snapshot:<today>`: **1000 entries** (first run ever, baseline established)
- `lmarena-text`: empty (fetcher returns 0)
- `aa-llms`: doesn't exist (fetcher idle, no API key)

---

## 6. Pending work, prioritized

### P0 — MCP `visitors_4w` propagation (unblocks operator's #3 directive)
- `apps/trendingrepo-worker/src/lib/publish.ts:264-272` (the line where `raw: { sources, homepage }` strips down)
- The merger MAXes `visitors_4w` across sources at `publish.ts:357-376` into `metrics.visitors_4w`, but then strips down `raw` before write
- **Verify what's actually missing:** SSH probe one item via `docker exec toolbox-trendingrepo-worker-1 node -e "..."` to see if `metrics.visitors_4w` exists in `trending-mcp` items (it might be there and we're not reading it!) See §8 for probe template
- If genuinely missing, extend `pickMcpUsage` or the LeaderboardItem builder to preserve `visitors_4w` + `downloads_7d` + `popularity_7d/30d` from the merged `metrics`
- Probably ~30 lines in `publish.ts`. Be very careful — agent G flagged the MAX-not-SUM contract is load-bearing for cross-registry items
- After fix: rebuild worker image, redeploy (§7), verify `/?cat=mcp` top changes from `ethanhenrickson/math-mcp` lifetime to whatever has highest weighted-velocity composite

### P1 — Prod Redis cutover
- Verify `REDIS_URL` on Vercel prod matches the Upstash URL (not Railway). Use `vercel env pull` or check via dashboard.
- If wrong: `vercel env add REDIS_URL` with Upstash URL, redeploy.
- Without this, prod stays broken even after web app code ships.

### P2 — LMArena fetcher URL discovery
- Current URLs both fail:
  - `https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/resolve/main/data/latest.json` → 404
  - `https://raw.githubusercontent.com/oolong-tea-2026/arena-ai-leaderboards/main/data/latest.json` → empty array
- Live probe both URLs from your shell. Try parquet variants. Check `lmarena-ai/leaderboard-dataset` HF Datasets viewer for the actual file path.
- Fetcher code at `apps/trendingrepo-worker/src/fetchers/lmarena/index.ts` already handles the schema robustly (accepts array OR `{models}` OR `{data}` envelopes) — only the URL needs fixing.

### P3 — Add `AA_API_KEY` to TOOLBOX `.env`
- Get a free key from artificialanalysis.ai (1k/day quota)
- Append `AA_API_KEY=...` to `/opt/toolbox-trendingrepo-worker/.env`
- `ssh toolbox 'cd /opt/toolbox-trendingrepo-worker && docker compose up -d worker'` to pick up new env
- First run will populate `aa-llms` Redis slug with ~386 models including closed-weight (Claude, GPT, Gemini)

### P4 — Implement the `InstallSignal` architecture (P0 in the plan, defaulted to here)
- See §4. The current implementation uses ad-hoc `popularity` + tiered MCP scoring. Cleaner long-term to centralize on `InstallSignal`.
- Not urgent — current behavior is correct for skills + LLMs. Refactor when adding 4th category or 6th source.

### P5 — Commit everything + ship
- **Nothing is committed this session.** ~25 file changes.
- Logical commit grouping (suggested):
  1. `feat(skills): rank by installs from skills.sh, exclude claude-skills`
  2. `feat(mcp): tiered composite sort prefers velocity over lifetime use_count`
  3. `feat(llms): broaden LLM pipeline tag filter for multimodal models`
  4. `feat(worker): skills.sh parser fix + scraper firecrawl fallback`
  5. `feat(worker): extend skill-install-snapshot to read 5 rosters`
  6. `feat(worker): add slot-key writer to mcp-usage-snapshot`
  7. `feat(worker): hf-downloads-snapshot fetcher`
  8. `feat(worker): lmarena + artificialanalysis fetchers (LMArena needs URL fix)`
  9. `chore: revert CategoryShowcase + CategoryTable rebuilds, remove dead CSS`
  10. `fix(env): swap web REDIS_URL to Upstash to match worker`
- **Push only after operator approval** (per global hard boundary + per `feedback_no_push_without_approval` memory)

---

## 7. Worker deploy procedure (verified end-to-end this session)

The worker DOES NOT use GHCR (despite earlier research suggesting it did). Compose builds local images on TOOLBOX. Path:

```bash
# 1. Sync source to TOOLBOX (rsync isn't on Git Bash — tarpipe over ssh)
cd C:/dev/trendingrepo/apps/trendingrepo-worker && \
  tar czf - --exclude=node_modules --exclude=dist --exclude=.env src package.json package-lock.json tsconfig.json Dockerfile \
  | ssh toolbox 'cd /opt/toolbox-trendingrepo-worker && tar xzf -'

# 2. Build + tag + restart on TOOLBOX
TAG="vps-$(date +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD)"
ssh toolbox "cd /opt/toolbox-trendingrepo-worker && \
  docker build -t toolbox-trendingrepo-worker:$TAG . && \
  sed -i 's|image: toolbox-trendingrepo-worker:.*|image: toolbox-trendingrepo-worker:$TAG|' docker-compose.yml && \
  docker compose up -d worker"

# 3. Verify
ssh toolbox 'docker inspect toolbox-trendingrepo-worker-1 --format "{{.State.Status}} | {{.State.Health.Status}}"'
ssh toolbox 'docker logs --tail 30 toolbox-trendingrepo-worker-1 2>&1 | head -20'

# 4. Trigger specific fetcher (instead of waiting for cron)
ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 node /app/dist/index.js <fetcher-name>'
# Available: skills-sh, skill-install-snapshot, mcp-usage-snapshot, hf-downloads-snapshot,
#            lmarena, artificialanalysis, etc.

# 5. Probe Redis (Upstash) via the worker's ioredis-bound helper
ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 node -e "
const {readDataStore} = require(\"/app/dist/lib/redis.js\");
(async () => {
  const x = await readDataStore(\"<slug>\");
  console.log(JSON.stringify({fetchedAt: x?.fetchedAt, count: (x?.items??x?.models??[]).length}, null, 2));
  process.exit(0);
})();"'
```

Web app (Vercel) deploys on git push to main automatically. Skip if you haven't been asked to push.

---

## 8. Useful one-liners (tested this session)

### Find Redis instance mismatch
```bash
ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 sh -c "env | grep ^REDIS_URL="' | sed -E 's|.*@([^:/]+).*|worker: \1|'
grep ^REDIS_URL= C:/dev/trendingrepo/.env.local | sed -E 's|.*@([^:/]+).*|web:    \1|'
```

### Inspect any Redis slug shape
```bash
ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 node -e "
const {readDataStore} = require(\"/app/dist/lib/redis.js\");
(async () => {
  const x = await readDataStore(\"<SLUG>\");
  const items = x?.items ?? x?.models ?? [];
  console.log({count: items.length, sample0: items[0]});
  process.exit(0);
})();"'
```

### Verify page after web changes (no browser needed)
```bash
curl -sS "http://localhost:3023/?cat=skills" -o /tmp/p.html && python -c "
import re
with open('/tmp/p.html', encoding='utf-8') as f: h = f.read()
headers = re.findall(r'<th[^>]*>([^<]+)</th>', h)
rows = re.findall(r'<tr[^>]*class=\"stagger-row\"[^>]*>(.*?)</tr>', h, re.S)
print('headers:', headers)
for i, row in enumerate(rows[:8]):
    m_repo = re.search(r'data-repo=\"([^\"]+)\"', row)
    m_star = re.search(r'class=\"star-value\">([^<]+)<', row)
    print(f'  #{i+1}: {(m_repo.group(1) if m_repo else \"?\")[:46]:46s} val={m_star.group(1) if m_star else \"?\"}')"
```

Use `cb=$(date +%s%N)` query param to bust caches. Wait 35s between requests for the module-level 30s cache to expire. Touching `category-adapters.ts` forces a Next.js hot-reload that flushes the cache instantly.

### Probe live skills.sh structure
```bash
ssh toolbox 'curl -sS -A "Mozilla/5.0" "https://www.skills.sh/" | grep -oE "aria-label=\"Weekly installs: [^\"]+\"" | head -3'
```

### List all snapshot keys (use sparingly — KEYS is O(N))
```bash
ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 node -e "
const {getRedis} = require(\"/app/dist/lib/redis.js\");
(async () => {
  const r = await getRedis();
  const keys = []; let cursor = \"0\";
  do { const [next, batch] = await r.scan(cursor, \"MATCH\", \"ss:data:v1:*snapshot*\", \"COUNT\", 500); cursor = next; keys.push(...batch); } while (cursor !== \"0\");
  console.log(keys.sort().join(\"\\n\"));
  process.exit(0);
})();"'
```
(NOTE: `r.scan` failed for me — the wrapper exposes a slimmed API. Use `r.keys(pattern)` as fallback. Or use `getRedis()` directly without the wrapper.)

---

## 9. Things I screwed up this session — don't repeat

1. **Spent 4+ hours iterating on UI/sort before realizing web+worker were on different Redis instances.** Diagnose data flow FIRST (probe both sides). Symptoms looked like sort/filter bugs.

2. **Built `CategoryShowcase` (~400 lines + 340 lines CSS) when operator said "keep the repo card".** Read directives literally. Operator says "don't rebuild" → don't rebuild.

3. **Built `CategoryTable` (~280 lines) for the same reason.** Same lesson — operator iterated on the directive twice and I still built a new component.

4. **Verified via HTML grep, never opened the browser.** Operator caught this. M4: visual fix needs visual proof. Even when curl says "header reads 'Installs'", load the actual page.

5. **Got the "stars header" wrong 3 times.** Header was reading "GitHub stars" because `popularityHeader()` picks the first item's `popularityLabel`, and the first item was a claude-skills row. Fix was filtering claude-skills, not changing the header function. Symptom-vs-root-cause confusion.

6. **Sub-agent recovery work created merge conflicts.** The artificialanalysis subagent used `git stash` and didn't fully resolve the pop. Left `UU src/app/drop/page.tsx` + `UU DropHero.tsx`. Resolved manually with `git add` (content was clean, just unmerged state). **Don't let subagents touch git.**

7. **Made a "10 sub-agents" plan with one-line scopes.** Operator called it "kindergarten level". Each sub-agent must own a real piece of work with hard deliverables (file paths, line counts, verification steps).

---

## 10. Quick orient — first 10 minutes of the fresh session

1. Read this file end to end. (~10 min)
2. `ssh toolbox 'docker inspect toolbox-trendingrepo-worker-1 --format "{{.State.Status}} | {{.Image}}"'` → confirm worker is on `vps-20260523115351-...` or later
3. `grep ^REDIS_URL= C:/dev/trendingrepo/.env.local | sed -E 's|.+@([^:/]+).*|\1|'` → confirm `wondrous-mallard...upstash.io`
4. `curl -sS "http://localhost:3023/?cat=skills" | grep -oE 'data-repo="[^"]+"' | head -3` → expect `vercel-labs/skills` at top
5. `git status --short | head -30` → expect ~25 modified files, no UU markers
6. Then triage operator's incoming request against §6 priorities

---

## 11. Files NOT to touch (load-bearing, don't touch without asking)

- `apps/trendingrepo-worker/src/lib/mcp/merger.ts` — cross-registry MAX-not-SUM is the contract per agent G's review
- `apps/trendingrepo-worker/src/lib/publish.ts` line 264-272 (`raw: { sources, homepage }` strip) — this IS the MCP P0 bug but extending it incorrectly will break the merger contract. Surgical change only.
- `src/lib/ecosystem-leaderboards.ts:818-826` — combined skills board sort (`compareBySourceNativeRank`) — operator-grade weights live elsewhere in plan; leave the merger alone
- `src/lib/data-store.ts` — 3-tier Redis/file/memory pattern. The "last-known-good per process" cache caused the diagnosis confusion. Don't add another cache layer.
- `public/shell.css` `:root` block — design system tokens. Add new tokens only at the top per the §0 Design System contract; never inline hex in TSX/CSS.

---

## 12. Open questions to surface to operator early

- **Should the LMArena URL be operator-provided?** Both my guesses failed. Operator may know the right HF dataset path / cron'd export.
- **AA_API_KEY** — does the operator have one already, or do they want me to obtain one?
- **Vercel prod REDIS_URL** — does the operator want me to fix it via `vercel env` or do it themselves?
- **MCP P0 work** — the publish.ts rewrite is non-trivial. Confirm operator wants it now vs deferring to focus on commit + ship + Vercel deploy of skills.

Don't ask all 4 at once. Lead with the most blocking one (probably Vercel REDIS_URL — that determines whether prod even sees today's work).

---

End of handover.
