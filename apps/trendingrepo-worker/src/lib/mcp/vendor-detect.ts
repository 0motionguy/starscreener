import type { McpServerNormalized, VendorDetection, VendorEntry } from './types.js';
import { MANUAL_OVERRIDES, VENDOR_CATALOG, getVendor, getVendorByGithubOrg } from './vendor-catalog.js';

// First-match-wins detection pipeline:
//   1. MANUAL_OVERRIDES — exact qualified_name lookup
//   2. REFERENCE_IMPL    — @modelcontextprotocol/server-<vendor> (official=false)
//   3. PACKAGE_REGEX     — vendor patterns matched against package_name
//   4. GITHUB_OWNER      — owner ∈ vendor.github_org_aliases (sets official=true)
//   5. DESCRIPTION_KW    — keyword match against description (official=false)
//   6. UNMATCHED         — null vendor

const REFERENCE_IMPL_REGEX = /^@modelcontextprotocol\/server-([a-z0-9][a-z0-9-]*)$/i;

export function detectVendor(n: McpServerNormalized): VendorDetection {
  // 1. Manual override on qualified_name (lowercased).
  const qn = n.qualified_name.toLowerCase();
  if (MANUAL_OVERRIDES[qn]) {
    return { ...MANUAL_OVERRIDES[qn], strategy: 'override' };
  }

  // 2. Reference impl: @modelcontextprotocol/server-<X>. Vendor=X but is_official_vendor=false
  //    (it's anthropic-team-maintained, not vendor-maintained).
  if (n.package_name) {
    const refMatch = n.package_name.match(REFERENCE_IMPL_REGEX);
    if (refMatch) {
      const slug = refMatch[1]!.toLowerCase();
      if (getVendor(slug)) {
        return { vendor_slug: slug, is_official_vendor: false, strategy: 'reference_impl' };
      }
    }
  }

  // 3. Package regex against the vendor catalog.
  if (n.package_name) {
    const pkg = n.package_name;
    for (const entry of VENDOR_CATALOG) {
      for (const re of entry.package_patterns) {
        if (re.test(pkg)) {
          // Promote to official only if owner also matches the vendor's org list,
          // otherwise stay third-party (third party can name their package
          // anything, so a package match alone is NOT proof of officialness).
          const officialByOwner =
            n.owner !== null && entry.github_org_aliases.includes(n.owner.toLowerCase());
          return {
            vendor_slug: entry.vendor_slug,
            is_official_vendor: officialByOwner,
            strategy: 'package',
          };
        }
      }
    }
  }

  // 4. Github owner match (alone, when no package match fired).
  if (n.owner) {
    const byOrg = getVendorByGithubOrg(n.owner);
    if (byOrg) {
      return {
        vendor_slug: byOrg.vendor_slug,
        is_official_vendor: true,
        strategy: 'github_org',
      };
    }
  }

  // 5. Description keyword match. Never sets is_official_vendor=true.
  if (n.description) {
    const desc = n.description;
    const match = scoreDescription(desc);
    if (match) {
      return { vendor_slug: match.vendor_slug, is_official_vendor: false, strategy: 'description' };
    }
  }

  // 6. Unmatched.
  return { vendor_slug: null, is_official_vendor: false, strategy: 'unmatched' };
}

interface DescScore {
  vendor_slug: string;
  hits: number;
}

// Pick the vendor with the most distinct keyword hits in the description.
// Tie-breaker: catalog order (stable, deterministic).
function scoreDescription(desc: string): DescScore | null {
  let best: DescScore | null = null;
  for (const entry of VENDOR_CATALOG) {
    const hits = countKeywordHits(entry, desc);
    if (hits === 0) continue;
    if (best === null || hits > best.hits) {
      best = { vendor_slug: entry.vendor_slug, hits };
    }
  }
  return best;
}

function countKeywordHits(entry: VendorEntry, desc: string): number {
  let hits = 0;
  for (const re of entry.keyword_patterns) {
    if (re.test(desc)) hits += 1;
  }
  return hits;
}
