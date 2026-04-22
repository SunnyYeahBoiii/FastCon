#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -f "$ROOT_DIR/apps/api/.env.local" ]; then
    echo "Missing apps/api/.env.local. Run pnpm setup first."
    exit 1
fi

cd "$ROOT_DIR"
exec pnpm dev:api "$@"
