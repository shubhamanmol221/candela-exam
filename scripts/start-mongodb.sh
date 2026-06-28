#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

mkdir -p "$ROOT_DIR/data/mongodb" "$ROOT_DIR/logs"

exec mongod \
  --dbpath "$ROOT_DIR/data/mongodb" \
  --bind_ip 127.0.0.1 \
  --port 27017 \
  --logpath "$ROOT_DIR/logs/mongodb.log" \
  --logappend
