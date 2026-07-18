#!/bin/sh
# TrendingRepo 5x/day X autopilot — cron wrapper (Phase C).
# Pattern-matched to trendingrepo-x402-enrich.sh: pinned checkout, grep-export
# env (never `source` the dirty workspace env), flock, internal logging.
#
# Cron: hourly at :47; --dispatch-utc maps UTC hours to slots because HOSTUP
#       runs Vixie cron in CEST/CET and ignores per-file timezone settings.
# Gate: TWITTER_OUTBOUND_MODE=live in /opt/trendingrepo/.env.production —
#       auto-armed by trendingrepo-refresh-x-cookies.sh after a VERIFIED
#       @trendingrepo session. Until then every slot logs a dormant skip, exit 0.
#       `--dry-run` bypasses the gate (runner skips auth guard + post).
# Post path: node /opt/trendingrepo-cron/scripts/twitter-trending-run.mjs
#       (self-contained: node built-ins + global fetch; cap + 14d cooldown in
#       the app make a double fire a no-op).
if [ "${1:-}" = "--dispatch-utc" ]; then
  case "$(date -u +%H)" in
    04) set -- --slot D ;;
    08) set -- --slot A ;;
    12) set -- --slot B ;;
    17) set -- --slot C ;;
    21) set -- --slot E ;;
    *) exit 0 ;;
  esac
fi

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
