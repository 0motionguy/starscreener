#!/usr/bin/env node
// TrendingRepo — programmatic sitemap registration manager.
//
// Subcommands:
//   submit <feedpath>          Register or re-submit a sitemap.
//   delete <feedpath>          Un-register a sitemap.
//   fix-known-issues           Apply the documented fixes from
//                              tasks/gsc-deep-audit-2026-06-01.md:
//                                + submit /sitemap-compare.xml
//                                + submit /sitemap-alternatives.xml
//                                - delete /.well-known/security.txt
//   list                       Show current registered sitemaps (read-only).
//
// Auth: same as the rest of the gsc-* scripts. SA via GSC_SERVICE_ACCOUNT_JSON
// (preferred), or local-dev ADC fallback. Sitemap writes need the broader
// `webmasters` scope:
//   gcloud auth application-default login \
//     --scopes=https://www.googleapis.com/auth/webmasters,https://www.googleapis.com/auth/cloud-platform
//
// USAGE
//   npm run gsc:sitemap:fix
//   node scripts/gsc-sitemap-manage.mjs submit https://trendingrepo.com/sitemap-foo.xml
//   node scripts/gsc-sitemap-manage.mjs delete https://trendingrepo.com/sitemap-foo.xml
//   node scripts/gsc-sitemap-manage.mjs list

import {
  sitemapSubmit,
  sitemapDelete,
  sitemapsList,
} from "./gsc-client.mjs";

const DEFAULT_SITE = "sc-domain:trendingrepo.com";

// Hard-coded fixes from the 2026-06-01 deep audit. Edit in tandem with the
// audit doc when the known-issues list changes.
const KNOWN_FIXES = {
  submit: [
    "https://trendingrepo.com/sitemap-compare.xml",
    "https://trendingrepo.com/sitemap-alternatives.xml",
  ],
  delete: [
    "https://trendingrepo.com/.well-known/security.txt",
  ],
};

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { command: args[0] || "help", target: args[1], site: DEFAULT_SITE };
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === "--site") out.site = args[i + 1];
  }
  return out;
}

async function cmdList(site) {
  const data = await sitemapsList(site);
  const sitemaps = data.sitemap || [];
  console.log(`Registered sitemaps for ${site} (${sitemaps.length}):`);
  for (const sm of sitemaps) {
    const errors = Number(sm.errors || 0);
    const warnings = Number(sm.warnings || 0);
    const marker = errors > 0 ? "✗" : warnings > 0 ? "!" : "✓";
    console.log(`  ${marker} ${sm.path}  errors=${errors} warnings=${warnings} downloaded=${sm.lastDownloaded || "never"}`);
  }
}

async function cmdSubmit(site, feedpath) {
  if (!feedpath) throw new Error("submit requires <feedpath> argument");
  console.log(`→ submitting ${feedpath}`);
  const r = await sitemapSubmit(site, feedpath);
  console.log(`  ✓ submitted ${r.feedpath}`);
}

async function cmdDelete(site, feedpath) {
  if (!feedpath) throw new Error("delete requires <feedpath> argument");
  console.log(`→ deleting ${feedpath}`);
  const r = await sitemapDelete(site, feedpath);
  if (r.deleted) console.log(`  ✓ deleted ${r.feedpath}`);
  else console.log(`  · skipped ${r.feedpath} (${r.reason})`);
}

async function cmdFixKnownIssues(site) {
  console.log(`Applying known sitemap fixes to ${site}\n`);
  const results = { submitted: [], submitFailed: [], deleted: [], deleteFailed: [] };
  for (const feedpath of KNOWN_FIXES.submit) {
    try {
      await sitemapSubmit(site, feedpath);
      results.submitted.push(feedpath);
      console.log(`  ✓ submitted ${feedpath}`);
    } catch (err) {
      results.submitFailed.push({ feedpath, error: err.message });
      console.error(`  ✗ submit ${feedpath} failed: ${err.message}`);
    }
  }
  for (const feedpath of KNOWN_FIXES.delete) {
    try {
      const r = await sitemapDelete(site, feedpath);
      if (r.deleted) {
        results.deleted.push(feedpath);
        console.log(`  ✓ deleted ${feedpath}`);
      } else {
        console.log(`  · skipped ${feedpath} (${r.reason})`);
      }
    } catch (err) {
      results.deleteFailed.push({ feedpath, error: err.message });
      console.error(`  ✗ delete ${feedpath} failed: ${err.message}`);
    }
  }
  console.log("\nSummary:");
  console.log(`  submitted: ${results.submitted.length}/${KNOWN_FIXES.submit.length}`);
  console.log(`  deleted  : ${results.deleted.length}/${KNOWN_FIXES.delete.length}`);
  if (results.submitFailed.length || results.deleteFailed.length) {
    process.exitCode = 1;
  }
}

function help() {
  console.log(`gsc-sitemap-manage — programmatic Search Console sitemap management

Usage:
  node scripts/gsc-sitemap-manage.mjs <command> [args...]

Commands:
  list                          Show currently registered sitemaps.
  submit <feedpath>             Submit / re-submit a sitemap.
  delete <feedpath>             Un-register a sitemap.
  fix-known-issues              Apply the 2026-06-01 audit fixes (submit
                                compare + alternatives, delete security.txt).

Options:
  --site <property>             Override target property
                                (default: ${DEFAULT_SITE}).

Auth:
  Set GSC_SERVICE_ACCOUNT_JSON env, OR re-auth ADC with the write scope:
  gcloud auth application-default login \\
    --scopes=https://www.googleapis.com/auth/webmasters,https://www.googleapis.com/auth/cloud-platform
`);
}

async function main() {
  const args = parseArgs(process.argv);
  switch (args.command) {
    case "list":
      await cmdList(args.site);
      break;
    case "submit":
      await cmdSubmit(args.site, args.target);
      break;
    case "delete":
      await cmdDelete(args.site, args.target);
      break;
    case "fix-known-issues":
    case "fix":
      await cmdFixKnownIssues(args.site);
      break;
    default:
      help();
      process.exitCode = args.command === "help" ? 0 : 1;
  }
}

main().catch((err) => {
  console.error(`gsc-sitemap-manage failed: ${err.message}`);
  process.exit(1);
});
