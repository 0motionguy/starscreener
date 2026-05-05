# Skills / Agents / MCP — priority lane for Marco + Sergio

**Ticket**: [SAM-12] (AGN-953) — Sergio + Marco coordination
**Depends on**: SAM-01 (AGN-942, DONE) classifier; SAM-03 (AGN-944, DONE) trending pages
**Status**: in effect — Marco's AGENTS.md / HEARTBEAT.md / MEMORY.md and Sergio's AGENTS.md updated 2026-05-05

## TL;DR

Repos that ARE skills, agents, or MCP servers are first-class citizens of the agent-commerce flywheel. They are NOT just another library. From this rule forward:

- **Marco** (repo briefs): when picking the next target each heartbeat, multiply `stars_velocity` by **2.0** if `getCategoryKind(repo)` returns `"skill" | "agent" | "mcp"`. Library repos get the default 1.0×.
- **Sergio** (SEO audit): treat `/trending/skills`, `/trending/agents`, `/trending/mcp`, and `/agent-commerce` as **Tier 1**. Audit them every cycle before any other route.

## Why this matters

trendingrepo.com's competitive moat is being the AI-search-first index for the agent economy. A brief on an MCP server is worth more than a brief on a JavaScript HTTP client, because:

1. **More surfaces** — the MCP brief renders on `/brief/<o>/<n>`, gets aggregated into `/trending/mcp` (SAM-03), and appears under `/agent-commerce` cross-links. A library brief renders on one page.
2. **More citation density** — agent-commerce content has higher `citation-density`, `delegate-economy-readiness`, and `entity-clarity` scores in AISO's rubric. LLMs cite that content disproportionately.
3. **Distribution flywheel** — the agent builders we want as readers (the Mirkos of the world) come for skills/agents/MCP content. Briefs on those repos compound the audience faster than library coverage does.
4. **Sergio + Marco compound** — when Marco ships a skill/agent/MCP brief, Sergio's SEO work on `/trending/skills` (etc.) is what surfaces it to AI search. A library brief that lands without a Tier-1 SEO surface gets indexed slower.

The 2× multiplier is intentionally moderate. We don't want to abandon library coverage entirely — libraries that genuinely surge in stars-velocity (e.g. a 3,000-stars-in-72h JS library) still beat a slow-moving MCP repo. The rule rewards skill/agent/mcp at the margin without hardcoding away from signal.

## The rule (Marco)

Source-of-truth: SAM-01 classifier output.

```ts
import { getCategoryKind } from "@/lib/repo-category-details";

const kind = getCategoryKind(repo);                     // "mcp" | "skill" | "agent" | "library"
const mult = (kind === "skill" || kind === "agent" || kind === "mcp") ? 2.0 : 1.0;
const priority = stars_velocity * mult;
```

Tie-break by **raw** `stars_velocity` (pre-multiplier) so two skill repos at identical priority resolve cleanly.

**Worked example** (illustrative — numbers fabricated for demonstration):

| owner/name              | category | stars/d | mult | priority | rank |
|-------------------------|----------|--------:|-----:|---------:|-----:|
| `acme/super-fast-orm`   | library  |     400 |  1.0 |      400 |    3 |
| `org/widget-mcp`        | mcp      |     250 |  2.0 |      500 |    2 |
| `solo/agent-skills-v2`  | skill    |     300 |  2.0 |      600 |    1 |
| `corp/yet-another-lint` | library  |     150 |  1.0 |      150 |    4 |

Without SAM-12: `super-fast-orm` is picked first. With SAM-12: `agent-skills-v2` and `widget-mcp` jump ahead. `super-fast-orm` still beats the second library, so genuine library hits aren't suppressed.

## The rule (Sergio)

Audit priority — see also Sergio's `AGENTS.md` § S1:

- **Tier 1** (audit first, every cycle): `/trending/skills`, `/trending/agents`, `/trending/mcp`, `/agent-commerce`.
- **Tier 2**: `/trending`, `/signals`, `/repo/<o>/<n>`.
- **Tier 3**: everything else under `src/app/**/page.tsx`.

The first SEO audit after this rule lands must cover all four Tier-1 pages in full before moving to Tier 2. Findings filed as `[SEO-*]` issues should carry a `Tier 1` label so triage matches Marco's brief priorities.

## Coordination contract (so Marco and Sergio don't conflict)

- Marco owns the brief content (the long narrative on `/brief/<o>/<n>`).
- Sergio owns the meta + JSON-LD + internal linking on `/trending/{skills,agents,mcp}` (the index pages that link Marco's briefs).
- When Marco ships a brief for a skill/agent/mcp repo, Sergio's next audit cycle picks up the new internal link automatically (the `/trending/<bucket>` page already filters by category — SAM-03).
- The 1-line "why" on repo cards (Sergio S3) MAY quote Marco's brief `hook` field once a fresh brief exists. Until then, Sergio's "why" is signal-derived.

## What this is NOT

- **Not a hard filter.** Library briefs still get written when their stars-velocity dominates. The 2× is a multiplier, not a gate.
- **Not a queue rewrite.** No new code path added; the rule lives inside Marco's "Pick target" step. The brief data model (`brief:<o>:<n>`) is unchanged.
- **Not a JSON-emitted priority field.** Marco's pseudocode reads category from the existing classifier output in-memory — there is no new persisted priority artifact.

## Verification

- Marco's `AGENTS.md` § Workflow per heartbeat → "Pick target" now contains the priority formula and a code reference to `getCategoryKind`.
- Marco's `HEARTBEAT.md` § "Pick target (if no current task)" pseudocode includes the multiplier step.
- Marco's `MEMORY.md` § "Pinned facts" carries the rule with a date stamp so it survives heartbeat resets.
- Sergio's `AGENTS.md` § S1 carries the Tier 1 / Tier 2 / Tier 3 ordering.
- This doc (`docs/skills-agents-mcp-priority.md`) is the single source of truth — both agents reference it by path.
