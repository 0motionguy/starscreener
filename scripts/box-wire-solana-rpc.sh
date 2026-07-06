#!/usr/bin/env bash
# Wire a solana RPC that can actually serve the x402 fetcher into the cron env.
#
# The fetcher (scripts/fetch-solana-x402-onchain.mjs) needs
# getSignaturesForAddress + getTransaction. Lessons burned in here:
#   - api.mainnet-beta.solana.com 403s those methods from datacenter IPs
#     (observed 2026-07-06: STEP-FAILED rc=124 after backoff loops).
#   - The keyed Chainstack endpoint inside the neobank container answers
#     getHealth 200 but gates getSignaturesForAddress behind "Archive"
#     plans: HTTP 403, code -32002. A getHealth probe therefore proves
#     nothing — always probe the real method.
#   - rpc.ankr.com/solana is key-gated now (-32052).
#   - solana.publicnode.com (Allnodes) serves getSigs from this box
#     (HTTP 200 verified 2026-07-06) — free, no key.
#
# Preference order: keyed container endpoint if it can serve getSigs
# (fast, paid), else the public fallback. Idempotent: replaces any
# existing SOLANA_RPC_URL line in place.
#
# Secrets never leave the box: prints only entry counts, HTTP statuses,
# and (for the public fallback only) the chosen URL. Run it ON the box:
#   ssh toolbox 'bash -s' < scripts/box-wire-solana-rpc.sh
set -euo pipefail

ENVF=/opt/trendingrepo/.env.production
SRC_CONTAINER=toolbox-neobank-api-1
PUBLIC_FALLBACK=https://solana.publicnode.com
# Busy mainnet address (USDC mint) — any active addr works as a
# method-permission probe with limit:1.
PROBE_ADDR=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

probe_getsigs() { # $1=url -> stdout http_code; body in /tmp/rpcprobe.json
  curl -s -m 15 -o /tmp/rpcprobe.json -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getSignaturesForAddress","params":["'"$PROBE_ADDR"'",{"limit":1}]}' \
    "$1" || true
}

CHOICE=""
V=$(docker inspect "$SRC_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep -m1 '^CHAINSTACK_SOLANA_RPC_URL=' | cut -d= -f2- || true)
if [ -n "$V" ]; then
  code=$(probe_getsigs "$V")
  if [ "$code" = "200" ] && grep -q '"result"' /tmp/rpcprobe.json; then
    CHOICE=$V
    echo "keyed container RPC serves getSigs (HTTP $code) — using it (URL withheld)"
  else
    echo "keyed container RPC cannot serve getSigs (HTTP $code): $(head -c 110 /tmp/rpcprobe.json)"
  fi
else
  echo "no CHAINSTACK_SOLANA_RPC_URL in $SRC_CONTAINER"
fi

if [ -z "$CHOICE" ]; then
  code=$(probe_getsigs "$PUBLIC_FALLBACK")
  if [ "$code" != "200" ] || ! grep -q '"result"' /tmp/rpcprobe.json; then
    echo "FALLBACK-UNUSABLE $PUBLIC_FALLBACK HTTP $code: $(head -c 110 /tmp/rpcprobe.json)"
    exit 1
  fi
  CHOICE=$PUBLIC_FALLBACK
  echo "fallback getSigs probe HTTP $code — using $PUBLIC_FALLBACK"
fi

if grep -q '^SOLANA_RPC_URL=' "$ENVF"; then
  sed -i "s|^SOLANA_RPC_URL=.*|SOLANA_RPC_URL=$CHOICE|" "$ENVF"
else
  printf 'SOLANA_RPC_URL=%s\n' "$CHOICE" >> "$ENVF"
fi
echo "env entries: $(grep -c '^SOLANA_RPC_URL=' "$ENVF")"
