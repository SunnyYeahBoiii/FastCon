#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo "  FastCons - Runtime"
echo "========================================"
echo ""

if [ ! -f "$SCRIPT_DIR/apps/web/.env.local" ] || [ ! -f "$SCRIPT_DIR/apps/api/.env.local" ]; then
    echo "Project not yet set up. Run 'pnpm setup' first."
    exit 1
fi

echo "Workspace runtime commands:"
echo "  pnpm dev"
echo "  pnpm dev:web"
echo "  pnpm dev:api"
