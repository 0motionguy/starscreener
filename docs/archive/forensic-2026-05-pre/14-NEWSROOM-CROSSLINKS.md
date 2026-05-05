# 14 - NEWSROOM CROSS-LINKS

Date: 2026-05-05  
Issue: AGN-793 ([SEO-004] Cross-link STARSCREENER ↔ agnt.newsroom synergy)

## Goal

Establish bidirectional link equity between STARSCREENER repo pages and AGNT Newsroom coverage.

- STARSCREENER side: render a `<NewsroomCallout>` on matched `/repo/[owner]/[name]` pages.
- Newsroom side (read-only from this repo): provide canonical backlink targets that should be added to each corresponding AGNT Newsroom page.

## STARSCREENER implementation pattern

1. Maintain repo → newsroom mapping in `src/lib/newsroom-crosslinks.ts`.
2. Resolve mapping at runtime in `src/app/repo/[owner]/[name]/page.tsx`.
3. Render `NewsroomCallout` when mapping exists.

Component and integration files:

- `src/components/repo-detail/NewsroomCallout.tsx`
- `src/lib/newsroom-crosslinks.ts`
- `src/app/repo/[owner]/[name]/page.tsx`

## Established cross-links (5)

1. Repo: `anthropics/claude-code`  
   STARSCREENER: `https://trendingrepo.com/repo/anthropics/claude-code`  
   Newsroom URL: `https://agnt.newsroom/anthropics-claude-code-v2.1.111`  
   Source evidence: `inputs/releases/20260418-012507-anthropics-claude-code-v2.1.111.json`

2. Repo: `anthropics/anthropic-sdk-python`  
   STARSCREENER: `https://trendingrepo.com/repo/anthropics/anthropic-sdk-python`  
   Newsroom URL: `https://agnt.newsroom/anthropics-anthropic-sdk-python-v0.96.0`  
   Source evidence: `inputs/releases/20260418-012507-anthropics-anthropic-sdk-python-v0.96.0.json`

3. Repo: `openai/openai-agents-python`  
   STARSCREENER: `https://trendingrepo.com/repo/openai/openai-agents-python`  
   Newsroom URL: `https://agnt.newsroom/openai-openai-agents-python-v0.14.1`  
   Source evidence: `inputs/releases/20260416-075331-openai-openai-agents-python-v0.14.1.json`

4. Repo: `langchain-ai/langchain`  
   STARSCREENER: `https://trendingrepo.com/repo/langchain-ai/langchain`  
   Newsroom URL: `https://agnt.newsroom/langchain-ai-langchain-langchain-core-1.2.30`  
   Source evidence: `inputs/releases/20260416-075333-langchain-ai-langchain-langchain-core==1.2.30.json`

5. Repo: `crewAIInc/crewAI`  
   STARSCREENER: `https://trendingrepo.com/repo/crewAIInc/crewAI`  
   Newsroom URL: `https://agnt.newsroom/crewaiinc-crewai-1.14.2a3`  
   Source evidence: `inputs/releases/20260414-070502-crewAIInc-crewAI-1.14.2a3.json`

## Newsroom-side canonical backlink actions (for user/apply on newsroom repo)

For each newsroom URL above, add a canonical in-body mention (or dedicated reference block) linking back to its STARSCREENER repo URL.

Suggested anchor text pattern:

- `Live repo intelligence on STARSCREENER: https://trendingrepo.com/repo/<owner>/<name>`

## Verification

- Added unit coverage for mapping integrity and lookup:
  - `src/lib/__vitest__/newsroom-crosslinks.test.ts`

## Next action

Validate that each newsroom URL resolves publicly; if any slug differs in production, update `src/lib/newsroom-crosslinks.ts` to exact live slug and keep backlink pairings unchanged.

