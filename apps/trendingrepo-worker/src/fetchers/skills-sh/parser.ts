// Normaliser for skills.sh leaderboard data.
//
// Two intake shapes:
//   1. Firecrawl /v1/scrape with formats=[{type:'json', schema:...}] returns
//      a structured `data.json` field. Primary path - LLM extraction is
//      robust against UI churn.
//   2. Raw HTML fallback - lightweight regex on the rendered DOM. Used if
//      the JSON extract returns < 10 rows on a page that should have 100+
//      (sentinel for "extract LLM hallucinated empty").
//
// Both paths normalise to SkillRow[]. Down-stream scoring + publish doesn't
// care which path produced them.

import type { SkillRow, SkillView } from './types.js';
import { ALL_AGENT_IDS } from './agents.js';

const URL_BASE = 'https://skills.sh';

export interface ExtractedRow {
  rank?: number | string;
  skill_name?: string;
  owner?: string;
  repo?: string;
  installs?: string | number;
  agents?: ReadonlyArray<string>;
  url?: string;
}

export interface ExtractedShape {
  skills?: ReadonlyArray<ExtractedRow>;
}

const KNOWN_AGENTS = new Set<string>(ALL_AGENT_IDS);

export function parseInstallCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const m = trimmed.replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([KMB])?\s*(?:installs?|downloads?)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  switch (m[2]?.toUpperCase()) {
    case 'K':
      return Math.round(n * 1_000);
    case 'M':
      return Math.round(n * 1_000_000);
    case 'B':
      return Math.round(n * 1_000_000_000);
    default:
      return Math.round(n);
  }
}

export function normalizeAgents(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const slug = raw.trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export interface ParseExtractInput {
  extracted: ExtractedShape | null | undefined;
  view: SkillView;
  fetchedAt: string;
}

export function parseFromExtract(input: ParseExtractInput): SkillRow[] {
  const items = Array.isArray(input.extracted?.skills) ? input.extracted.skills : [];
  const rows: SkillRow[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item) continue;
    const rank = parseRank(item.rank, i + 1);
    const owner = (item.owner ?? '').trim();
    const repo = (item.repo ?? '').trim();
    const skillName = (item.skill_name ?? '').trim();
    if (!owner || !repo || !skillName) continue;
    const sourceId = `${owner}/${repo}/${skillName}`;
    const url = item.url ?? `${URL_BASE}/${sourceId}`;
    rows.push({
      rank,
      skill_name: skillName,
      owner,
      repo,
      source_id: sourceId,
      url,
      github_url: `https://github.com/${owner}/${repo}/tree/main/${skillName}`,
      installs: parseInstallCount(item.installs ?? null),
      agents: normalizeAgents(item.agents ?? []),
      view: input.view,
      fetchedAt: input.fetchedAt,
    });
  }
  return rows;
}

function parseRank(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value === 'string') {
    const m = value.trim().match(/(\d+)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
  }
  return fallback;
}

// ----- Fallback: raw-HTML regex parse -------------------------------------

export interface ParseHtmlInput {
  html: string;
  view: SkillView;
  fetchedAt: string;
}

const SKILL_HREF_RE = /href="(\/[^/"]+\/[^/"]+\/[^/"]+)"/g;
const AGENT_ICON_RE = /\/agents\/([a-z0-9-]+)\.svg/g;

/**
 * Best-effort regex parser. Pulls out skill detail hrefs + their agent icons
 * by proximity. Used as a fallback when Firecrawl extract returns nothing.
 * Does NOT attempt to extract install counts (they're rendered separately
 * and proximity-association is unreliable from regex alone). Caller should
 * enrich with detail-page fetches when this path triggers.
 *
 * Scan strategy: find every skill href, then for each href scan agent icons
 * forward-only, bounded by the NEXT href position OR a max 1500-char window.
 * Backward windowing bleeds icons from a previous row into the current one.
 */
