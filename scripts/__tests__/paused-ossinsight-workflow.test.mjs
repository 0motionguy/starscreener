import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

test("scrape-trending skips direct OSS Insight network calls by default", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "tr-ossinsight-skip-"));
  const preloader = join(tempDir, "fail-fetch.mjs");
  writeFileSync(
    preloader,
    "globalThis.fetch = async () => { throw new Error('unexpected OSS Insight network call'); };\n",
    "utf8",
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(preloader).href,
        "scripts/scrape-trending.mjs",
        "--skip-collection-rankings",
      ],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          DATA_STORE_DISABLE: "1",
          TRENDINGREPO_ENABLE_OSSINSIGHT: "",
          TOOLBOX_INGEST_URL: "",
          TOOLBOX_INGEST_HMAC_SECRET: "",
        },
        encoding: "utf8",
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /OSS Insight direct scrape disabled by default/);
    assert.doesNotMatch(output, /unexpected OSS Insight network call/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
