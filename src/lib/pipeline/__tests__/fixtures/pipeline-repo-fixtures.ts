import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Repo } from "../../../types";
import { __resetDerivedReposCache } from "../../../derived-repos";
import { makeRepo } from "../../../../test-utils/factories";
import { FILES } from "../../storage/file-persistence";

const REQUIRED_REPOS: Repo[] = [
  makeRepo({
    fullName: "ollama/ollama",
    id: "ollama--ollama",
    name: "ollama",
    owner: "ollama",
    language: "Go",
    categoryId: "local-llm",
    tags: ["local-llm"],
  }),
  makeRepo({
    fullName: "langchain-ai/langchain",
    id: "langchain-ai--langchain",
    name: "langchain",
    owner: "langchain-ai",
    language: "Python",
    categoryId: "ai-agents",
    tags: ["ai-agents"],
  }),
  makeRepo({
    fullName: "huggingface/transformers",
    id: "huggingface--transformers",
    name: "transformers",
    owner: "huggingface",
    language: "Python",
    categoryId: "ml-frameworks",
    tags: ["ml-frameworks"],
  }),
  makeRepo({
    fullName: "vercel/next.js",
    id: "vercel--next-js",
    name: "next.js",
    owner: "vercel",
    categoryId: "web-frameworks",
    tags: ["web-frameworks"],
  }),
  makeRepo({
    fullName: "openai/whisper",
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
