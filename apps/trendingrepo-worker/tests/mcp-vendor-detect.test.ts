import { describe, expect, it } from 'vitest';
import { detectVendor } from '../src/lib/mcp/vendor-detect.js';
import type { McpServerNormalized } from '../src/lib/mcp/types.js';

interface Case {
  name: string;
  package_name?: string | null;
  owner?: string | null;
  description?: string | null;
  expectVendor: string | null;
  expectOfficial?: boolean;
  expectStrategy?: string;
}

function build(c: Case): McpServerNormalized {
  return {
    source: 'official',
    source_id: c.name,
    name: c.name,
    owner: c.owner ?? null,
    qualified_name: c.name,
    package_name: c.package_name ?? null,
    package_registry: c.package_name ? 'npm' : null,
    github_url: c.owner ? `https://github.com/${c.owner}/${c.name}` : null,
    github_stars: null,
    downloads_total: null,
    popularity_signal: 0,
    security_grade: null,
    is_remote: false,
    description: c.description ?? null,
    raw: {},
  };
}

const CASES: Case[] = [
  // --- Stripe (5) ---
  { name: 'a', package_name: '@stripe/mcp', owner: 'stripe', expectVendor: 'stripe', expectOfficial: true, expectStrategy: 'package' },
  { name: 'b', package_name: 'mcp-server-stripe', owner: 'acmecorp', expectVendor: 'stripe', expectOfficial: false, expectStrategy: 'package' },
  { name: 'c', package_name: 'stripe-mcp-tools', owner: 'acmecorp', expectVendor: 'stripe', expectOfficial: false, expectStrategy: 'package' },
  { name: 'd', package_name: 'stripe-mcp', owner: 'stripe', expectVendor: 'stripe', expectOfficial: true, expectStrategy: 'package' },
  { name: 'e', description: 'Charge cards via the Stripe API', expectVendor: 'stripe', expectOfficial: false, expectStrategy: 'description' },
  // --- Notion (3) ---
  { name: 'f', package_name: 'notion-mcp', owner: 'makenotion', expectVendor: 'notion', expectOfficial: true, expectStrategy: 'package' },
  { name: 'g', package_name: 'mcp-server-notion', owner: 'random', expectVendor: 'notion', expectOfficial: false, expectStrategy: 'package' },
  { name: 'h', description: 'Read and write Notion pages', expectVendor: 'notion', expectOfficial: false, expectStrategy: 'description' },
  // --- GitHub (3) ---
  { name: 'i', package_name: '@modelcontextprotocol/server-github', owner: 'modelcontextprotocol', expectVendor: 'github', expectOfficial: false, expectStrategy: 'reference_impl' },
  { name: 'j', package_name: 'gh-mcp', owner: 'github', expectVendor: 'github', expectOfficial: true, expectStrategy: 'github_org' },
  { name: 'k', description: 'Open issues on GitHub', expectVendor: 'github', expectOfficial: false, expectStrategy: 'description' },
  // --- Postgres (4) ---
  { name: 'l', package_name: 'mcp-postgres', owner: 'someone', expectVendor: 'postgres', expectOfficial: false, expectStrategy: 'package' },
  { name: 'm', package_name: 'mcp-server-postgres', owner: 'someone', expectVendor: 'postgres', expectOfficial: false, expectStrategy: 'package' },
  { name: 'n', package_name: 'postgresql-mcp', owner: 'someone', expectVendor: 'postgres', expectOfficial: false, expectStrategy: 'package' },
  { name: 'o', description: 'Query PostgreSQL databases', expectVendor: 'postgres', expectOfficial: false, expectStrategy: 'description' },
  // --- Slack (2) ---
  { name: 'p', description: 'Send messages to Slack channels', expectVendor: 'slack', expectOfficial: false, expectStrategy: 'description' },
  { name: 'q', package_name: '@slackapi/mcp-slack', owner: 'slackapi', expectVendor: 'slack', expectOfficial: true, expectStrategy: 'package' },
  // --- Linear (2) ---
  { name: 'r', package_name: 'linear-mcp', owner: 'linear', expectVendor: 'linear', expectOfficial: true, expectStrategy: 'package' },
  { name: 's', package_name: 'mcp-linear', owner: 'someone', expectVendor: 'linear', expectOfficial: false, expectStrategy: 'package' },
  // --- HuggingFace (2) ---
  { name: 't', package_name: 'huggingface-mcp', owner: 'huggingface', expectVendor: 'huggingface', expectOfficial: true, expectStrategy: 'package' },
  { name: 'u', description: 'Browse Hugging Face models and datasets', expectVendor: 'huggingface', expectOfficial: false, expectStrategy: 'description' },
  // --- Supabase (2) ---
  { name: 'v', package_name: 'mcp-server-supabase', owner: 'supabase', expectVendor: 'supabase', expectOfficial: true, expectStrategy: 'package' },
  { name: 'w', description: 'Run SQL on a Supabase project', expectVendor: 'supabase', expectOfficial: false, expectStrategy: 'description' },
  // --- AWS (2) ---
  { name: 'x', package_name: 'mcp-server-aws', owner: 'awslabs', expectVendor: 'aws', expectOfficial: true, expectStrategy: 'package' },
  { name: 'y', package_name: 'aws-mcp', owner: 'random', expectVendor: 'aws', expectOfficial: false, expectStrategy: 'package' },
  // --- Vercel (2) ---
  { name: 'z', package_name: '@vercel/mcp', owner: 'vercel', expectVendor: 'vercel', expectOfficial: true, expectStrategy: 'package' },
  { name: 'aa', description: 'Deploy projects to Vercel', expectVendor: 'vercel', expectOfficial: false, expectStrategy: 'description' },
  // --- Cloudflare (2) ---
  { name: 'bb', package_name: 'cloudflare-mcp', owner: 'cloudflare', expectVendor: 'cloudflare', expectOfficial: true, expectStrategy: 'package' },
  { name: 'cc', package_name: 'mcp-server-cloudflare', owner: 'random', expectVendor: 'cloudflare', expectOfficial: false, expectStrategy: 'package' },
  // --- Sentry (2) ---
  { name: 'dd', package_name: 'sentry-mcp', owner: 'getsentry', expectVendor: 'sentry', expectOfficial: true, expectStrategy: 'package' },
  { name: 'ee', package_name: 'mcp-server-sentry', owner: 'rando', expectVendor: 'sentry', expectOfficial: false, expectStrategy: 'package' },
  // --- Discord (2) ---
  { name: 'ff', description: 'Post messages to Discord servers', expectVendor: 'discord', expectOfficial: false, expectStrategy: 'description' },
  { name: 'gg', package_name: 'discord-mcp', owner: 'discord', expectVendor: 'discord', expectOfficial: true, expectStrategy: 'package' },
  // --- Telegram (2) ---
  { name: 'hh', package_name: 'mcp-telegram', owner: 'someone', expectVendor: 'telegram', expectOfficial: false, expectStrategy: 'package' },
  { name: 'ii', description: 'Send Telegram messages from agents', expectVendor: 'telegram', expectOfficial: false, expectStrategy: 'description' },
  // --- Linear / Jira / Trello (3) ---
  { name: 'jj', description: 'Manage Jira tickets', expectVendor: 'jira', expectOfficial: false, expectStrategy: 'description' },
  { name: 'kk', package_name: 'trello-mcp', owner: 'trello', expectVendor: 'trello', expectOfficial: true, expectStrategy: 'package' },
  { name: 'll', package_name: 'asana-mcp', owner: 'asana', expectVendor: 'asana', expectOfficial: true, expectStrategy: 'package' },
  // --- Crypto (3) ---
  { name: 'mm', package_name: 'solana-mcp', owner: 'solana-labs', expectVendor: 'solana', expectOfficial: true, expectStrategy: 'package' },
  { name: 'nn', package_name: 'mcp-server-bitcoin', owner: 'random', expectVendor: 'bitcoin', expectOfficial: false, expectStrategy: 'package' },
  { name: 'oo', description: 'Read Ethereum block data', expectVendor: 'ethereum', expectOfficial: false, expectStrategy: 'description' },
  // --- Vector DB (3) ---
  { name: 'pp', package_name: 'pinecone-mcp', owner: 'pinecone-io', expectVendor: 'pinecone', expectOfficial: true, expectStrategy: 'package' },
  { name: 'qq', package_name: 'qdrant-mcp', owner: 'qdrant', expectVendor: 'qdrant', expectOfficial: true, expectStrategy: 'package' },
  { name: 'rr', description: 'Search a Weaviate vector database', expectVendor: 'weaviate', expectOfficial: false, expectStrategy: 'description' },
  // --- Google + storage (3) ---
  { name: 'ss', package_name: 'gmail-mcp', owner: 'googleapis', expectVendor: 'gmail', expectOfficial: true, expectStrategy: 'package' },
  { name: 'tt', package_name: 'mcp-server-googledrive', owner: 'someone', expectVendor: 'google-drive', expectOfficial: false, expectStrategy: 'package' },
  { name: 'uu', description: 'List files in Dropbox', expectVendor: 'dropbox', expectOfficial: false, expectStrategy: 'description' },
  // --- Auth (2) ---
  { name: 'vv', package_name: 'auth0-mcp', owner: 'auth0', expectVendor: 'auth0', expectOfficial: true, expectStrategy: 'package' },
  { name: 'ww', description: 'Manage Clerk users and sessions', expectVendor: 'clerk', expectOfficial: false, expectStrategy: 'description' },
  // --- Unmatched (2) ---
  { name: 'xx', package_name: 'mcp-fortune', owner: 'acmecorp', description: 'Random fortune cookie messages', expectVendor: null, expectOfficial: false, expectStrategy: 'unmatched' },
  { name: 'yy', package_name: 'random-tool-server', owner: 'unknown', description: 'Various random utilities', expectVendor: null, expectOfficial: false, expectStrategy: 'unmatched' },
];

describe('detectVendor — table-driven', () => {
  it.each(CASES)('detects "$name"', (c) => {
    const result = detectVendor(build(c));
    expect(result.vendor_slug).toBe(c.expectVendor);
    if (c.expectStrategy) expect(result.strategy).toBe(c.expectStrategy);
    if (c.expectOfficial !== undefined) expect(result.is_official_vendor).toBe(c.expectOfficial);
  });

  it('has at least 50 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(50);
  });
});
