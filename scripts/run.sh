#!/bin/bash
set -e

echo "========================================"
echo "  FastCons - Run Script"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }

# --- Check if already set up ---
ALREADY_SETUP=false
if [ -f .env.local ] && [ -d node_modules ] && [ -f prisma/dev.db ]; then
    ALREADY_SETUP=true
    warn "Project already set up. Skipping setup."
fi

if [ "$ALREADY_SETUP" = false ]; then
    echo "--- Running setup ---"
    bash scripts/setup.sh
    info "Setup complete"
    echo ""
fi

# --- Port ---
read -rp "Enter port [3000]: " PORT
PORT="${PORT:-3000}"
info "Using port ${PORT}"

echo ""

# --- Build ---
echo "--- Building ---"
npm run build
info "Build complete"

echo ""

# --- Start ---
echo "--- Starting server ---"
PORT=${PORT} npm run start
