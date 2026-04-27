import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Repo } from "../../../types";
import { __resetDerivedReposCache } from "../../../derived-repos";
import { FILES } from "../../storage/file-persistence";

function makeRepo(fullName: string, overrides: Partial<Repo> = {}): Repo {
  const [owner, name] = fullName.split("/") as [string, string];
  const id = `${owner}--${name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  return {
    id,
    fullName,
    name,
    owner,
    ownerAvatarUrl: `https://github.com/${owner}.png`,
    description: `${fullName} fixture repo`,
    url: `https://github.com/${fullName}`,
    language: "TypeScript",
    topics: [],
    categoryId: "fixture",
    stars: 1000,
    forks: 100,
    contributors: 10,
    openIssues: 5,
    lastCommitAt: "2026-04-20T00:00:00.000Z",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2020-01-01T00:00:00.000Z",
    starsDelta24h: 1,
    starsDelta7d: 7,
    starsDelta30d: 30,
    forksDelta7d: 1,
    contributorsDelta30d: 1,
    hasMovementData: true,
    momentumScore: 50,
    movementStatus: "stable",
    rank: 1,
    categoryRank: 1,
    sparklineData: Array.from({ length: 30 }, (_, i) => 1000 + i),
    socialBuzzScore: 0,
    mentionCount24h: 0,
    tags: ["fixture"],
    ...overrides,
  };
}

const REQUIRED_REPOS: Repo[] = [
  makeRepo("ollama/ollama", {
    id: "ollama--ollama",
    name: "ollama",
    owner: "ollama",
    language: "Go",
    categoryId: "local-llm",
    tags: ["local-llm"],
  }),
  makeRepo("langchain-ai/langchain", {
    id: "langchain-ai--langchain",
    name: "langchain",
    owner: "langchain-ai",
    language: "Python",
    categoryId: "ai-agents",
    tags: ["ai-agents"],
  }),
  makeRepo("huggingface/transformers", {
    id: "huggingface--transformers",
    name: "transformers",
    owner: "huggingface",
    language: "Python",
    categoryId: "ml-frameworks",
    tags: ["ml-frameworks"],
  }),
  makeRepo("vercel/next.js", {
    id: "vercel--next-js",
    name: "next.js",
    owner: "vercel",
    categoryId: "web-frameworks",
    tags: ["web-frameworks"],
  }),
  makeRepo("openai/whisper", {
    id: "openai--whisper",
    name: "whisper",
    owner: "openai",
    language: "Python",
    categoryId: "speech-ai",
    tags: ["speech-ai"],
  }),
];

let fixtureDataDir: string | null = null;

function ensureFixtureDataDir(): string {
  if (!fixtureDataDir) {
    fixtureDataDir = mkdtempSync(join(tmpdir(), "starscreener-pipeline-fixtures-"));
  }
  process.env.STARSCREENER_DATA_DIR = fixtureDataDir;
  return fixtureDataDir;
}

export function ensurePipelineRepoJsonlFixture(): void {
  const dataDir = ensureFixtureDataDir();
  const reposPath = join(dataDir, FILES.repos);
  mkdirSync(dataDir, { recursive: true });

  const existing = existsSync(reposPath) ? readFileSync(reposPath, "utf8") : "";
  const names = new Set<string>();
  for (const line of existing.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as { fullName?: unknown };
      if (typeof row.fullName === "string") names.add(row.fullName.toLowerCase());
    } catch {
      // Keep parity with the runtime JSONL loader: corrupt rows are ignored.
    }
  }

  const missing = REQUIRED_REPOS.filter(
    (repo) => !names.has(repo.fullName.toLowerCase()),
  );
  if (missing.length > 0) {
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    const rows = missing.map((repo) => JSON.stringify(repo)).join("\n");
    writeFileSync(reposPath, `${existing}${prefix}${rows}\n`, "utf8");
  }

  __resetDerivedReposCache();
}
