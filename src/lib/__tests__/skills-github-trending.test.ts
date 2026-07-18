import assert from "node:assert/strict";
import test from "node:test";

import { selectGithubSkillsTrending } from "@/lib/skills-github-trending";
import type { Repo } from "@/lib/types";

function repo(
  fullName: string,
  options: {
    description?: string;
    topics?: string[];
    momentumScore?: number;
  } = {},
): Repo {
  const [owner = "", name = ""] = fullName.split("/");
  return {
    fullName,
    owner,
    name,
    description: options.description ?? "",
    topics: options.topics ?? [],
    momentumScore: options.momentumScore ?? 0,
  } as Repo;
}

test("selectGithubSkillsTrending includes canonical packs case-insensitively", () => {
  const selected = selectGithubSkillsTrending([
    repo("AnthropicS/Skills", { momentumScore: 1 }),
    repo("unrelated/runtime", { momentumScore: 100 }),
  ]);

  assert.deepEqual(selected.map((item) => item.fullName), ["AnthropicS/Skills"]);
});

test("selectGithubSkillsTrending requires strong skill-pack identity", () => {
  const selected = selectGithubSkillsTrending([
    repo("good/agent-skills", { topics: ["agent-skills"], momentumScore: 6 }),
    repo("good/skills", { topics: ["cursor-skills"], momentumScore: 5 }),
    repo("nextlevelbuilder/ui-ux-pro-max-skill", {
      topics: ["ai-skills"],
      momentumScore: 4,
    }),
    repo("coreyhaines31/marketingskills", {
      description: "Marketing skills for Claude Code and AI agents",
      momentumScore: 3,
    }),
    repo("safishamsi/graphify", {
      description: "AI coding assistant skill for Claude Code, Codex, Cursor, and Gemini",
      topics: ["skills"],
      momentumScore: 2,
    }),
    repo("good/spec-pack", {
      description: "Reusable coding-agent capabilities, each shipped with a SKILL.md file",
      momentumScore: 1,
    }),
    repo("Imbad0202/academic-research-skills", { momentumScore: 0.5 }),
    repo("noise/soft-skills", {
      description: "Improve communication and leadership skills for your resume",
      topics: ["skills"],
      momentumScore: 99,
    }),
    repo("noise/alexa-skills", {
      description: "Examples for building Alexa skills",
      topics: ["alexa-skills"],
      momentumScore: 98,
    }),
    repo("noise/agent-runtime", {
      description: "Agent runtime that includes tools and skills",
      topics: ["agent-skills"],
      momentumScore: 97,
    }),
    repo("noise/rpg-skill-tree", {
      description: "A course for designing game skill trees",
      topics: ["agent-skills"],
      momentumScore: 96,
    }),
    repo("googleworkspace/cli", {
      description: "Official CLI. Includes AI agent skills.",
      topics: ["agent-skills"],
      momentumScore: 95,
    }),
    repo("code-yeongyu/oh-my-openagent", {
      description: "An agent harness and orchestration runtime",
      topics: ["claude-skills"],
      momentumScore: 94,
    }),
    repo("thedotmack/claude-mem", {
      description: "Persistent context and memory for every agent",
      topics: ["claude-skills"],
      momentumScore: 93,
    }),
    repo("calesthio/OpenMontage", {
      description: "Agentic video production system with 500+ agent skills",
      topics: ["agentic-ai"],
      momentumScore: 92,
    }),
  ]);

  assert.deepEqual(selected.map((item) => item.fullName), [
    "good/agent-skills",
    "good/skills",
    "nextlevelbuilder/ui-ux-pro-max-skill",
    "coreyhaines31/marketingskills",
    "safishamsi/graphify",
    "good/spec-pack",
    "Imbad0202/academic-research-skills",
  ]);
});

test("selectGithubSkillsTrending ranks canonical packs first, then momentum, and respects limit", () => {
  const selected = selectGithubSkillsTrending(
    [
      repo("community/hot-codex-skills", { topics: ["codex-skills"], momentumScore: 90 }),
      repo("openai/skills", { momentumScore: 5 }),
      repo("community/warm-agent-skills", { topics: ["coding-agent-skills"], momentumScore: 50 }),
      repo("obra/superpowers", { momentumScore: 1 }),
    ],
    3,
  );

  assert.deepEqual(selected.map((item) => item.fullName), [
    "openai/skills",
    "obra/superpowers",
    "community/hot-codex-skills",
  ]);
});

test("selectGithubSkillsTrending recognizes primary skill phrasing without admitting bundled-skill products", () => {
  const selected = selectGithubSkillsTrending([
    repo("wanshuiyin/Auto-claude-code-research-in-sleep", {
      description: "ARIS — Lightweight Markdown-only skills for autonomous ML research",
      topics: ["claude-code-skills"],
    }),
    repo("microsoft/waza", {
      description: "CLI / Framework for Agent Skills - create, test, and measure skills",
      topics: ["agent-skills"],
    }),
    repo("neilsonnn/image-blaster", {
      description: "An image generation skillset for Claude",
      topics: ["claude-skills"],
    }),
    repo("romainsimon/paperasse", {
      description: "Skills pour agents IA",
      topics: ["agent-skills", "claude-skills"],
    }),
    repo("EvanBacon/agent-rsvp", {
      description: "A scheduling skill for agents",
      topics: ["agent-skills"],
    }),
    repo("googleworkspace/cli", {
      description: "Official CLI. Includes AI agent skills.",
      topics: ["agent-skills"],
    }),
    repo("calesthio/OpenMontage", {
      description: "Agentic video production system with 500+ agent skills",
      topics: ["agent-skills"],
    }),
  ]);

  assert.deepEqual(selected.map((item) => item.fullName), [
    "wanshuiyin/Auto-claude-code-research-in-sleep",
    "microsoft/waza",
    "neilsonnn/image-blaster",
    "romainsimon/paperasse",
    "EvanBacon/agent-rsvp",
  ]);
});
