# Agent Skills integration

TrendingRepo ships three [Anthropic Agent Skills](https://agentskills.io) — portable markdown playbooks that teach Claude (and any other spec-compliant agent) how to combine TrendingRepo's tools for the common high-signal workflows.

Skills live under [skills/](../../skills/). Each skill is a folder containing a `SKILL.md` with YAML frontmatter + markdown body.

## The three skills

| Name | Trigger phrase | Tools used |
|---|---|---|
| [`screen-trending-repos`](../../skills/screen-trending-repos/SKILL.md) | "What's trending this week?" | `top_gainers`, `search_repos`, `maintainer_profile` |
| [`investigate-maintainer`](../../skills/investigate-maintainer/SKILL.md) | "Who's behind `<handle>`?" | `maintainer_profile`, `search_repos`, `top_gainers` |
| [`weekly-report`](../../skills/weekly-report/SKILL.md) | "Give me a weekly brief." | `top_gainers`, `maintainer_profile` |

Each skill uses the Portal-canonical tool names so it works whether the agent has `trendingrepo-mcp` installed OR uses Portal drive-by to `trendingrepo.com/portal`.

## Try it in 60 seconds — Claude Code

```bash
# 1. Open Claude Code in this repo.
claude-code

# 2. Invoke a skill.
/screen-trending-repos
/investigate-maintainer anthropics
/weekly-report
```

The skill auto-loads based on the description field's relevance to your conversation. You can also invoke it explicitly as a slash-command.

## Try it in 60 seconds — Cursor / Codex / other

Any agent that implements the Agent Skills open standard can load these skills from disk. Copy the `skills/` folder into your project, or link to it. The agent reads each `SKILL.md`'s frontmatter at startup, auto-invokes when the user's prompt matches the description.

## Frontmatter

Per the [agentskills.io spec](https://agentskills.io/specification):

```yaml
---
name: skill-name              # lowercase + hyphens; must match the folder name
description: "..."            # 1–1024 chars; describes WHAT it does and WHEN to use it
license: MIT                  # optional
metadata:                     # optional
  version: "0.1.0"
  source: trendingrepo.com
---
```

The `description` field is the only thing most agents use for auto-invoke, so it matters. TrendingRepo's skill descriptions all begin with "Use when…" followed by a comma-separated set of user intents.

## Design principles

1. **Callable everywhere.** Skills don't hard-code how they reach the tools. They name the tool and trust the agent runtime to have either MCP or Portal access.
2. **Filtering discipline.** Every skill includes "what to filter out" guidance — noise floors, dedup rules, refusal criteria — so the agent doesn't dump raw tool output on the user.
3. **Honest bounds.** The `maintainer_profile` scope note, the no-mock rule, and the rate-limit advice are all called out explicitly in the relevant skill so agents don't overclaim.
4. **No emoji, no filler.** Consistent with TrendingRepo's voice.

## Authoring a new skill

1. Make a folder under `skills/<slug>/` where `<slug>` is lowercase-hyphen, 1-64 chars.
2. Write `SKILL.md` with the frontmatter above + your playbook.
3. Reference Portal-canonical tool names (`top_gainers`, `search_repos`, `maintainer_profile`).
4. Validate the frontmatter with `skills-ref validate ./skills/<slug>` if you have the CLI.
5. Load into a Claude Code session and iterate until the skill triggers correctly and produces useful output.
