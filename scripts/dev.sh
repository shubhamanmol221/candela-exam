#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

mkdir -p "$ROOT_DIR/logs"

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT INT TERM

"$ROOT_DIR/scripts/start-mongodb.sh" &
pids+=("$!")

sleep 2

"$ROOT_DIR/scripts/start-backend.sh" &
pids+=("$!")

sleep 2

"$ROOT_DIR/scripts/start-frontend.sh" &
pids+=("$!")

echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:8000/health"
echo "Admin:    http://localhost:5173/admin/login"
echo "Stop with Ctrl+C."

wait -n "${pids[@]}"
