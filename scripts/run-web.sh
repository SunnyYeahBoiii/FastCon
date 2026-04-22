#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -f "$ROOT_DIR/apps/web/.env.local" ]; then
    echo "Missing apps/web/.env.local. Run pnpm setup first."
    exit 1
fi

cd "$ROOT_DIR"
exec pnpm dev:web "$@"
