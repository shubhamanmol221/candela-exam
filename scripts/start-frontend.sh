#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

cd "$ROOT_DIR"
exec npm run dev -- --host 0.0.0.0
