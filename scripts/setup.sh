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
VENV_DIR="$ROOT_DIR/.venv"
FASTAPI_INTERNAL_URL="http://127.0.0.1:8010"
WORKER_POLL_MS="${WORKER_POLL_MS:-1000}"
WORKER_MAX_CONCURRENT="${WORKER_MAX_CONCURRENT:-3}"
JUDGE_TIMEOUT_SECONDS="${JUDGE_TIMEOUT_SECONDS:-120}"
MAX_UPLOAD_BYTES="${MAX_UPLOAD_BYTES:-10485760}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }
step()  { echo -e "${BLUE}[→]${NC} $1"; }

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        error "Missing required command: $1"
        exit 1
    fi
}

ensure_pnpm() {
    if command -v pnpm >/dev/null 2>&1; then
        info "pnpm: $(pnpm --version)"
        return
    fi

    if command -v corepack >/dev/null 2>&1; then
        step "Enabling pnpm via corepack..."
        corepack enable
        corepack prepare pnpm@10.33.0 --activate
    else
        step "Installing pnpm globally via npm..."
        npm install -g pnpm
    fi

    info "pnpm installed: $(pnpm --version)"
}

echo "========================================"
echo "  FastCons - Full Setup"
echo "========================================"
echo ""

# --- Step 1: Check prerequisites ---
step "Checking prerequisites..."
require_command node
require_command npm
require_command python3
info "node: $(node --version)"
info "python3: $(python3 --version)"
ensure_pnpm
echo ""

# --- Step 2: Create and activate Python venv ---
if [ -d "$VENV_DIR" ]; then
    info "Virtual environment already exists at $VENV_DIR"
else
    step "Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
    info "Virtual environment created at $VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
info "Activated virtual environment"
echo ""

# --- Step 3: Install Python dependencies ---
step "Installing Python dependencies..."
pip install --upgrade pip >/dev/null 2>&1
pip install -r "$API_DIR/requirements.txt"
info "Python dependencies installed"
echo ""

# --- Step 4: Install Node dependencies ---
step "Installing Node dependencies..."
cd "$ROOT_DIR"
pnpm install
info "Node dependencies installed"
echo ""

# --- Step 5: Create shared directories ---
step "Creating shared directories..."
mkdir -p "$STORAGE_DIR/submissions" "$STORAGE_DIR/testdata"
info "Shared directories created"
echo ""

# --- Step 6: Prompt for admin password ---
echo "========================================"
echo "  Admin User Setup"
echo "========================================"
read -rp "Enter admin password [admin123]: " ADMIN_PASSWORD
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
echo ""

# --- Step 7: Generate .env.local files ---
PYTHON_BIN="$VENV_DIR/bin/python3"

cat > "$WEB_ENV_FILE" <<EOF
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

cat > "$API_ENV_FILE" <<EOF
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

info "Wrote $WEB_ENV_FILE"
info "Wrote $API_ENV_FILE"
echo ""

# --- Step 8: Push database schema ---
step "Pushing database schema..."
pnpm db:push
info "Database schema pushed"
echo ""

# --- Step 9: Seed admin user + sample contests ---
step "Seeding database..."
SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" pnpm --filter @repo/web seed
info "Database seeded"
echo ""

echo "========================================"
echo "  Setup Complete"
echo "========================================"
echo ""
echo "Admin credentials:"
echo "  Username: admin"
echo "  Password: $ADMIN_PASSWORD"
echo ""
echo "Start the application with:"
echo "  bash start-application.sh"
echo ""
