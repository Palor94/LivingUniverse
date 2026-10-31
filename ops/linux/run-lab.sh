#!/bin/sh
set -eu
# No production mount, host port, credential, Docker socket or external network.
# Dependency installation occurs only during the explicit image-build step.
cd "$(dirname "$0")/../.."
docker build -f ops/linux/Dockerfile -t living-universe-linux-lab:checkpoint .
docker run --rm --network none --cpus=1 --memory=2g --pids-limit=128 \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=1g \
  living-universe-linux-lab:checkpoint
