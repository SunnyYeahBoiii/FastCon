#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR"
pnpm install
pnpm setup

echo ""
echo "Setup complete. Start the workspace with:"
echo "  pnpm dev"
