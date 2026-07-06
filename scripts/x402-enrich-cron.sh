#!/bin/sh
# TrendingRepo x402 on-chain + MCP-liveness collectors (WS2b, 2026-07).
#
# Box runtime: /opt/trendingrepo-cron — collector scripts pinned from
# origin/main, isolated from the bot workspace checkout at /opt/trendingrepo
# (which is diverged + dirty and must not be touched by cron).
# node_modules is a symlink into /opt/trendingrepo/node_modules.
#
# Install: copy to /usr/local/bin/trendingrepo-x402-enrich.sh (root, 0755).
# Wired by /etc/cron.d/trendingrepo-x402-enrich:
#   7 */6 * * *  all       (Base + Solana on-chain -> USD rollup -> liveness)
#   37 * * * *   liveness  (MCP liveness ping only)
# Modes: all | liveness
MODE="${1:-all}"
LOG=/var/log/trendingrepo-x402-enrich.log
# Per-mode lock: a slow 6h "all" pull (public-RPC 429 backoff) must not
# starve the hourly liveness tick.
exec 9>"/run/trendingrepo-x402-enrich.${MODE}.lock"
flock -n 9 || exit 0
ENVF=/opt/trendingrepo/.env.production
for k in REDIS_URL UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN SOLANA_RPC_URL; do
  v=$(grep -E "^$k=" "$ENVF" | head -1 | cut -d= -f2-)
  [ -n "$v" ] && export "$k=$v"
done
# REDIS_URL in .env.production points at the compose-internal hostname
# "redis", which does NOT resolve on the box host (redis publishes no host
# port). The host can reach container IPs on the docker bridge directly, so
# rewrite the hostname to the live toolbox-redis-1 IP. Resolved fresh per
# invocation so a container recreate cannot strand the cron.
case "${REDIS_URL:-}" in
  *@redis:*|*//redis:*)
    RIP=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$v.IPAddress}} {{end}}' toolbox-redis-1 2>/dev/null | awk '{print $1}')
    if [ -n "$RIP" ]; then
      REDIS_URL=$(printf %s "$REDIS_URL" | sed "s|@redis:|@${RIP}:|;s|//redis:|//${RIP}:|")
      export REDIS_URL
    else
      echo "[$(date -u +%FT%TZ)] ERROR: cannot resolve toolbox-redis-1 IP for REDIS_URL rewrite" >> "$LOG"
      exit 1
    fi
    ;;
esac
if [ -z "${REDIS_URL:-}" ] && [ -z "${UPSTASH_REDIS_REST_URL:-}" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR: no Redis transport in $ENVF" >> "$LOG"; exit 1
fi
cd /opt/trendingrepo-cron
rc=0
step() {
  echo "[$(date -u +%FT%TZ)] step: $*" >> "$LOG"
  "$@" >> "$LOG" 2>&1 || { rc=$?; echo "[$(date -u +%FT%TZ)] STEP-FAILED rc=$rc: $*" >> "$LOG"; }
}
echo "[$(date -u +%FT%TZ)] === run mode=$MODE ===" >> "$LOG"
if [ "$MODE" = "all" ]; then
  # timeout(1): a wedged public-RPC pull must not hold the slot past 25 min.
  step timeout 1500 node scripts/fetch-base-x402-onchain.mjs --max-pages-per-addr 2
  step timeout 1500 node scripts/fetch-solana-x402-onchain.mjs --max-pages-per-addr 1
  step timeout 1500 node scripts/build-x402-volume-from-onchain.mjs
fi
step timeout 1500 node scripts/ping-mcp-liveness.mjs
echo "[$(date -u +%FT%TZ)] === done mode=$MODE rc=$rc ===" >> "$LOG"
exit $rc
