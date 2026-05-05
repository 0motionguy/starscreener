import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";

const ROOT = process.cwd();
const WORKFLOWS_DIR = resolve(ROOT, ".github", "workflows");
const OUT_FILE = resolve(ROOT, "data", "collector-dual-write-coverage.json");
const ISSUE_ID = (process.env.ISSUE_ID || "AGN-346").trim();

const WORKFLOW_INCLUDE = /^(collect|scrape|refresh|enrich|sync|snapshot|run-shadow-scoring|promote-unknown-mentions|ping-mcp-liveness|aiso-self-scan)/;
const SCRIPT_PATH_RE = /(scripts\/[\w.-]+\.(?:mjs|mts|ts))/g;
const NPM_RUN_RE = /npm\s+run\s+([\w:-]+)/g;
const WRITE_CALL_RE = /writeDataStore\s*\(/;
const WRITE_IMPORT_RE = /from\s+["']\.\/_data-store-write\.mjs["']/;
const STORE_IMPORT_RE = /from\s+["']@\/lib\/data-store["']/;
const STORE_WRITE_CALL_RE = /\b(?:store|getDataStore\(\))\.write\s*\(/;
const TOP10_SNAPSHOT_WRITE_RE = /\bwriteTop10Snapshot\s*\(/;
const SPARKLINE_APPEND_RE = /\bappendSparklinePoint\s*\(/;

const TOP12_KEYS = [
  {
    key: "trending",
    writerFile: "scripts/scrape-trending.mjs",
    readerFile: "src/lib/trending.ts",
    refreshFn: "refreshTrendingFromStore",
    workflow: ".github/workflows/scrape-trending.yml",
  },
  {
    key: "reddit-mentions",
    writerFile: "scripts/scrape-reddit.mjs",
    readerFile: "src/lib/reddit-data.ts",
    refreshFn: "refreshRedditMentionsFromStore",
    workflow: ".github/workflows/scrape-trending.yml",
  },
  {
    key: "hackernews-repo-mentions",
    writerFile: "scripts/scrape-hackernews.mjs",
    readerFile: "src/lib/hackernews.ts",
    refreshFn: "refreshHackernewsMentionsFromStore",
    workflow: ".github/workflows/scrape-trending.yml",
  },
  {
    key: "bluesky-mentions",
    writerFile: "scripts/scrape-bluesky.mjs",
    readerFile: "src/lib/bluesky.ts",
    refreshFn: "refreshBlueskyMentionsFromStore",
    workflow: ".github/workflows/scrape-bluesky.yml",
  },
  {
    key: "devto-mentions",
    writerFile: "scripts/scrape-devto.mjs",
    readerFile: "src/lib/devto.ts",
    refreshFn: "refreshDevtoMentionsFromStore",
    workflow: ".github/workflows/scrape-devto.yml",
  },
  {
    key: "lobsters-mentions",
    writerFile: "scripts/scrape-lobsters.mjs",
    readerFile: "src/lib/lobsters.ts",
    refreshFn: "refreshLobstersMentionsFromStore",
    workflow: ".github/workflows/scrape-lobsters.yml",
  },
  {
    key: "twitter-repo-signals",
    writerFile: "scripts/collect-twitter-signals.ts",
    readerFile: "src/lib/twitter/signal-data.ts",
    refreshFn: "refreshTwitterSignalsFromStore",
    workflow: ".github/workflows/collect-twitter.yml",
  },
  {
    key: "producthunt-launches",
    writerFile: "scripts/scrape-producthunt.mjs",
    readerFile: "src/lib/producthunt.ts",
    refreshFn: "refreshProducthuntLaunchesFromStore",
    workflow: ".github/workflows/scrape-producthunt.yml",
  },
  {
    key: "npm-packages",
    writerFile: "scripts/scrape-npm.mjs",
    readerFile: "src/lib/npm.ts",
    refreshFn: "refreshNpmFromStore",
    workflow: ".github/workflows/scrape-npm.yml",
  },
  {
    key: "huggingface-trending",
    writerFile: "scripts/scrape-huggingface.mjs",
    readerFile: "src/lib/huggingface.ts",
    refreshFn: "refreshHfModelsFromStore",
    workflow: ".github/workflows/scrape-huggingface.yml",
  },
  {
    key: "arxiv-recent",
    writerFile: "scripts/scrape-arxiv.mjs",
    readerFile: "src/lib/arxiv.ts",
    refreshFn: "refreshArxivFromStore",
    workflow: ".github/workflows/scrape-arxiv.yml",
  },
  {
    key: "funding-news",
    writerFile: "scripts/scrape-funding-news.mjs",
    readerFile: "src/lib/funding-news.ts",
    refreshFn: "refreshFundingNewsFromStore",
    workflow: ".github/workflows/collect-funding.yml",
  },
];

function loadPackageScripts() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  return pkg.scripts ?? {};
}

function extractScriptPaths(text, packageScripts) {
  const found = new Set();

  for (const m of text.matchAll(SCRIPT_PATH_RE)) {
    found.add(m[1]);
  }

  for (const m of text.matchAll(NPM_RUN_RE)) {
    const cmd = packageScripts[m[1]];
    if (!cmd) continue;
    for (const sm of cmd.matchAll(SCRIPT_PATH_RE)) {
      found.add(sm[1]);
    }
  }

  return [...found].sort();
}

function checkDualWrite(scriptPath) {
  const abs = resolve(ROOT, scriptPath);
  const text = readFileSync(abs, "utf8");
  const hasLegacyImport = WRITE_IMPORT_RE.test(text);
  const hasLegacyCall = WRITE_CALL_RE.test(text);
  const hasStoreImport = STORE_IMPORT_RE.test(text);
  const hasStoreWriteCall = STORE_WRITE_CALL_RE.test(text);
  const hasSnapshotHelperWrite = TOP10_SNAPSHOT_WRITE_RE.test(text);
  const hasSparklineAppendWrite = SPARKLINE_APPEND_RE.test(text);
  const hasImport = hasLegacyImport || hasStoreImport;
  const hasCall =
    hasLegacyCall ||
    hasStoreWriteCall ||
    hasSnapshotHelperWrite ||
    hasSparklineAppendWrite;
  return {
    scriptPath,
    dualWrite: hasImport && hasCall,
    hasImport,
    hasCall,
    detection: {
      hasLegacyImport,
      hasLegacyCall,
      hasStoreImport,
      hasStoreWriteCall,
      hasSnapshotHelperWrite,
      hasSparklineAppendWrite,
    },
  };
}

function hasWriteForKey(filePath, key) {
  const abs = resolve(ROOT, filePath);
  const text = readFileSync(abs, "utf8");
  const keyPattern = new RegExp(`writeDataStore\\s*\\(\\s*["']${key.replace(/[-:]/g, "\\$&")}["']`);
  return keyPattern.test(text);
}

function hasRefresh(readerFile, refreshFn) {
  const abs = resolve(ROOT, readerFile);
  const text = readFileSync(abs, "utf8");
  const fnPattern = new RegExp(`\\b${refreshFn}\\b`);
  return fnPattern.test(text);
}

function readWorkflowCron(workflowPath) {
  const abs = resolve(ROOT, workflowPath);
  const text = readFileSync(abs, "utf8");
  const match = text.match(/cron:\s*["']([^"']+)["']/);
  return match ? match[1] : null;
}

function buildTop12Coverage() {
  const rows = TOP12_KEYS.map((row) => {
    const hasWriter = hasWriteForKey(row.writerFile, row.key);
    const hasReader = hasRefresh(row.readerFile, row.refreshFn);
    const cron = readWorkflowCron(row.workflow);
    return {
      ...row,
      hasWriter,
      hasReader,
      cron,
      covered: hasWriter && hasReader,
    };
  });

  const covered = rows.filter((r) => r.covered).length;
  return {
    total: rows.length,
    covered,
    uncovered: rows.length - covered,
    rows,
  };
}

function main() {
  const packageScripts = loadPackageScripts();
  const files = readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith(".yml") && WORKFLOW_INCLUDE.test(f.replace(/\.yml$/, "")))
    .sort();

  const workflows = [];
  const uniqueScripts = new Set();

  for (const file of files) {
    const wfText = readFileSync(resolve(WORKFLOWS_DIR, file), "utf8");
    const scripts = extractScriptPaths(wfText, packageScripts);
    const checks = scripts
      .filter((s) => s.startsWith("scripts/"))
      .map((s) => {
        uniqueScripts.add(s);
        return checkDualWrite(s);
      });

    workflows.push({
      workflow: file,
      scripts: checks,
      allDualWrite: checks.every((c) => c.dualWrite),
    });
  }

  const scriptChecks = [...uniqueScripts].sort().map(checkDualWrite);
  const uncovered = scriptChecks.filter((s) => !s.dualWrite);
  const covered = scriptChecks.filter((s) => s.dualWrite);
  const top12 = buildTop12Coverage();

  const out = {
    generatedAt: new Date().toISOString(),
    issue: ISSUE_ID,
    scope: "Workflow-invoked collector scripts under scripts/",
    summary: {
      workflowsScanned: workflows.length,
      scriptsScanned: scriptChecks.length,
      covered: covered.length,
      uncovered: uncovered.length,
    },
    top12KeyCoverage: top12,
    uncovered,
    workflows,
  };

  writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`wrote ${basename(OUT_FILE)} workflows=${workflows.length} scripts=${scriptChecks.length} uncovered=${uncovered.length}`);
  console.log(`top12 keys covered=${top12.covered}/${top12.total} uncovered=${top12.uncovered}`);
  for (const row of top12.rows.filter((r) => !r.covered)) {
    console.log(`top12-uncovered: key=${row.key} writer=${row.hasWriter} reader=${row.hasReader}`);
  }
  if (uncovered.length > 0) {
    for (const row of uncovered) {
      console.log(`uncovered: ${row.scriptPath} import=${row.hasImport} call=${row.hasCall}`);
    }
    process.exitCode = 1;
  }
}

main();
