function normalizeVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(value);
}

function normalizeTxCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeFacilitatorEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const volumeUsdc = normalizeVolume(entry.volumeUsdc);
  if (volumeUsdc === null) return null;
  return {
    txCount: normalizeTxCount(entry.txs ?? entry.txCount),
    volumeUsdc,
  };
}

function appendRows(rows, chain, byDay) {
  if (!byDay || typeof byDay !== "object") return;
  for (const [day, dayEntry] of Object.entries(byDay)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const byFacilitator = dayEntry?.byFacilitator;
    if (!byFacilitator || typeof byFacilitator !== "object") continue;
    for (const [facilitator, rawEntry] of Object.entries(byFacilitator)) {
      const entry = normalizeFacilitatorEntry(rawEntry);
      if (!entry) continue;
      rows.push({
        day,
        chain,
        facilitator,
        txCount: entry.txCount,
        volumeUsdc: entry.volumeUsdc,
      });
    }
  }
}

export function buildX402VolumePayload({
  fetchedAt = new Date().toISOString(),
  base = null,
  solana = null,
} = {}) {
  const rows = [];
  appendRows(rows, "base", base?.byDay);
  appendRows(rows, "solana", solana?.byDay);
  rows.sort((a, b) => {
    const day = a.day.localeCompare(b.day);
    if (day !== 0) return day;
    const chain = a.chain.localeCompare(b.chain);
    if (chain !== 0) return chain;
    return a.facilitator.localeCompare(b.facilitator);
  });

  return {
    fetchedAt,
    source: "x402-onchain-rollup",
    lastDay: rows.length > 0 ? rows[rows.length - 1].day : null,
    rows,
  };
}
