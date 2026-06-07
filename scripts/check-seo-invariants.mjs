#!/usr/bin/env node
// TrendingRepo — SEO invariant probe.
//
// Probes a running TrendingRepo deployment (prod by default; pass --base
// http://localhost:3023 for local) and asserts the metadata invariants that,
// when violated, sink indexing across the whole site. Built after the
// 2026-05-30/31 worker outage exposed a soft-404 path that emitted TWO
// conflicting <meta name="robots"> tags + a canonical pointing at the
// homepage instead of self, costing ~95% of impressions for a week.
//
// Invariants checked:
//
//   [I1] Real pages emit EXACTLY ONE <meta name="robots"> tag. More than one
//        and Google honors the most restrictive → noindex by accident.
//
//   [I2] Real pages emit `index, follow` (or unset — which inherits index).
//        Any noindex on a known-real URL is a deploy regression.
//
//   [I3] Self-canonical on every dynamic page type. A canonical that points
//        at the homepage de-duplicates the page against /.
//
//   [I4] Fake-URL probes (known not-found state) either return HTTP 404 OR
//        return HTTP 200 with EXACTLY ONE robots tag saying noindex.
//        Dual robots = regression.
//
//   [I5] All sitemaps return 200 with non-empty content.
//
//   [I6] No 5xx on any probed URL.
//
// USAGE
//   node scripts/check-seo-invariants.mjs                    # prod
//   node scripts/check-seo-invariants.mjs --base http://localhost:3023
//   node scripts/check-seo-invariants.mjs --verbose
//
// Exit codes:
//   0 = all invariants hold
//   1 = at least one invariant violated
//   2 = network / configuration error (can't reach base URL)

const DEFAULT_BASE = "https://trendingrepo.com";

function parseArgs(argv) {
  const out = { base: DEFAULT_BASE, verbose: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--base") out.base = argv[i + 1];
    else if (argv[i] === "--verbose" || argv[i] === "-v") out.verbose = true;
  }
  return out;
}

// Targets: each entry is { path, kind, expectIndexable }
// kind = "real" → must satisfy I1-I3
// kind = "fake" → must satisfy I4 (404 or 200+single-noindex)
// kind = "sitemap" → must satisfy I5
const TARGETS = [
  // Real hub pages — high-traffic, must stay indexable.
  { path: "/", kind: "real", expectIndexable: true },
  { path: "/categories", kind: "real", expectIndexable: true },
  { path: "/best", kind: "real", expectIndexable: true },
  { path: "/glossary", kind: "real", expectIndexable: true },
  { path: "/collections", kind: "real", expectIndexable: true },

  // Real answer-surface leaves — the GEO ranking targets.
  { path: "/best/ai-agents", kind: "real", expectIndexable: true },
  { path: "/best/mcp-servers", kind: "real", expectIndexable: true },
  { path: "/categories/ai-agents", kind: "real", expectIndexable: true },
  { path: "/categories/mcp", kind: "real", expectIndexable: true },
  { path: "/glossary/mcp", kind: "real", expectIndexable: true },

  // Real /repo/* — the high-traffic top URL from GSC analytics.
  { path: "/repo/ajavadinezhad/zyrln", kind: "real", expectIndexable: true },

  // Static pages — they need self-canonical too (yesterday's audit found
  // 14 of these had the canonical-to-/ bug).
  { path: "/funding", kind: "real", expectIndexable: true },
  { path: "/breakout", kind: "real", expectIndexable: true },
  { path: "/methodology", kind: "real", expectIndexable: true },
  { path: "/tools/compare", kind: "real", expectIndexable: true },

  // Fake-URL probes — these MUST satisfy I4 (clean 404 or clean noindex).
  // The dual-robots bug surfaces on these paths.
  {
    path: "/repo/this-owner-definitely-does-not-exist-78239/and-neither-does-this-name-78239",
    kind: "fake",
    expectIndexable: false,
  },
  {
    path: "/categories/this-is-not-a-real-category-78239",
    kind: "fake",
    expectIndexable: false,
  },
  {
    path: "/best/this-is-not-a-real-topic-78239",
    kind: "fake",
    expectIndexable: false,
  },

  // Sitemaps.
  { path: "/sitemap.xml", kind: "sitemap" },
  { path: "/sitemap-pages.xml", kind: "sitemap" },
  { path: "/sitemap-repos.xml", kind: "sitemap" },
  { path: "/sitemap-compare.xml", kind: "sitemap" },
  { path: "/sitemap-alternatives.xml", kind: "sitemap" },
];

const UA = "Mozilla/5.0 (compatible; trendingrepo-seo-check/1.0)";

async function fetchPage(base, path) {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      redirect: "manual",
    });
    const body = res.status >= 300 && res.status < 400 ? "" : await res.text();
    return { url, status: res.status, body };
  } catch (err) {
    return { url, status: 0, body: "", error: String(err?.message ?? err) };
  }
}

