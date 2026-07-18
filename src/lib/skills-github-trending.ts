// High-confidence coding-agent skill repositories from the derived GitHub
// corpus. This intentionally rejects the broad word "skills": without an
// agent/coding qualifier it matches careers, courses, games, and Alexa packs.

import { getDerivedRepos } from "@/lib/derived-repos";
import type { Repo } from "@/lib/types";

const SKILLS_WHITELIST = new Set([
  "anthropics/skills",
  "openai/skills",
  "mattpocock/skills",
  "vercel-labs/skills",
  "browserbase/skills",
  "sickn33/antigravity-awesome-skills",
  "github/awesome-copilot",
  "obra/superpowers",
]);

const STRONG_TOPICS = new Set([
  "agent-skill",
  "agent-skills",
  "agentic-skill",
  "agentic-skills",
  "ai-skill",
  "ai-skills",
  "ai-agent-skills",
  "claude-code-skill",
  "claude-code-skills",
  "claude-skill",
  "claude-skills",
  "codex-skill",
  "codex-skills",
  "copilot-skill",
  "copilot-skills",
  "coding-agent-skills",
  "cursor-skill",
  "cursor-skills",
  "gemini-skill",
  "gemini-skills",
  "mcp-skill",
  "mcp-skills",
  "openclaw-skill",
  "openclaw-skills",
  "skill-md",
]);

const NAME_IDENTITY_RE = /(?:^|[-_.])skills?(?:$|[-_.])|skills?$/i;

const DESCRIPTION_IDENTITY_PATTERNS = [
  /\bSKILL\.md\b/i,
  /\b(?:skills?|skillsets?)\s+(?:for|pour)\s+(?:agents?(?:\s+ia)?|ai[\s-]+agents?|coding[\s-]+agents?|claude(?:[\s-]+code)?|codex|copilot|cursor|gemini|openclaw)\b/i,
  /\b(?:catalog|collection|framework|library|marketplace|pack|repository|repo|suite|toolkit)\s+(?:\/\s+(?:framework|toolkit)\s+)?(?:for\s+|of\s+)?(?:installable\s+|reusable\s+)?(?:ai[\s-]+|agent(?:ic)?[\s-]+|claude(?:[\s-]+code)?[\s-]+|codex[\s-]+|copilot[\s-]+|cursor[\s-]+|gemini[\s-]+|openclaw[\s-]+)?(?:skills?|skillsets?)\b/i,
  /^(?:an?\s+|the\s+)?(?:(?:ai|coding[\s-]+assistant|claude(?:[\s-]+code)?|codex|copilot|cursor|gemini|openclaw)[\s-]+){0,3}(?:skills?|skillsets?)\b/i,
  /^(?:lightweight[\s-]+)?(?:markdown[\s-]+only[\s-]+)?(?:skills?|skillsets?)\b/i,
  /\blightweight[\s-]+markdown[\s-]+only[\s-]+skills?\b/i,
];

const FALSE_POSITIVE_RE =
  /\b(?:alexa|career|careers|course|courses|game|games|interview|job|jobs|leadership|lesson|lessons|resume|tutorial|tutorials|upskill|workshop|workshops)\b|soft[\s._-]*skills?|skill[\s._-]*tree/i;

interface RankedSkill {
  repo: Repo;
  whitelisted: boolean;
}

function hasStrongSkillTopic(repo: Repo): boolean {
  const topics = (repo.topics ?? []).map((topic) => topic.toLowerCase());
  return topics.some((topic) => STRONG_TOPICS.has(topic));
}

function hasPrimarySkillIdentity(repo: Repo): boolean {
  const name = repo.name.toLowerCase();
  const description = repo.description ?? "";

  if (DESCRIPTION_IDENTITY_PATTERNS.some((pattern) => pattern.test(description))) return true;
  if (!NAME_IDENTITY_RE.test(name)) return false;

  // A repo literally named `skill`/`skills` is ambiguous. Require a
  // coding-agent topic unless the description already established identity.
  if (name === "skill" || name === "skills") return hasStrongSkillTopic(repo);
  return true;
}

export function selectGithubSkillsTrending(repos: Repo[], limit = 100): Repo[] {
  const ranked: RankedSkill[] = [];

  for (const repo of repos) {
    const key = repo.fullName.toLowerCase();
    const whitelisted = SKILLS_WHITELIST.has(key);
    const identity = [repo.fullName, repo.name, repo.description].filter(Boolean).join(" ");

    if (!whitelisted && FALSE_POSITIVE_RE.test(identity)) continue;
    // Topics are supporting metadata, not identity. Agent runtimes and CLIs
    // frequently advertise bundled skills; the repo itself must be a skill,
    // pack, catalog, or skill-management surface to enter this category.
    if (!whitelisted && !hasPrimarySkillIdentity(repo)) continue;
    ranked.push({ repo, whitelisted });
  }

  ranked.sort((a, b) => {
    if (a.whitelisted !== b.whitelisted) return a.whitelisted ? -1 : 1;
    return (b.repo.momentumScore ?? 0) - (a.repo.momentumScore ?? 0);
  });

  return ranked.slice(0, Math.max(0, limit)).map(({ repo }) => repo);
}

export function getGithubSkillsTrending(limit = 100): Repo[] {
  return selectGithubSkillsTrending(getDerivedRepos(), limit);
}

export function getGithubSkillsTrendingCount(): number {
  return getGithubSkillsTrending(10_000).length;
}
