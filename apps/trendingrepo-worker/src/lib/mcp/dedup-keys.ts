import type { McpServerNormalized, MergeKey } from './types.js';

// Compute the ordered candidate keys used to find an existing trending_items
// row for the same logical MCP across sources. Order = strongest first.
//
// Persisted form in raw.merge_keys: ["gh:github.com/foo/bar", "npm:@foo/bar", ...]
// (single string per key, kind-prefixed so types don't collide).

export function computeMergeKeys(n: McpServerNormalized): MergeKey[] {
  const keys: MergeKey[] = [];

  if (n.github_url) {
    const norm = normalizeGithubUrl(n.github_url);
    if (norm) keys.push({ kind: 'github_url', value: norm });
  }

  if (n.package_registry && n.package_name) {
    keys.push({
      kind: 'registry_pkg',
      value: `${n.package_registry}:${n.package_name.toLowerCase()}`,
    });
  }

  if (n.qualified_name) {
    keys.push({
      kind: 'qualified_name',
      value: normalizeQualifiedName(n.qualified_name),
    });
  }

  return keys;
}

export function serializeMergeKeys(keys: MergeKey[]): string[] {
  return keys.map(serializeMergeKey);
}

export function serializeMergeKey(k: MergeKey): string {
  switch (k.kind) {
    case 'github_url':
      return `gh:${k.value}`;
    case 'registry_pkg':
      return `pkg:${k.value}`;
    case 'qualified_name':
      return `qn:${k.value}`;
  }
}

function normalizeGithubUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.replace(/^\/+/, '').replace(/\.git$/i, '').split('/');
    if (parts.length < 2) return null;
    const [owner, repo] = parts;
    return `github.com/${owner!.toLowerCase()}/${repo!.toLowerCase()}`;
  } catch {
    return null;
  }
}

function normalizeQualifiedName(qn: string): string {
  return qn
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\s+/g, '-')
    .replace(/[_/]+/g, '/')
    .replace(/-+/g, '-')
    .trim();
}

// Used when qualified_name is the only available key. Two qualified_names
// match if their token sets have Jaccard >= 0.85. Caller is expected to
// gate weak matches with this check before merging.
export function qualifiedNameSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function tokenize(s: string): Set<string> {
  return new Set(
    normalizeQualifiedName(s)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2),
  );
}