function extractRobotsTags(html) {
  if (!html) return [];
  const matches = html.matchAll(/<meta[^>]*name="robots"[^>]*content="([^"]*)"/gi);
  return [...matches].map((m) => m[1].trim());
}

function extractCanonical(html) {
  if (!html) return null;
  const m = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i);
  return m ? m[1].trim() : null;
}

function isIndexable(robotsValue) {
  if (!robotsValue) return true; // missing tag = default indexable
  return !/noindex/i.test(robotsValue);
}

function looksLikeSelfCanonical(canonicalUrl, base, path) {
  if (!canonicalUrl) return false;
  // Normalize: strip trailing slash from both sides for comparison.
  const norm = (s) => s.replace(/\/+$/, "");
  const expected = `${norm(base)}${path === "/" ? "" : path}`;
  return norm(canonicalUrl) === norm(expected);
}

const PASS = "  ✓";
const FAIL = "  ✗";

function check(args, target, result) {
  const failures = [];
  const path = target.path;
  const { status, body, error } = result;

  if (error) {
    failures.push(`network error: ${error}`);
    return failures;
  }

  // [I6] No 5xx anywhere.
  if (status >= 500) {
    failures.push(`HTTP ${status} (5xx) — server error`);
    return failures;
  }

  if (target.kind === "sitemap") {
    // [I5] Sitemap must return 200 with non-empty content.
    if (status !== 200) failures.push(`HTTP ${status} — sitemap should return 200`);
    if (status === 200 && body.length < 100) {
      failures.push(`empty body (${body.length} bytes)`);
    }
    return failures;
  }

  if (target.kind === "fake") {
    // [I4] Either 404 OR (200 + exactly one robots tag saying noindex).
    if (status === 404) {
      // perfect — hard 404 is clean.
      return failures;
    }
    if (status !== 200) {
      failures.push(`HTTP ${status} — expected 404 or 200`);
      return failures;
    }
    const robots = extractRobotsTags(body);
    if (robots.length === 0) {
      failures.push(
        `[I4] fake URL with HTTP 200 has NO robots tag — should be 404 or have noindex`,
      );
    } else if (robots.length > 1) {
      failures.push(
        `[I4] fake URL emits ${robots.length} robots tags: [${robots.join(", ")}] — soft 404 + dual robots is the May 30-31 outage bug`,
      );
    } else if (isIndexable(robots[0])) {
      failures.push(
        `[I4] fake URL says \`${robots[0]}\` — must be noindex`,
      );
    }
    return failures;
  }

  // kind === "real" → I1, I2, I3
  if (status !== 200) {
    failures.push(`HTTP ${status} — expected 200 for real page`);
    return failures;
  }

  const robots = extractRobotsTags(body);
  if (robots.length > 1) {
    failures.push(
      `[I1] ${robots.length} robots tags: [${robots.join(", ")}] — Google honors the strictest`,
    );
  } else if (robots.length === 1 && !isIndexable(robots[0])) {
    failures.push(
      `[I2] robots=\`${robots[0]}\` — real page must NOT be noindex`,
    );
  }

  const canonical = extractCanonical(body);
  if (!canonical) {
    failures.push(`[I3] no canonical link tag`);
  } else if (!looksLikeSelfCanonical(canonical, args.base, path)) {
    failures.push(
      `[I3] canonical=\`${canonical}\` — should be self-canonical to \`${args.base}${path === "/" ? "" : path}\``,
    );
  }

  return failures;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`SEO invariant probe → ${args.base}`);
  console.log(`Probing ${TARGETS.length} URLs...\n`);

  const results = await Promise.all(
    TARGETS.map(async (t) => {
      const r = await fetchPage(args.base, t.path);
      return { t, r };
    }),
  );

  let pass = 0;
  let fail = 0;
  const failureLines = [];

  for (const { t, r } of results) {
    const failures = check(args, t, r);
    if (failures.length === 0) {
      pass += 1;
      if (args.verbose) console.log(`${PASS} ${t.kind.padEnd(7)} ${t.path}  HTTP ${r.status}`);
    } else {
      fail += 1;
      console.log(`${FAIL} ${t.kind.padEnd(7)} ${t.path}  HTTP ${r.status}`);
      for (const f of failures) {
        console.log(`        ${f}`);
        failureLines.push(`${t.path}: ${f}`);
      }
    }
  }

  console.log(`\n${pass}/${TARGETS.length} invariants hold.`);
  if (fail > 0) {
    console.log(`\nFAILURES (${fail}):`);
    for (const line of failureLines) console.log(`  - ${line}`);
    console.log("");
    console.log("Why this matters:");
    console.log("  Each failure above maps to a documented indexing-killer pattern");
    console.log("  in tasks/gsc-incident-2026-06-07.md + tasks/gsc-deep-audit-2026-06-01.md.");
    console.log("  Fix before deploying or production traffic will drop.");
    process.exit(1);
  }
  console.log("All SEO invariants hold — safe to deploy.");
}

main().catch((err) => {
  console.error(`check-seo-invariants failed: ${err.message}`);
  process.exit(2);
});
