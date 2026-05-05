import { ensureTopRepoWhys } from "@/lib/repo-why";

async function main(): Promise<void> {
  const written = await ensureTopRepoWhys(50);
  console.log(`[agn-791] persisted why captions: ${written}/50`);
}

main().catch((err) => {
  console.error("[agn-791] failed to generate top50 why captions:", err);
  process.exitCode = 1;
});
