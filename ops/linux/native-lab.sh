#!/bin/bash
set -euo pipefail
test "${LU_DISPOSABLE_LINUX_LAB:-}" = synthetic-only || { echo 'Explicit disposable lab acknowledgement required.' >&2; exit 1; }
test "$(uname -s)" = Linux
test "$(systemctl is-system-running || true)" != offline
uid=$(id -u)
gid=$(id -g)
labroot=$(sudo mktemp -d /opt/lu-native-XXXXXXXX)
case "$labroot" in /opt/lu-native-????????) ;; *) exit 1;; esac
unit=$(basename "$labroot")
container="$unit-source"
cleanup() {
  sudo systemctl stop "$unit.service" >/dev/null 2>&1 || true
  docker rm -f "$container" >/dev/null 2>&1 || true
  if mountpoint -q "$labroot/media"; then sudo umount "$labroot/media"; fi
  if mountpoint -q "$labroot/volume"; then sudo umount "$labroot/volume"; fi
  sudo systemctl clean --what=state "$unit.service" >/dev/null 2>&1 || true
  sudo rm -f -- "/run/systemd/system/$unit.service"
  sudo systemctl daemon-reload
  case "$labroot" in /opt/lu-native-????????) sudo rm -rf -- "$labroot";; *) return 1;; esac
}
trap cleanup EXIT
sudo mkdir "$labroot/source" "$labroot/runtime" "$labroot/state" "$labroot/media" "$labroot/volume" "$labroot/config"
sudo chown -R "$uid:$gid" "$labroot"
docker create --name "$container" living-universe-linux-lab:checkpoint >/dev/null
docker cp "$container:/opt/living-universe/." "$labroot/source/"
docker cp "$container:/usr/local/bin/node" "$labroot/runtime/node"
docker rm "$container" >/dev/null
sudo chown -R "$uid:$gid" "$labroot"
sudo mount -t tmpfs -o size=16M,nodev,nosuid tmpfs "$labroot/volume"
sudo chown "$uid:$gid" "$labroot/volume"
sudo mount --bind "$labroot/volume" "$labroot/media"
node="$labroot/runtime/node"
helper="$labroot/source/ops/linux/native-lab.mjs"
"$node" "$helper" seed "$labroot"
port=$("$node" "$helper" port "$labroot")
# Exercise the real service template, changing only this disposable instance's
# paths/user and shortening the restart delay. No unit is installed persistently.
sed -e "s|/var/lib/living-universe|$labroot/state|g" \
    -e "s|/srv/living-universe/media|$labroot/media|g" \
    -e "s|/opt/living-universe|$labroot/source|g" \
    -e "s|/etc/living-universe/mcp-config.json|$labroot/config/mcp-config.json|g" \
    -e "s|/usr/bin/node|$node|g" \
    -e "s|User=living-universe|User=$uid|" \
    -e "s|Group=living-universe|Group=$gid|" \
    -e "s|StateDirectory=living-universe|StateDirectory=$unit|" \
    -e "s|RuntimeDirectory=living-universe|RuntimeDirectory=$unit|" \
    -e 's|RestartSec=60|RestartSec=1|' \
    -e 's|TimeoutStopSec=240|TimeoutStopSec=10|' \
    "$labroot/source/ops/linux/living-universe.service" | \
  sed "/^Environment=LU_IMAGE_DECODER/a Environment=PORT=$port\nIPAddressDeny=any\nIPAddressAllow=localhost\nMemoryMax=2G\nCPUQuota=100%" | \
  sudo tee "/run/systemd/system/$unit.service" >/dev/null
sudo systemctl daemon-reload
sudo systemctl start "$unit.service"
"$node" "$helper" ready "$labroot"
"$node" "$helper" cross-device-crop "$labroot"
"$node" "$helper" case-sensitive "$labroot"
"$node" "$helper" marker-loss "$labroot"
sudo umount "$labroot/media"
# ProtectSystem/ReadWritePaths can retain a private bind mount. Remove only
# this fresh lab's media mount inside its own service namespace as well.
mount_pid=$(systemctl show "$unit.service" --property MainPID --value)
if test "$mount_pid" != 0; then
  for attempt in 1 2 3 4; do
    if ! sudo nsenter --target "$mount_pid" --mount -- test -f "$labroot/media/.living-universe-storage.json"; then break; fi
    sudo nsenter --target "$mount_pid" --mount -- umount "$labroot/media" || break
  done
fi
"$node" "$helper" mount-loss "$labroot"
sudo mount --bind "$labroot/volume" "$labroot/media"
sudo systemctl restart "$unit.service"
"$node" "$helper" ready "$labroot"
sudo systemctl stop "$unit.service"
"$node" "$helper" stopped-database "$labroot"
sudo systemctl start "$unit.service"
"$node" "$helper" ready "$labroot"
before=$(systemctl show "$unit.service" --property MainPID --value)
sudo systemctl kill --kill-who=main --signal=SIGKILL "$unit.service"
for attempt in $(seq 1 120); do
  after=$(systemctl show "$unit.service" --property MainPID --value)
  if test "$after" != 0 && test "$after" != "$before"; then break; fi
  sleep .25
done
test "$after" != 0 && test "$after" != "$before"
"$node" "$helper" ready "$labroot"
"$node" "$helper" crash-recovered "$labroot"
"$node" "$helper" backup-restore "$labroot"
"$node" "$helper" report "$labroot"
