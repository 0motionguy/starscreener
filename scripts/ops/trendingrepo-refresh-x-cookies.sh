#!/usr/bin/env bash
# Verify and rotate the @trendingrepo X session without exposing cookies in
# command arguments or replacing a known-good session with an invalid one.
#
# Usage: sweet-cookie x.com --json | trendingrepo-refresh-x-cookies.sh --stdin
set -euo pipefail

DIR=/opt/trendingrepo-twitter
ENV=$DIR/.env
APPENV=/opt/trendingrepo/.env.production
COMPOSE_FILE=/opt/trendingrepo/docker-compose.trendingrepo.yml
WANT=trendingrepo

[ "${1:-}" = "--stdin" ] || { echo "usage: pipe sweet-cookie JSON to trendingrepo-refresh-x-cookies.sh --stdin" >&2; exit 2; }
[ "$#" = 1 ] || { echo "refresh: unexpected arguments" >&2; exit 2; }
[ -f "$APPENV" ] || { echo "refresh: missing $APPENV" >&2; exit 1; }
[ -f "$COMPOSE_FILE" ] || { echo "refresh: missing $COMPOSE_FILE" >&2; exit 1; }

vals=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);const a=Array.isArray(j)?j:(j.cookies||[]);const f=n=>{const c=a.find(x=>x.name===n);return c?String(c.value):""};process.stdout.write([f("auth_token"),f("ct0")].join("\n"))})')
AUTH=$(printf '%s\n' "$vals" | sed -n 1p)
CT0=$(printf '%s\n' "$vals" | sed -n 2p)
[ -n "$AUTH" ] && [ -n "$CT0" ] || { echo "refresh: missing auth_token/ct0"; exit 1; }

mkdir -p "$DIR"
chmod 700 "$DIR"
umask 077
TMP=$(mktemp "$DIR/.env.new.XXXXXX")
trap 'rm -f "$TMP"' EXIT
printf 'TWITTER_AUTH_TOKEN=%s\nTWITTER_CT0=%s\n' "$AUTH" "$CT0" >"$TMP"

export TWITTER_AUTH_TOKEN="$AUTH" TWITTER_CT0="$CT0"
STATUS=$(twitter --compact status 2>/dev/null || true)
if ! printf '%s\n' "$STATUS" | grep -qE '^ok: true'; then
  echo "refresh: candidate session check FAILED; existing cookies unchanged"
  exit 1
fi
GOT=$(printf '%s\n' "$STATUS" | grep -E '^ *username:' | head -1 | awk '{print $2}' | tr -d "'\"" | tr '[:upper:]' '[:lower:]')
if [ "$GOT" != "$WANT" ]; then
  echo "refresh: session is @${GOT:-unknown}, expected @$WANT - REFUSED (existing cookies unchanged)"
  exit 1
fi

if [ -f "$ENV" ]; then
  cp "$ENV" "$ENV.bak-$(date +%Y%m%d%H%M%S)"
  chmod 600 "$ENV".bak-* 2>/dev/null || true
fi
mv -f "$TMP" "$ENV"
chmod 600 "$ENV"
trap - EXIT

# Auto-arm and recreate the app so it reads the updated mode.
if grep -q '^TWITTER_OUTBOUND_MODE=' "$APPENV"; then
  sed -i 's|^TWITTER_OUTBOUND_MODE=.*|TWITTER_OUTBOUND_MODE=live|' "$APPENV"
else
  sed -i '$ a TWITTER_OUTBOUND_MODE=live' "$APPENV"
fi
docker compose -f "$COMPOSE_FILE" up -d --force-recreate trendingrepo
echo "refresh: @$WANT session VERIFIED - cookies stored ($ENV) + TWITTER_OUTBOUND_MODE=live armed (UTC slots 04/08/12/17/21:47, preflight 04:27; app recreated)"
