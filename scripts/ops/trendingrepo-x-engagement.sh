#!/bin/sh
# TrendingRepo X engagement autopilot — cron wrapper.
# Pattern-matched to trendingrepo-x-autopilot.sh: pinned checkout, grep-export
# env (never `source` the dirty workspace env), flock, internal logging.
#
# Cron: every 2h at :23 (see trendingrepo-x-engagement.cron).
# Gate: TWITTER_ENGAGEMENT_MODE in /opt/trendingrepo/.env.production —
#       SEPARATE from TWITTER_OUTBOUND_MODE, so replies arm independently of
#       the 7x/day broadcast. Until it is `live` (or `dry`) every run logs a
#       dormant skip, exit 0. `--dry-run` composes drafts but posts nothing;
#       it is allowed whenever the mode is dry or live.
# Post path: node /opt/trendingrepo-cron/scripts/x-engagement-run.mjs — the app
#       (not this host) does the posting via its outbound adapter; the app
#       enforces the daily cap + 72h/author cooldown + per-post dedupe, so a
#       double fire is a safe no-op.
LOG=/var/log/trendingrepo-x-engagement.log
exec 9>"/run/trendingrepo-x-engagement.lock"
flock -n 9 || exit 0

ENVF=/opt/trendingrepo/.env.production
say() { echo "[$(date -u +%FT%TZ)] $*" >>"$LOG"; }

for k in CRON_SECRET TRENDINGREPO_URL TWITTER_ENGAGEMENT_MODE; do
  v=$(grep -E "^$k=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2-)
  [ -n "$v" ] && export "$k=$v"
done

MODE=$(printf '%s' "${TWITTER_ENGAGEMENT_MODE:-}" | tr '[:upper:]' '[:lower:]')
DRY=0
case " $* " in *" --dry-run "*) DRY=1 ;; esac

# Hard kill: only run when armed. `off`/unset always dormant-skips. `dry` runs
# on schedule (composes drafts to the review surface, posts nothing); `live`
# posts. A manual `--dry-run` can preview without posting even when live.
if [ "$MODE" != "live" ] && [ "$MODE" != "dry" ]; then
  say "mode=${MODE:-unset} != live/dry — dormant skip"
  exit 0
fi

say "=== run mode=${MODE:-unset} dry=${DRY} args=${*:-none} ==="
cd /opt/trendingrepo-cron || { say "FATAL: pinned checkout /opt/trendingrepo-cron missing"; exit 1; }
node scripts/x-engagement-run.mjs "$@" >>"$LOG" 2>&1
rc=$?
say "=== done rc=$rc ==="
exit $rc
