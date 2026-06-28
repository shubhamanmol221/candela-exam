#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

cd "$ROOT_DIR/backend"
exec "$ROOT_DIR/backend/.venv/bin/python" -m uvicorn main:app --reload --port 8000
