#!/usr/bin/env bash
# TrendingRepo X posting pre-flight — the "similar play" twin of
# /opt/aiso/x-session-check.sh (which guards the 15:47 aiso relay).
#
# Guards the 5x/day trendingrepo autopilot (twitter-trending-run.mjs):
#   1) cookie session still authenticated (twitter-cli feed, read-only)
#   2) outcome: every prior UTC-day slot was confirmed (only when mode=live)
# Mode-aware: TWITTER_OUTBOUND_MODE != live -> informational only, never
# pages, so dry-run Phase B/C can never false-alarm #toolbox-critical.
#
# Alerts route through toolbox-alertmanager-1 (severity=critical -> Slack
# #toolbox-critical, dedup + 30m repeat, send_resolved); falls back to
# OPS_ALERT_WEBHOOK_URL from /opt/toolbox/.env; always logs.
#
# Deploy: scripts/ops (repo) -> /usr/local/bin/trendingrepo-x-preflight.sh
# Cron:   hourly at :27 with --dispatch-utc; the wrapper proceeds only at
#         04:27 UTC, twenty minutes before the first posting slot.
set -uo pipefail

if [ "${1:-}" = "--dispatch-utc" ] && [ "$(date -u +%H)" != "04" ]; then
  exit 0
fi

ENV_FILE=/opt/trendingrepo/.env.production        # mode + app config
COOKIE_FILE=/opt/trendingrepo-twitter/.env        # canonical @trendingrepo store (trending-twitter-login / refresh script)
RUN_LOG=/var/log/trendingrepo-x-autopilot.log # posting wrapper logs here (Phase C)
. /opt/toolbox/.env 2>/dev/null || true

ts() { date -u +%FT%TZ; }

alert() {
  local msg="$1" sent=0
  echo "$(ts) ALERT: $msg"
  local am_ip
  am_ip=$(docker inspect toolbox-alertmanager-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null | head -c 32)
  if [ -n "$am_ip" ]; then
    curl -sS -m 10 -X POST "http://$am_ip:9093/api/v2/alerts" -H "Content-Type: application/json" \
      -d "[{\"labels\":{\"alertname\":\"TrendingRepoXPreflight\",\"severity\":\"critical\",\"service\":\"twitter-trending\",\"instance\":\"toolbox\"},\"annotations\":{\"summary\":\"$msg\"},\"generatorURL\":\"file:///usr/local/bin/trendingrepo-x-preflight.sh\"}]" \
      >/dev/null 2>&1 && sent=1
  fi
  if [ "$sent" = 0 ] && [ -n "${OPS_ALERT_WEBHOOK_URL:-}" ]; then
    curl -sS -m 10 -X POST -H "Content-Type: application/json" \
      -d "{\"content\":\"trendingrepo x-autopilot ALERT: $msg\"}" "$OPS_ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
}

MODE=$(grep -E '^TWITTER_OUTBOUND_MODE=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
MODE=${MODE:-unset}
LIVE=0
[ "$MODE" = "live" ] && LIVE=1
echo "$(ts) mode: $MODE"

fail=0

# --- 1) cookie session check (read-only) ---------------------------------
AUTH=$(grep -E '^TWITTER_AUTH_TOKEN=' "$COOKIE_FILE" 2>/dev/null | cut -d= -f2-)
CT0=$(grep -E '^TWITTER_CT0=' "$COOKIE_FILE" 2>/dev/null | cut -d= -f2-)
if [ -n "$AUTH" ] && [ -n "$CT0" ]; then
  export TWITTER_AUTH_TOKEN="$AUTH" TWITTER_CT0="$CT0"
  if twitter-cli feed --json 2>/dev/null | grep -qE '"ok": ?true'; then
    echo "$(ts) session: OK"
  else
    if [ "$LIVE" = 1 ]; then
      alert "X session DEAD - refresh BEFORE the next post window: ssh toolbox trendingrepo-refresh-x-cookies.sh <auth_token> <ct0>"
      fail=1
    else
      echo "$(ts) session: DEAD (mode=$MODE, not paging) - refresh via trendingrepo-refresh-x-cookies.sh"
    fi
  fi
else
  if [ "$LIVE" = 1 ]; then
    alert "cookies missing in $COOKIE_FILE while mode=live - posts will silently no-op"
    fail=1
  else
    echo "$(ts) cookies: not provisioned yet (Phase C pending) - session check SKIP"
  fi
fi

# --- 2) outcome check (every prior UTC-day slot confirmed) ---------------
if [ "$LIVE" = 1 ]; then
  prior_day=$(date -u -d 'yesterday' +%F)
  missing=""
  for slot in D A B C E; do
    if ! grep -aEq "^${prior_day}T[^ ]+Z posted slot=${slot} [0-9]{15,20}$" "$RUN_LOG" 2>/dev/null; then
      missing="${missing}${missing:+,}${slot}"
    fi
  done
  if [ -n "$missing" ]; then
    alert "missing confirmed posts for prior UTC day $prior_day slots=$missing - check $RUN_LOG"
    fail=1
  else
    echo "$(ts) prior UTC day $prior_day slots D/A/B/C/E confirmed - OK"
  fi
else
  echo "$(ts) outcome check: SKIP (mode=$MODE)"
fi

exit $fail
