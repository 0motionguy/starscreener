#!/usr/bin/env bash
# TrendingRepo X posting pre-flight — the "similar play" twin of
# /opt/aiso/x-session-check.sh (which guards the 15:47 aiso relay).
#
# Guards the 3x/day trendingrepo autopilot (twitter-trending-run.mjs):
#   1) cookie session still authenticated (twitter-cli feed, read-only)
#   2) outcome: a post actually landed in the last 26h (only when mode=live)
# Mode-aware: TWITTER_OUTBOUND_MODE != live -> informational only, never
# pages, so dry-run Phase B/C can never false-alarm #toolbox-critical.
#
# Alerts route through toolbox-alertmanager-1 (severity=critical -> Slack
# #toolbox-critical, dedup + 30m repeat, send_resolved); falls back to
# OPS_ALERT_WEBHOOK_URL from /opt/toolbox/.env; always logs.
#
# Deploy: scripts/ops (repo) -> /usr/local/bin/trendingrepo-x-preflight.sh
# Cron:   /etc/cron.d/trendingrepo-x-preflight (27 9 * * * — ten minutes
#         after the aiso check so Slack pings don't interleave).
set -uo pipefail

ENV_FILE=/opt/trendingrepo/.env.production
RUN_LOG=/var/log/trendingrepo-x-autopilot.log # posting cron redirects here (Phase C)
OUTCOME_WINDOW_H=26
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
AUTH=$(grep -E '^TWITTER_AUTH_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
CT0=$(grep -E '^TWITTER_CT0=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
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
    alert "cookies missing in $ENV_FILE while mode=live - posts will silently no-op"
    fail=1
  else
    echo "$(ts) cookies: not provisioned yet (Phase C pending) - session check SKIP"
  fi
fi

# --- 2) outcome check (any post in the last ${OUTCOME_WINDOW_H}h) --------
if [ "$LIVE" = 1 ]; then
  last=$(grep -aE "posted|confirm|tweet" "$RUN_LOG" 2>/dev/null | tail -1 | awk '{print $1}')
  if [ -n "$last" ]; then
    last_s=$(date -u -d "$last" +%s 2>/dev/null || echo 0)
    age_h=$(( ( $(date -u +%s) - last_s ) / 3600 ))
    if [ "$last_s" = 0 ] || [ "$age_h" -gt "$OUTCOME_WINDOW_H" ]; then
      alert "no post landed in ${age_h}h (window ${OUTCOME_WINDOW_H}h) - check $RUN_LOG"
      fail=1
    else
      echo "$(ts) last post: ${age_h}h ago - OK"
    fi
  else
    alert "posting log missing/empty at $RUN_LOG - autopilot cron never ran?"
    fail=1
  fi
else
  echo "$(ts) outcome check: SKIP (mode=$MODE)"
fi

exit $fail
