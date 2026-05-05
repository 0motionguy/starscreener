import { getDataStore } from "../src/lib/data-store";
import { repoWhyKey, type RepoWhyRecord } from "../src/lib/repo-why";

async function main(): Promise<void> {
  const key = repoWhyKey("vercel", "next.js");
  const payload: RepoWhyRecord = {
    owner: "vercel",
    name: "next.js",
    fullName: "vercel/next.js",
    signal: "stars_velocity",
    line: "vercel/next.js is trending on star velocity.",
    generatedAt: new Date().toISOString(),
  };

  const store = getDataStore();
  const t0 = Date.now();
  console.log("write:start", key);
  await store.write(key, payload, { ttlSeconds: 86400, writer: "agn-791-probe" });
  console.log("write:ok_ms", Date.now() - t0);

  const t1 = Date.now();
  const out = await store.read<RepoWhyRecord>(key);
  console.log("read:ok_ms", Date.now() - t1, "source=", out.source, "hasLine=", Boolean(out.data?.line));
}

main().catch((err) => {
  console.error("[agn-791] store probe failed:", err);
  process.exitCode = 1;
});
