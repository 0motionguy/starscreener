#!/usr/bin/env bash
# Non-interactive X cookie refresh for the trendingrepo 5x/day autopilot
# (@trendingrepo). Sibling of `trending-twitter-login` (interactive paste) —
# same canonical store /opt/trendingrepo-twitter/.env (0600) — plus two
# guards the login helper lacks:
#   1) identity: the session must actually be @trendingrepo. A valid session
#      for a DIFFERENT account (e.g. the aiso relay's @ontapemarkets in
#      /opt/clawpulse/.env) is REFUSED and the cookie file removed.
#   2) auto-arm: on VERIFIED success, flips TWITTER_OUTBOUND_MODE=live in
#      /opt/trendingrepo/.env.production so the 04/08/12/17/21:47 UTC slots
#      and the 04:27 UTC preflight arm themselves. One paste completes Phase C.
#
# Usage: trendingrepo-refresh-x-cookies.sh <auth_token> <ct0>
#   or:  sweet-cookie x.com --json | trendingrepo-refresh-x-cookies.sh --stdin
set -euo pipefail
DIR=/opt/trendingrepo-twitter
ENV=$DIR/.env
APPENV=/opt/trendingrepo/.env.production
WANT=trendingrepo

if [ "${1:-}" = "--stdin" ]; then
  json="$(cat)"
  vals=$(printf '%s' "$json" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);const a=Array.isArray(j)?j:(j.cookies||[]);const f=n=>{const c=a.find(x=>x.name===n);return c?String(c.value):""};process.stdout.write([f("auth_token"),f("ct0")].join("\n"))})')
  AUTH=$(printf '%s\n' "$vals" | sed -n 1p)
  CT0=$(printf '%s\n' "$vals" | sed -n 2p)
else
  AUTH="${1:?usage: trendingrepo-refresh-x-cookies.sh <auth_token> <ct0>}"
  CT0="${2:?ct0 required}"
fi
[ -n "$AUTH" ] && [ -n "$CT0" ] || { echo "refresh: missing auth_token/ct0"; exit 1; }

mkdir -p "$DIR"
chmod 700 "$DIR"
if [ -f "$ENV" ]; then
  cp "$ENV" "$ENV.bak-$(date +%Y%m%d%H%M%S)"
  chmod 600 "$ENV".bak-* 2>/dev/null || true
fi
umask 077
printf 'TWITTER_AUTH_TOKEN=%s\nTWITTER_CT0=%s\n' "$AUTH" "$CT0" >"$ENV"
chmod 600 "$ENV"

export TWITTER_AUTH_TOKEN="$AUTH" TWITTER_CT0="$CT0"
STATUS=$(twitter --compact status 2>/dev/null || true)
if ! printf '%s\n' "$STATUS" | grep -qE '^ok: true'; then
  echo "refresh: cookies written but session check FAILED (wrong values or expired) — NOT armed"
  exit 1
fi
GOT=$(printf '%s\n' "$STATUS" | grep -E '^ *username:' | head -1 | awk '{print $2}' | tr -d "'\"" | tr '[:upper:]' '[:lower:]')
if [ "$GOT" != "$WANT" ]; then
  rm -f "$ENV"
  echo "refresh: session is @${GOT:-unknown}, expected @$WANT — REFUSED (cookie file removed, mode untouched)"
  exit 1
fi

# Auto-arm: flip the app env's outbound mode to live (sed only; no shell redirects).
if grep -q '^TWITTER_OUTBOUND_MODE=' "$APPENV"; then
  sed -i 's|^TWITTER_OUTBOUND_MODE=.*|TWITTER_OUTBOUND_MODE=live|' "$APPENV"
else
  sed -i '$ a TWITTER_OUTBOUND_MODE=live' "$APPENV"
fi
echo "refresh: @$WANT session VERIFIED — cookies stored ($ENV) + TWITTER_OUTBOUND_MODE=live armed (UTC slots 04/08/12/17/21:47, preflight 04:27)"
