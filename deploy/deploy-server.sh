#!/usr/bin/env bash
set -euo pipefail

PUMP_SOURCE_DIR=/opt/bitbt-pump-source/repo
PUMP_WEB_ROOT=/opt/bitbt-pump-web
PUMP_RELEASE_ROOT="$PUMP_WEB_ROOT/releases"
PUMP_KEEP_RELEASES="${PUMP_KEEP_RELEASES:-5}"

test "$(id -un)" = "ubuntu"
[[ "$PUMP_KEEP_RELEASES" =~ ^[1-9][0-9]*$ ]]
test -d "$PUMP_SOURCE_DIR/.git"
test -d "$PUMP_RELEASE_ROOT"
case "$PUMP_RELEASE_ROOT" in
  /opt/bitbt-pump-web/releases) ;;
  *) echo "Unexpected release root: $PUMP_RELEASE_ROOT" >&2; exit 1 ;;
esac

cd "$PUMP_SOURCE_DIR"
git fetch origin main
git switch main
git pull --ff-only origin main
PUMP_RELEASE_SHA="$(git rev-parse --short=7 HEAD)"
PUMP_RELEASE_DIR="$PUMP_RELEASE_ROOT/${PUMP_RELEASE_SHA}-server"
test ! -e "$PUMP_RELEASE_DIR"

npm ci
NEXT_PUBLIC_PUMP_SIWE_DOMAIN=bitbt.fun \
BITBT_PUMP_API_URL=https://appbackend.bitbt.com \
npm run build

mkdir -p "$PUMP_RELEASE_DIR/.next"
cp -a .next/standalone/. "$PUMP_RELEASE_DIR/"
cp -a .next/static "$PUMP_RELEASE_DIR/.next/static"
cp -a public "$PUMP_RELEASE_DIR/public"
test -f "$PUMP_RELEASE_DIR/server.js"
test -f "$PUMP_RELEASE_DIR/public/launchpad/launchpad-live.js"

sudo install -m 0644 deploy/bitbt-pump-web.service /etc/systemd/system/bitbt-pump-web.service
sudo install -m 0644 deploy/bitbt.fun.nginx.conf /etc/nginx/sites-available/bitbt.fun
sudo ln -sfn /etc/nginx/sites-available/bitbt.fun /etc/nginx/sites-enabled/bitbt.fun
sudo systemctl daemon-reload
sudo nginx -t

ln -s "$PUMP_RELEASE_DIR" "$PUMP_WEB_ROOT/current.next"
mv -Tf "$PUMP_WEB_ROOT/current.next" "$PUMP_WEB_ROOT/current"
sudo systemctl restart bitbt-pump-web
sudo systemctl reload nginx
sleep 3
systemctl is-active --quiet bitbt-pump-web
curl -fsS http://127.0.0.1:3003/en/pump >/dev/null
curl -fsS https://bitbt.fun/api/pump/v1/pump/tokens >/dev/null

mapfile -t PUMP_OLD_RELEASES < <(
  find "$PUMP_RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -nr \
    | awk -v keep="$PUMP_KEEP_RELEASES" 'NR > keep { sub(/^[^ ]+ /, ""); print }'
)
PUMP_CURRENT_RELEASE="$(readlink -f "$PUMP_WEB_ROOT/current")"
for PUMP_OLD_RELEASE in "${PUMP_OLD_RELEASES[@]}"; do
  PUMP_RESOLVED_RELEASE="$(realpath "$PUMP_OLD_RELEASE")"
  case "$PUMP_RESOLVED_RELEASE" in
    "$PUMP_RELEASE_ROOT"/*)
      if [[ "$PUMP_RESOLVED_RELEASE" != "$PUMP_CURRENT_RELEASE" ]]; then
        sudo rm -rf -- "$PUMP_RESOLVED_RELEASE"
      fi
      ;;
    *) echo "Refusing to remove unexpected path: $PUMP_RESOLVED_RELEASE" >&2; exit 1 ;;
  esac
done

echo "Deployed Pump release $PUMP_RELEASE_SHA; retained newest $PUMP_KEEP_RELEASES releases."
