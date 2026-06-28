#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT_DIR
export PATH="$ROOT_DIR/.local-tools/node-v22.16.0-linux-x64/bin:$ROOT_DIR/.local-tools/mongodb-linux-x86_64-ubuntu2004-7.0.14/bin:$PATH"
export PYTHONPATH="$ROOT_DIR/.python-stdlib${PYTHONPATH:+:$PYTHONPATH}"
