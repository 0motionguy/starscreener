#!/usr/bin/env node
/**
 * Render docs/SOURCE-FLEET-AUDIT-2026-05-07.md from sources.json so the
 * audit doc never drifts from the registry.
 *
 * Output: one row per source with every field captured in the contract,
 * grouped by category, plus a state breakdown. Intent-only rows expose
 * their `decision_pending` text so reviewers can see the open question.
 *
 * Usage:
 *   node scripts/render-source-audit.mjs
 *   npm run render:source-audit
 *
 * Plan: ~/.claude/plans/hidden-pondering-meadow.md (Phase 1 deliverable 4)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCES_PATH = resolve(
  ROOT,
  'apps/trendingrepo-worker/src/platform/sources.json',
);
const AUDIT_PATH = resolve(ROOT, 'docs/SOURCE-FLEET-AUDIT-2026-05-07.md');

const CATEGORY_ORDER = [
  'repo-derived',
  'social',
  'package',
  'model',
  'mcp',
  'skill',
  'funding',
  'research',
  'ops',
  'user-input',
];

function fmtKeys(keys) {
  if (Array.isArray(keys)) {
    if (keys.length === 0) return '_(none — route handler writes to Supabase)_';
    return keys.map((k) => `\`${k}\``).join(', ');
  }
  if (keys && typeof keys === 'object' && keys.pattern) {
    return `pattern: \`${keys.pattern}\` (cardinality: ${keys.cardinality_source})`;
  }
  return '—';
}

function fmtList(xs) {
  if (!xs || xs.length === 0) return '—';
  return xs.map((x) => `\`${x}\``).join(', ');
}

function fmtUrl(u) {
  if (!u) return '—';
  if (Array.isArray(u)) return u.map((x) => `\`${x}\``).join('<br>');
  return `\`${u}\``;
}

function fmtCost(c) {
  if (!c) return '—';
  const parts = [c.type];
  if (c.scope) parts.push(`scope=${c.scope}`);
  if (typeof c.cap === 'number') parts.push(`cap=${c.cap}`);
  return parts.join(' / ');
}

function fmtRateLimit(r) {
  if (!r) return '—';
  const parts = [];
  if (r.per_hour) parts.push(`${r.per_hour}/h`);
  if (r.scope) parts.push(`scope=${r.scope}`);
  return parts.join(' / ');
}

function renderSource(src) {
  const lines = [];
  lines.push(`### \`${src.id}\``);
  lines.push('');
  lines.push(`- **state**: \`${src.state}\``);
  lines.push(`- **kind**: ${src.kind}`);
  lines.push(`- **owner**: ${src.owner}`);
  lines.push(`- **freshness budget**: ${src.freshness_budget_ms} ms`);
  lines.push(`- **upstream**: ${fmtUrl(src.upstream_url)}`);
  lines.push(`- **auth**: ${src.auth_required ? 'required' : 'no'}${src.auth_scheme ? ` (${src.auth_scheme})` : ''}`);
  lines.push(`- **cost signal**: ${fmtCost(src.cost_signal_metric)}`);
  if (src.rate_limit) lines.push(`- **rate limit**: ${fmtRateLimit(src.rate_limit)}`);
  lines.push(`- **output keys**: ${fmtKeys(src.primary_output_keys)}`);
  lines.push(`- **output shape**: \`${src.output_record_shape}\``);
  if (src.consensus_role) lines.push(`- **consensus role**: \`${src.consensus_role}\``);
  lines.push(`- **consumer surfaces**: ${fmtList(src.consumer_surfaces)}`);
  if (src.depends_on?.length) lines.push(`- **depends on**: ${fmtList(src.depends_on)}`);
  lines.push(`- **supports backfill**: ${src.supports_backfill ? 'yes' : 'no'}`);
  lines.push(`- **fallback**: \`${src.fallback_strategy}\``);
  if (src.providers?.length) {
    const provLines = src.providers.map(
      (p) => `\`${p.id}\` (${p.role}, cost=${p.cost_class})`,
    );
    lines.push(`- **providers**: ${provLines.join(', ')}`);
  }
  if (src.writes_canonical_entity_kind?.length) {
    lines.push(`- **writes canonical**: ${fmtList(src.writes_canonical_entity_kind)}`);
  }
  if (src.script) lines.push(`- **script**: \`scripts/${src.script}\``);
  if (src.decision_pending) {
    lines.push('');
    lines.push(`> **decision_pending**: ${src.decision_pending}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const sources = JSON.parse(await readFile(SOURCES_PATH, 'utf-8'));

  const stateCounts = {};
  const categoryGroups = {};
  for (const s of sources) {
    stateCounts[s.state] = (stateCounts[s.state] ?? 0) + 1;
    (categoryGroups[s.category] ??= []).push(s);
  }

  const out = [];
  out.push('# Source Fleet Audit (2026-05-07)');
  out.push('');
  out.push(
    '_Auto-generated from `apps/trendingrepo-worker/src/platform/sources.json` by `scripts/render-source-audit.mjs`. Do not edit by hand — re-render with `npm run render:source-audit`._',
  );
  out.push('');
  out.push('## State breakdown');
  out.push('');
  out.push('| state | count |');
  out.push('|---|---|');
  for (const [state, count] of Object.entries(stateCounts).sort()) {
    out.push(`| \`${state}\` | ${count} |`);
  }
  out.push(`| **total** | **${sources.length}** |`);
  out.push('');

  for (const cat of CATEGORY_ORDER) {
    const group = categoryGroups[cat];
    if (!group) continue;
    out.push(`## category: \`${cat}\` (${group.length})`);
    out.push('');
    for (const src of group) {
      out.push(renderSource(src));
    }
  }

  await writeFile(AUDIT_PATH, out.join('\n'), 'utf-8');
  console.log(`render-source-audit: wrote ${AUDIT_PATH}`);
}

main().catch((err) => {
  console.error('render-source-audit: fatal', err);
  process.exit(1);
});
