async function main(): Promise<void> {
  console.log("[agn-791] generate-top50-why: start");
  const { ensureTopRepoWhys } = await import("@/lib/repo-why");
  console.log("[agn-791] generate-top50-why: engine-loaded");
  const written = await ensureTopRepoWhys(50);
  console.log(`[agn-791] persisted why captions: ${written}/50`);
}

main().catch((err) => {
  console.error("[agn-791] failed to generate top50 why captions:", err);
  process.exitCode = 1;
});
