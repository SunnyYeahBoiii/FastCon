#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Run setup ---
bash "$SCRIPT_DIR/scripts/setup.sh"

echo ""

# --- Build ---
echo "--- Building ---"
npm run build
info "Build complete"

echo ""

# --- Start ---
echo "--- Starting server ---"
bash "$SCRIPT_DIR/scripts/run.sh" --no-setup
