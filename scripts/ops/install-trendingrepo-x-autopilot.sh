#!/usr/bin/env bash
set -euo pipefail

[ "$(id -u)" = "0" ] || { echo "run as root" >&2; exit 1; }

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
ENV_FILE=/opt/trendingrepo/.env.production
COMPOSE_FILE=/opt/trendingrepo/docker-compose.trendingrepo.yml
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 1; }
[ -f "$COMPOSE_FILE" ] || { echo "missing $COMPOSE_FILE" >&2; exit 1; }

install -d -m 0755 /opt/trendingrepo-cron/scripts
install -m 0755 "$ROOT/scripts/twitter-trending-run.mjs" /opt/trendingrepo-cron/scripts/twitter-trending-run.mjs
install -m 0755 "$ROOT/scripts/ops/trendingrepo-x-autopilot.sh" /usr/local/bin/trendingrepo-x-autopilot.sh
install -m 0755 "$ROOT/scripts/ops/trendingrepo-x-preflight.sh" /usr/local/bin/trendingrepo-x-preflight.sh
install -m 0755 "$ROOT/scripts/ops/trendingrepo-refresh-x-cookies.sh" /usr/local/bin/trendingrepo-refresh-x-cookies.sh
install -m 0644 "$ROOT/scripts/ops/trendingrepo-x-autopilot.cron" /etc/cron.d/trendingrepo-x-autopilot
install -m 0644 "$ROOT/scripts/ops/trendingrepo-x-preflight.cron" /etc/cron.d/trendingrepo-x-preflight

cp -p "$ENV_FILE" "$ENV_FILE.bak-x-autopilot-$(date -u +%Y%m%d%H%M%S)"
if grep -q '^TRENDING_POST_MAX_PER_DAY=' "$ENV_FILE"; then
  sed -i 's/^TRENDING_POST_MAX_PER_DAY=.*/TRENDING_POST_MAX_PER_DAY=7/' "$ENV_FILE"
else
  printf '\nTRENDING_POST_MAX_PER_DAY=7\n' >>"$ENV_FILE"
fi
chmod 0600 "$ENV_FILE"
docker compose -f "$COMPOSE_FILE" up -d --force-recreate trendingrepo

echo "installed TrendingRepo X autopilot (five UTC slots, cap 5; app recreated)"
echo "outbound mode unchanged; verify with trendingrepo-x-autopilot.sh --slot D --dry-run"
