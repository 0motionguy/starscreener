#!/bin/sh
# TrendingRepo 3x/day X autopilot — cron wrapper (Phase C).
# Pattern-matched to trendingrepo-x402-enrich.sh: pinned checkout, grep-export
# env (never `source` the dirty workspace env), flock, internal logging.
#
# Cron: /etc/cron.d/trendingrepo-x-autopilot -> 47 8,12,17 * * * root <this>
# Gate: TWITTER_OUTBOUND_MODE=live in /opt/trendingrepo/.env.production —
#       auto-armed by trendingrepo-refresh-x-cookies.sh after a VERIFIED
#       @trendingrepo session. Until then every slot logs a dormant skip, exit 0.
#       `--dry-run` bypasses the gate (runner skips auth guard + post).
# Post path: node /opt/trendingrepo-cron/scripts/twitter-trending-run.mjs
#       (self-contained: node built-ins + global fetch; cap + 14d cooldown in
#       the app make a double fire a no-op).
LOG=/var/log/trendingrepo-x-autopilot.log
exec 9>"/run/trendingrepo-x-autopilot.lock"
flock -n 9 || exit 0

ENVF=/opt/trendingrepo/.env.production
COOKF=/opt/trendingrepo-twitter/.env
say() { echo "[$(date -u +%FT%TZ)] $*" >>"$LOG"; }

for k in CRON_SECRET TRENDINGREPO_URL; do
  v=$(grep -E "^$k=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2-)
  [ -n "$v" ] && export "$k=$v"
done
for k in TWITTER_AUTH_TOKEN TWITTER_CT0; do
  v=$(grep -E "^$k=" "$COOKF" 2>/dev/null | head -1 | cut -d= -f2-)
  [ -n "$v" ] && export "$k=$v"
done

MODE=$(grep -E "^TWITTER_OUTBOUND_MODE=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2-)
DRY=0
case " $* " in *" --dry-run "*) DRY=1 ;; esac
if [ "$DRY" = 0 ] && [ "$MODE" != "live" ]; then
  say "mode=${MODE:-unset} != live — dormant skip"
  exit 0
fi

say "=== run mode=${MODE:-unset} args=${*:-none} ==="
cd /opt/trendingrepo-cron || { say "FATAL: pinned checkout /opt/trendingrepo-cron missing"; exit 1; }
node scripts/twitter-trending-run.mjs "$@" >>"$LOG" 2>&1
rc=$?
say "=== done rc=$rc ==="
exit $rc
