#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
API_DIR="$ROOT_DIR/apps/api"
STORAGE_DIR="$ROOT_DIR/storage"
DATABASE_PATH="$ROOT_DIR/dev.db"
WEB_ENV_FILE="$WEB_DIR/.env.local"
API_ENV_FILE="$API_DIR/.env.local"
FASTAPI_INTERNAL_URL="http://127.0.0.1:8010"
PYTHON_BIN_DEFAULT="$(command -v python3 || true)"
PYTHON_BIN="${PYTHON_BIN_DEFAULT:-python3}"
WORKER_POLL_MS="${WORKER_POLL_MS:-1000}"
WORKER_MAX_CONCURRENT="${WORKER_MAX_CONCURRENT:-3}"
JUDGE_TIMEOUT_SECONDS="${JUDGE_TIMEOUT_SECONDS:-120}"
MAX_UPLOAD_BYTES="${MAX_UPLOAD_BYTES:-10485760}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }

require_command() {
    local name="$1"
    if ! command -v "$name" >/dev/null 2>&1; then
        error "Missing required command: $name"
        exit 1
    fi
}

write_env_file() {
    local target="$1"
    cat > "$target" <<EOF
DATABASE_URL="file:$DATABASE_PATH"
STORAGE_ROOT="$STORAGE_DIR"
FASTAPI_INTERNAL_URL="$FASTAPI_INTERNAL_URL"
PYTHON_BIN="$PYTHON_BIN"
WORKER_POLL_MS="$WORKER_POLL_MS"
WORKER_MAX_CONCURRENT="$WORKER_MAX_CONCURRENT"
JUDGE_TIMEOUT_SECONDS="$JUDGE_TIMEOUT_SECONDS"
MAX_UPLOAD_BYTES="$MAX_UPLOAD_BYTES"
UPLOAD_DIR="$STORAGE_DIR/submissions"
MAX_CONCURRENT_JUDGES="$WORKER_MAX_CONCURRENT"
SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD"
EOF
}

echo "========================================"
echo "  FastCons - Workspace Setup"
echo "========================================"
echo ""

require_command node
require_command pnpm
require_command python3

if [ ! -d "$WEB_DIR" ] || [ ! -d "$API_DIR" ]; then
    error "Expected apps/web and apps/api to exist. Did the workspace move complete?"
    exit 1
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
    warn "Root dependencies are not installed yet."
    warn "Run 'pnpm install' first, then rerun 'pnpm setup'."
    exit 1
fi

mkdir -p "$STORAGE_DIR/submissions" "$STORAGE_DIR/testdata"
info "Ensured shared storage directories exist"

read -rp "Enter admin password [admin123]: " ADMIN_PASSWORD
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

write_env_file "$WEB_ENV_FILE"
write_env_file "$API_ENV_FILE"
info "Wrote $WEB_ENV_FILE"
info "Wrote $API_ENV_FILE"

pnpm --filter @repo/api setup:python
info "Installed Python dependencies"

pnpm --filter @repo/web db:push
info "Database schema pushed"

SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" pnpm --filter @repo/web seed -- --admin-only
info "Admin user created or updated"

echo ""
echo "========================================"
echo "  Setup complete"
echo "========================================"
echo ""
echo "Admin credentials:"
echo "  Username: admin"
echo "  Password: $ADMIN_PASSWORD"
echo ""
echo "Runtime commands:"
echo "  pnpm dev"
echo "  pnpm dev:web"
echo "  pnpm dev:api"
