// Shared types for the trending-MCP pipeline.
// All four source clients normalize into McpServerNormalized.
// The merger reduces a stream of those into one trending_items row per logical MCP.

export type McpSource = 'official' | 'glama' | 'pulsemcp' | 'smithery';

export const MCP_SOURCES: readonly McpSource[] = ['official', 'glama', 'pulsemcp', 'smithery'];

export type SecurityGrade = 'A' | 'B' | 'C' | 'F';

export type PackageRegistry = 'npm' | 'pypi' | 'docker' | 'go' | 'cargo' | 'unknown';

export interface McpServerNormalized {
  source: McpSource;
  source_id: string;
  name: string;
  owner: string | null;
  qualified_name: string;
  package_name: string | null;
  package_registry: PackageRegistry | null;
  github_url: string | null;
  github_stars: number | null;
  downloads_total: number | null;
  popularity_signal: number;
  security_grade: SecurityGrade | null;
  is_remote: boolean;
  description: string | null;
  raw: Record<string, unknown>;
}

export type VendorCategory =
  | 'payments'
  | 'productivity'
  | 'comms'
  | 'code'
  | 'observability'
  | 'analytics'
  | 'cloud'
  | 'baas'
  | 'database'
  | 'vector_db'
  | 'google'
  | 'microsoft'
  | 'ai'
  | 'design'
  | 'crm'
  | 'commerce'
  | 'social'
  | 'crypto'
  | 'knowledge'
  | 'storage'
  | 'auth'
  | 'other';

export interface VendorEntry {
  vendor_slug: string;
  display_name: string;
  official_url: string;
  simple_icons_slug: string | null;
  brand_color: string;
  category: VendorCategory;
  github_org_aliases: readonly string[];
  package_patterns: readonly RegExp[];
  keyword_patterns: readonly RegExp[];
  fallback_logo_url?: string;
}

export interface LogoAsset {
  url: string;
  brand_color: string;
  simple_icons_slug: string | null;
  source: 'simple-icons' | 'fallback' | 'favicon';
}

export type VendorDetectionStrategy =
  | 'override'
  | 'package'
  | 'github_org'
  | 'description'
  | 'reference_impl'
  | 'unmatched';

export interface VendorDetection {
  vendor_slug: string | null;
  is_official_vendor: boolean;
  strategy: VendorDetectionStrategy;
}

export type MergeKey =
  | { kind: 'github_url'; value: string }
  | { kind: 'registry_pkg'; value: string }
  | { kind: 'qualified_name'; value: string };

export interface MergeResult {
  id: string;
  mergedFrom: McpSource[];
  cross_source_count: number;
  inserted: boolean;
}
