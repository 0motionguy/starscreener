import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const workerRoot = resolve(__dirname, '..');
const repoRoot = resolve(workerRoot, '../..');
const forbidden = [
  /@mendable\/firecrawl-js/i,
  /FIRECRAWL_API_KEYS?/,
  /api\.firecrawl\.dev/i,
  /requiresFirecrawl/,
  /firecrawl-docs/i,
];
const forbiddenOperationalClaims = /Firecrawl-(?:backed|based)/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(?:ts|js|mts|mjs)$/.test(name) ? [path] : [];
  });
}

describe('self-hosted crawler contract', () => {
  it('has no external crawler SDK in any package manifest or lockfile', () => {
    const manifests = [
      resolve(repoRoot, 'package.json'),
      resolve(repoRoot, 'package-lock.json'),
      resolve(workerRoot, 'package.json'),
      resolve(workerRoot, 'package-lock.json'),
    ];
    for (const file of manifests) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of forbidden.slice(0, 1)) expect(text, relative(repoRoot, file)).not.toMatch(pattern);
    }
  });

  it('has no external crawler runtime configuration, endpoint, SDK, or gate', () => {
    const files = [
      ...sourceFiles(resolve(workerRoot, 'src')),
      resolve(workerRoot, '.env.example'),
      resolve(workerRoot, 'README.md'),
      resolve(workerRoot, 'src/platform/sources.json'),
    ];
    const violations = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const patterns = file.endsWith('README.md') || file.endsWith('sources.json')
        ? [...forbidden, forbiddenOperationalClaims]
        : forbidden;
      return patterns.filter((pattern) => pattern.test(text)).map((pattern) => `${relative(workerRoot, file)}: ${pattern}`);
    });
    expect(violations).toEqual([]);
  });
});
