import * as nextEnv from "@next/env";
import { getScannerSourceHealth } from "../src/lib/source-health";

nextEnv.loadEnvConfig(process.cwd());

function formatAge(ageSeconds: number | null): string {
  if (ageSeconds === null) return "-";
  if (ageSeconds < 60) return `${ageSeconds}s`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m`;
  if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)}h`;
  return `${Math.floor(ageSeconds / 86400)}d`;
}

const sources = getScannerSourceHealth();
const rows = sources.map((source) => ({
  source: source.label.padEnd(13),
  status: source.status.padEnd(8),
  age: formatAge(source.ageSeconds).padEnd(4),
  cadence: source.cadence.padEnd(4),
  fetchedAt: source.fetchedAt ?? "-",
  notes: source.notes.join(" | ") || "-",
}));

console.log("Scanner Freshness");
console.log("=================");
for (const row of rows) {
  console.log(
    `${row.source}  ${row.status}  age=${row.age}  cadence=${row.cadence}  fetched=${row.fetchedAt}`,
  );
  if (row.notes !== "-") {
    console.log(`  notes: ${row.notes}`);
  }
}

const degraded = sources.filter((source) => source.status === "degraded");
const stale = sources.filter((source) => source.status === "stale");
console.log("");
console.log(
  `summary: ${sources.length} total, ${degraded.length} degraded, ${stale.length} stale`,
);