export function parseFromHtml(input: ParseHtmlInput): SkillRow[] {
  const { html, view, fetchedAt } = input;
  const hrefHits: Array<{ index: number; owner: string; repo: string; skill: string }> = [];

  for (const m of html.matchAll(SKILL_HREF_RE)) {
    const href = m[1];
    if (!href) continue;
    const parts = href.slice(1).split('/');
    if (parts.length !== 3) continue;
    const [owner, repo, skillName] = parts;
    if (!owner || !repo || !skillName) continue;
    hrefHits.push({ index: m.index ?? 0, owner, repo, skill: skillName });
  }

  const rows: SkillRow[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < hrefHits.length; i += 1) {
    const hit = hrefHits[i]!;
    const sourceId = `${hit.owner}/${hit.repo}/${hit.skill}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const windowStart = hit.index;
    const nextIndex = i + 1 < hrefHits.length ? hrefHits[i + 1]!.index : html.length;
    const windowEnd = Math.min(nextIndex, windowStart + 1500);
    const slice = html.slice(windowStart, windowEnd);

    const agents: string[] = [];
    const seenAgents = new Set<string>();
    for (const am of slice.matchAll(AGENT_ICON_RE)) {
      const id = am[1];
      if (id && !seenAgents.has(id)) {
        seenAgents.add(id);
        agents.push(id);
      }
    }

    rows.push({
      rank: rows.length + 1,
      skill_name: hit.skill,
      owner: hit.owner,
      repo: hit.repo,
      source_id: sourceId,
      url: `${URL_BASE}/${sourceId}`,
      github_url: `https://github.com/${hit.owner}/${hit.repo}/tree/main/${hit.skill}`,
      installs: null,
      agents,
      view,
      fetchedAt,
    });
  }
  return rows;
}

/** Diagnostic helper used by the scraper to detect "extract returned junk". */
export function looksEmpty(rows: ReadonlyArray<SkillRow>, expectedAtLeast = 10): boolean {
  return rows.length < expectedAtLeast;
}

/** Drop rows whose agents[] contains no known slug - likely LLM hallucination. */
export function filterToKnownAgents(rows: ReadonlyArray<SkillRow>): SkillRow[] {
  return rows.map((r) => ({
    ...r,
    agents: r.agents.filter((a) => KNOWN_AGENTS.has(a)),
  }));
}

// ----- Markdown parser (the path that actually works for skills.sh) -------

export interface ParseMarkdownInput {
  markdown: string;
  view: SkillView;
  fetchedAt: string;
}

// Match the closing of a markdown link where the link text is an install
// count and the href is a skills.sh detail URL. Pattern observed in real
// Firecrawl markdown output:
//   1.2M](https://skills.sh/vercel-labs/skills/find-skills)
//   338.7K](https://skills.sh/anthropics/skills/frontend-design)
//
// We capture: install text, owner, repo, skill name. Rank is positional.
const MD_ROW_RE =
  /(\d+(?:\.\d+)?[KMB]?)\]\(https:\/\/skills\.sh\/([^/)\s]+)\/([^/)\s]+)\/([^/)\s]+)\)/g;

/**
 * Parse skills.sh leaderboard from Firecrawl-rendered markdown. Each row
 * carries rank (positional), installs (parsed from K/M/B suffix), owner,
 * repo, skill_name. Per-row agent compatibility is NOT in the markdown
 * view (skills.sh surfaces agents at the platform level, not per-row);
 * agents[] is left empty here and populated by a future Phase 3
 * detail-page enrichment.
 */
export function parseFromMarkdown(input: ParseMarkdownInput): SkillRow[] {
  const { markdown, view, fetchedAt } = input;
  const rows: SkillRow[] = [];
  const seen = new Set<string>();
  let rank = 0;
  for (const m of markdown.matchAll(MD_ROW_RE)) {
    const installsRaw = m[1] ?? '';
    const owner = m[2] ?? '';
    const repo = m[3] ?? '';
    const skillName = m[4] ?? '';
    if (!owner || !repo || !skillName) continue;
    const sourceId = `${owner}/${repo}/${skillName}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    rank += 1;
    rows.push({
      rank,
      skill_name: skillName,
      owner,
      repo,
      source_id: sourceId,
      url: `${URL_BASE}/${sourceId}`,
      github_url: `https://github.com/${owner}/${repo}/tree/main/${skillName}`,
      installs: parseInstallCount(installsRaw),
      agents: [],
      view,
      fetchedAt,
    });
  }
  return rows;
}
