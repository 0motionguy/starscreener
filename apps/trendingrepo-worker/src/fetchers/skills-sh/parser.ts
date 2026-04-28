// Normaliser for skills.sh leaderboard data.
//
// Two intake paths:
//   1. Firecrawl /v1/scrape with formats=['json'] + zod schema returns a
//      structured object. Primary path: parseFromExtract. LLM extraction is
//      robust against UI churn.
//   2. Raw HTML fallback parsed with cheerio. Used if the JSON extract
//      returns < 10 rows on a page that should have 100+ (sentinel for
//      "extract LLM hallucinated empty"), or as a regex backstop when
//      cheerio yields nothing useful (e.g. minified-class drift).
//
// Both paths normalise to SkillRow[]. Down-stream scoring + publish doesn't
// care which path produced them.

import * as cheerio from 'cheerio';
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

// ----- Fallback: cheerio HTML parse ---------------------------------------

export interface ParseHtmlInput {
  html: string;
  view: SkillView;
  fetchedAt: string;
}

const HREF_PATH_RE = /^\/[^/]+\/[^/]+\/[^/]+$/;
const AGENT_ICON_PATH_RE = /\/agents\/([a-z0-9-]+)\.svg/;

/**
 * Cheerio-based HTML parser. Looks for the skills.sh leaderboard rows by:
 *   1. The Tailwind class signature `grid-cols-16` (the leaderboard row
 *      template) on a div OR direct anchor; OR
 *   2. Any anchor whose href matches `/owner/repo/skill` (3-segment skill
 *      detail path) - more permissive backstop in case class names drift.
 *
 * For each row we collect agent icons by finding `<img src="...skills.sh/
 * agents/<slug>.svg">` within the row, and the install count by reading
 * the last `font-mono` span (skills.sh renders counts in monospace).
 *
 * If cheerio finds zero rows, we fall through to a regex pass that scans
 * the raw HTML for `/owner/repo/skill` hrefs and collects agent slugs in
 * a 1500-char forward window. Crude but resilient to most markup change.
 */
export function parseFromHtml(input: ParseHtmlInput): SkillRow[] {
  const cheerioRows = parseFromHtmlCheerio(input);
  if (cheerioRows.length > 0) return cheerioRows;
  return parseFromHtmlRegex(input);
}

export function parseFromHtmlCheerio(input: ParseHtmlInput): SkillRow[] {
  const { html, view, fetchedAt } = input;
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return [];
  }

  const candidateRows = $(
    'a[class*="grid-cols-16"], div[class*="grid-cols-16"], a[href]',
  );

  const rows: SkillRow[] = [];
  const seen = new Set<string>();

  candidateRows.each((_, el) => {
    const $row = $(el);
    const href = pickSkillHref($row);
    if (!href) return;
    const parts = href.slice(1).split('/');
    if (parts.length !== 3) return;
    const [owner, repo, skillName] = parts;
    if (!owner || !repo || !skillName) return;

    const sourceId = `${owner}/${repo}/${skillName}`;
    if (seen.has(sourceId)) return;
    seen.add(sourceId);

    const installText = $row.find('[class*="font-mono"]').last().text().trim();
    const installs = installText ? parseInstallCount(installText) : null;

    const agentSlugs: string[] = [];
    const seenAgents = new Set<string>();
    $row.find('img').each((__, img) => {
      const src = $(img).attr('src') ?? '';
      const m = src.match(AGENT_ICON_PATH_RE);
      const slug = m?.[1];
      if (slug && !seenAgents.has(slug)) {
        seenAgents.add(slug);
        agentSlugs.push(slug);
      }
    });

    rows.push({
      rank: rows.length + 1,
      skill_name: skillName,
      owner,
      repo,
      source_id: sourceId,
      url: `${URL_BASE}/${sourceId}`,
      github_url: `https://github.com/${owner}/${repo}/tree/main/${skillName}`,
      installs,
      agents: agentSlugs,
      view,
      fetchedAt,
    });
  });

  return rows;
}

function pickSkillHref($row: ReturnType<cheerio.CheerioAPI>): string | null {
  const selfHref = $row.is('a[href]') ? ($row.attr('href') ?? null) : null;
  if (selfHref && HREF_PATH_RE.test(selfHref)) return selfHref;
  const childHref = $row.find('a[href^="/"]').first().attr('href') ?? null;
  if (childHref && HREF_PATH_RE.test(childHref)) return childHref;
  return null;
}

const SKILL_HREF_RE = /href="(\/[^/"]+\/[^/"]+\/[^/"]+)"/g;
const AGENT_ICON_RE = /\/agents\/([a-z0-9-]+)\.svg/g;

/**
 * Last-resort regex pass. Scans the raw HTML string for `/owner/repo/skill`
 * hrefs, then for each one collects agent-icon slugs in a forward-looking
 * 1500-char window bounded by the next href position. Does not extract
 * install counts (proximity-association is unreliable from regex alone).
 */
export function parseFromHtmlRegex(input: ParseHtmlInput): SkillRow[] {
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

/**
 * Extract agent slugs from a chunk of HTML. Pure helper exposed for tests
 * and for any callers that already have the HTML fragment for a single row.
 */
export function parseAgentsFromIcons(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(AGENT_ICON_RE)) {
    const slug = m[1];
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

/** Drop unknown slugs from each row's agents[] (likely LLM hallucinations). */
export function filterToKnownAgents(rows: ReadonlyArray<SkillRow>): SkillRow[] {
  return rows.map((r) => ({
    ...r,
    agents: r.agents.filter((a) => KNOWN_AGENTS.has(a)),
  }));
}
