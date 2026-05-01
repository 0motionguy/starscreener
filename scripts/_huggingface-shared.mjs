// HuggingFace token-pool helpers.
//
// HF API supports unauthenticated reads but enforces per-IP soft limits.
// An authenticated request raises the quota. Multiple tokens let one
// physical workflow rotate across N independent HF accounts so a single
// 3h cron tick can stay well under each account's per-IP ceiling.
//
// Canonical env: HF_TOKENS (comma-separated). Back-compat: HF_TOKEN
// (single) is treated as one slot in the pool. Both can be set; we
// dedupe and round-robin across the union. When neither is present,
// callers fall back to unauthenticated requests (current behaviour).
//
// Mirrors scripts/_devto-shared.mjs:loadDevtoKeys / nextDevtoKey.

function loadHuggingfaceTokens() {
  const out = [];
  const seen = new Set();
  const push = (k) => {
    const v = (k ?? "").trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  const pool = process.env.HF_TOKENS;
  if (typeof pool === "string" && pool.length > 0) {
    for (const raw of pool.split(",")) push(raw);
  }
  push(process.env.HF_TOKEN);
  return out;
}

// Round-robin picker. `cursor` is caller-owned (a let in the importing
// module); the picker just modulos by pool length so the caller doesn't
// have to track length.
function pickToken(tokens, cursor) {
  if (!Array.isArray(tokens) || tokens.length === 0) return undefined;
  const idx = ((cursor % tokens.length) + tokens.length) % tokens.length;
  return tokens[idx];
}

// Convenience: return Authorization header object for the picked token,
// or an empty object when no token is available (so spread-merging into
// existing headers is safe in either case).
function authHeader(token) {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export { loadHuggingfaceTokens, pickToken, authHeader };
