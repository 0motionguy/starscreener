#!/usr/bin/env bash
# One-command X cookie refresh for the trendingrepo 3x/day autopilot.
# Same UX as /opt/aiso/refresh-x-cookies.sh — different target env + keys
# (our runner sources TWITTER_AUTH_TOKEN / TWITTER_CT0 for the twitter CLI).
#
# Usage: trendingrepo-refresh-x-cookies.sh <auth_token> <ct0>
#   or:  sweet-cookie x.com --json | trendingrepo-refresh-x-cookies.sh --stdin
#
# Backs up /opt/trendingrepo/.env.production, locks perms to 600, and
# VERIFIES the session read-only before declaring success.
set -euo pipefail
ENV=/opt/trendingrepo/.env.production

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

cp "$ENV" "$ENV.bak-$(date +%Y%m%d%H%M%S)"
chmod 600 "$ENV".bak-* 2>/dev/null || true
upsert() { grep -q "^$1=" "$ENV" && sed -i "s|^$1=.*|$1=$2|" "$ENV" || echo "$1=$2" >>"$ENV"; }
upsert TWITTER_AUTH_TOKEN "$AUTH"
upsert TWITTER_CT0 "$CT0"
chmod 600 "$ENV"

export TWITTER_AUTH_TOKEN="$AUTH" TWITTER_CT0="$CT0"
if twitter-cli feed --json 2>/dev/null | grep -qE '"ok": ?true'; then
  echo "refresh: cookies updated + session VERIFIED"
else
  echo "refresh: cookies updated but session check FAILED (wrong values or already expired)"
  exit 1
fi
