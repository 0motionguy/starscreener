// SKILL.md parser. Vercel Labs convention: skills live at
// `${owner}/${repo}/${skillName}/SKILL.md` with YAML frontmatter on top
// followed by markdown body. Frontmatter shape (everything optional):
//
//   ---
//   description: "Find skills you have already authored on your machine"
//   allowed-tools: ["Read", "Glob", "Grep"]
//   hooks:
//     pre-run: "scripts/check-deps.sh"
//   version: "0.3.1"
//   agents:
//     - claude-code
//     - openclaw
//     - cursor
//   ---
//
// We parse with js-yaml (small, well-trusted) and validate field shapes
// defensively - skills in the wild ship inconsistent frontmatter and we
// must not throw on a single malformed key. Returns null when no
// frontmatter block is present at all; returns a partial object when only
// some fields parse.
//
// `fetchSkillMd` is an optional helper that pulls SKILL.md from raw
// GitHub for a given skill, with a `master` fallback when `main` 404s.

import yaml from 'js-yaml';
import type { HttpClient } from '../../lib/types.js';

export interface SkillMdFrontmatter {
  description?: string;
  /** Comma-separated string OR array. We normalise to string[]. */
  allowed_tools?: string[];
  hooks?: Record<string, unknown>;
  version?: string;
  agents?: string[];
  /** Anything else from the YAML that we don't validate. */
  extra?: Record<string, unknown>;
}

export interface ParsedSkillMd {
  frontmatter: SkillMdFrontmatter | null;
  body: string;
  raw: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Pure parser. Takes the entire SKILL.md text, returns the frontmatter +
 * body. Frontmatter can be missing - we return { frontmatter: null }, body
 * = raw, in that case.
 */
export function parseSkillMd(raw: string): ParsedSkillMd {
  const text = raw.replace(/^﻿/, '');
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    return { frontmatter: null, body: text, raw };
  }
  const yamlText = m[1] ?? '';
  const body = m[2] ?? '';
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlText, { schema: yaml.FAILSAFE_SCHEMA });
  } catch {
    // Bad YAML - treat as no frontmatter rather than throwing.
    return { frontmatter: null, body, raw };
  }
  const fm = coerceFrontmatter(parsed);
  return { frontmatter: fm, body, raw };
}

function coerceFrontmatter(value: unknown): SkillMdFrontmatter | null {
  if (!isPlainObject(value)) return null;
  const out: SkillMdFrontmatter = {};
  const known = new Set(['description', 'allowed-tools', 'allowed_tools', 'hooks', 'version', 'agents']);

  if (typeof value.description === 'string') out.description = value.description.trim();

  const allowedRaw = value['allowed-tools'] ?? value.allowed_tools;
  const allowed = normaliseStringList(allowedRaw);
  if (allowed.length > 0) out.allowed_tools = allowed;

  if (isPlainObject(value.hooks)) out.hooks = value.hooks;

  if (typeof value.version === 'string') out.version = value.version.trim();
  else if (typeof value.version === 'number') out.version = String(value.version);

  const agents = normaliseStringList(value.agents);
  if (agents.length > 0) out.agents = agents;

  // Stash everything else under .extra so callers can inspect uncommon
  // keys without re-parsing. Drops the keys we already lifted.
  const extra: Record<string, unknown> = {};
  let extraCount = 0;
  for (const [k, v] of Object.entries(value)) {
    if (known.has(k)) continue;
    extra[k] = v;
    extraCount += 1;
  }
  if (extraCount > 0) out.extra = extra;

  return out;
}

function normaliseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) out.push(trimmed);
      }
    }
    return out;
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ----- Optional fetch helper ---------------------------------------------

const RAW_GH_BASE = 'https://raw.githubusercontent.com';

export interface FetchSkillMdInput {
  http: HttpClient;
  owner: string;
  repo: string;
  skillName: string;
  /** Defaults to ['main', 'master']. */
  branches?: string[];
}

export interface FetchSkillMdResult {
  found: boolean;
  branch: string | null;
  parsed: ParsedSkillMd | null;
  /** HTTP status of the LAST attempt. Useful for diagnostics. */
  lastStatus: number | null;
  url: string | null;
}

/**
 * Pull SKILL.md from raw.githubusercontent.com. Tries the listed branches
 * in order and returns the first hit. We fetch text (not JSON) and ignore
 * the ETag cache because raw.githubusercontent doesn't emit consistent
 * ones for these paths. Throttling / concurrency is the caller's job.
 */
export async function fetchSkillMd(input: FetchSkillMdInput): Promise<FetchSkillMdResult> {
  const branches = input.branches ?? ['main', 'master'];
  let lastStatus: number | null = null;
  let lastUrl: string | null = null;
  for (const branch of branches) {
    const url = `${RAW_GH_BASE}/${input.owner}/${input.repo}/${branch}/${input.skillName}/SKILL.md`;
    lastUrl = url;
    try {
      const { data } = await input.http.text(url, {
        useEtagCache: false,
        timeoutMs: 15_000,
        maxRetries: 1,
      });
      const parsed = parseSkillMd(data);
      return { found: true, branch, parsed, lastStatus: 200, url };
    } catch (err) {
      // The worker http client throws on non-2xx with the status in the
      // message ("http: 404 Not Found for ..."). Pull it out for diagnostics.
      const m = /http: (\d{3})/.exec((err as Error).message);
      lastStatus = m ? Number(m[1]) : null;
      // 404 = try next branch. Any other error = bail to avoid runaway retries.
      if (lastStatus !== 404) break;
    }
  }
  return { found: false, branch: null, parsed: null, lastStatus, url: lastUrl };
}
