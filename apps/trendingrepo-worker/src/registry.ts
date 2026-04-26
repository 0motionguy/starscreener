import type { Fetcher } from './lib/types.js';

import huggingface from './fetchers/huggingface/index.js';
import github from './fetchers/github/index.js';
import bluesky from './fetchers/bluesky/index.js';
import pulsemcp from './fetchers/pulsemcp/index.js';
import smithery from './fetchers/smithery/index.js';
import mcpSo from './fetchers/mcp-so/index.js';
import claudeSkills from './fetchers/claude-skills/index.js';
import mcpServersRepo from './fetchers/mcp-servers-repo/index.js';
import hackernews from './fetchers/hackernews/index.js';
import producthunt from './fetchers/producthunt/index.js';
import devto from './fetchers/devto/index.js';
import reddit from './fetchers/reddit/index.js';

export const FETCHERS: Fetcher[] = [
  huggingface,
  github,
  bluesky,
  pulsemcp,
  smithery,
  mcpSo,
  claudeSkills,
  mcpServersRepo,
  hackernews,
  producthunt,
  devto,
  reddit,
];

export function getFetcher(name: string): Fetcher | undefined {
  return FETCHERS.find((f) => f.name === name);
}

export function listFetcherNames(): string[] {
  return FETCHERS.map((f) => f.name);
}
