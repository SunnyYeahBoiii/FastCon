#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo "  FastCons - Build + Start"
echo "========================================"
echo ""

# First-time check: if no .env.local, suggest first-run.sh
if [ ! -f "$SCRIPT_DIR/.env.local" ]; then
    echo "Project not yet set up. Run first-run.sh instead."
    exit 1
fi

bash "$SCRIPT_DIR/scripts/run.sh" --no-setup
