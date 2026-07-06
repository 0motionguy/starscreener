#!/usr/bin/env bash
# Wire the keyed Chainstack solana RPC into the trendingrepo cron env.
#
# The toolbox already runs neobank containers that carry a populated
# CHAINSTACK_SOLANA_RPC_URL. The x402 solana fetcher
# (scripts/fetch-solana-x402-onchain.mjs) reads SOLANA_RPC_URL from
# /opt/trendingrepo/.env.production (exported by the enrich cron wrapper).
# On the free public RPC the fetch 429-throttles past the 1500s step cap
# (observed 2026-07-06: STEP-FAILED rc=124, zero solana rows), so we reuse
# the existing paid endpoint instead of provisioning a new key.
#
# Secrets never leave the box: this script prints only entry counts and the
# HTTP status of a getHealth probe. Run it ON the box, e.g.:
#   ssh toolbox 'bash -s' < scripts/box-wire-solana-rpc.sh
set -euo pipefail

ENVF=/opt/trendingrepo/.env.production
SRC_CONTAINER=toolbox-neobank-api-1

V=$(docker inspect "$SRC_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -m1 '^CHAINSTACK_SOLANA_RPC_URL=' | cut -d= -f2-)
[ -n "$V" ] || { echo "NO-VALUE-IN-CONTAINER ($SRC_CONTAINER)"; exit 1; }

if grep -q '^SOLANA_RPC_URL=' "$ENVF"; then
  sed -i "s|^SOLANA_RPC_URL=.*|SOLANA_RPC_URL=$V|" "$ENVF"
else
  printf 'SOLANA_RPC_URL=%s\n' "$V" >> "$ENVF"
fi
echo "env entries: $(grep -c '^SOLANA_RPC_URL=' "$ENVF")"

code=$(curl -s -m 10 -o /tmp/rpcprobe.json -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' "$V")
echo "rpc probe HTTP $code: $(head -c 120 /tmp/rpcprobe.json)"
