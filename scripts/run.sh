#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "scripts/run.sh is now a compatibility wrapper."
echo "Use 'pnpm dev' for both services or './scripts/run-web.sh' for web only."
echo ""

exec "$SCRIPT_DIR/run-web.sh" "$@"
