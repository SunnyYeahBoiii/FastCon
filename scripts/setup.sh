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
MIN_NODE_MAJOR=20
MIN_NPM_MAJOR=10
TARGET_NODE_MAJOR=22

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

major_version() {
    local raw="$1"
    raw="${raw#v}"
    echo "${raw%%.*}"
}

has_supported_node_and_npm() {
    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        return 1
    fi

    local node_major npm_major
    node_major="$(major_version "$(node --version)")"
    npm_major="$(major_version "$(npm --version)")"

    [ "$node_major" -ge "$MIN_NODE_MAJOR" ] && [ "$npm_major" -ge "$MIN_NPM_MAJOR" ]
}

install_supported_node_and_npm() {
    if ! command -v apt-get >/dev/null 2>&1; then
        return 1
    fi

    step "Installing a compatible Node.js runtime (Node.js $TARGET_NODE_MAJOR + npm)..."
    if command -v sudo >/dev/null 2>&1; then
        sudo apt-get update
        sudo apt-get install -y curl ca-certificates
        curl -fsSL "https://deb.nodesource.com/setup_${TARGET_NODE_MAJOR}.x" | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        apt-get update
        apt-get install -y curl ca-certificates
        curl -fsSL "https://deb.nodesource.com/setup_${TARGET_NODE_MAJOR}.x" | bash -
        apt-get install -y nodejs
    fi
}

ensure_node_and_npm() {
    if has_supported_node_and_npm; then
        info "node: $(node --version)"
        info "npm: $(npm --version)"
        return
    fi

    if command -v node >/dev/null 2>&1 || command -v npm >/dev/null 2>&1; then
        warn "Detected unsupported Node.js/npm versions."
        warn "FastCons requires Node.js >= $MIN_NODE_MAJOR and npm >= $MIN_NPM_MAJOR for the current Next.js, Prisma, and npm workspace toolchain."
        if command -v node >/dev/null 2>&1; then
            warn "Current node: $(node --version)"
        fi
        if command -v npm >/dev/null 2>&1; then
            warn "Current npm: $(npm --version)"
        fi
    fi

    if install_supported_node_and_npm && has_supported_node_and_npm; then
        info "node: $(node --version)"
        info "npm: $(npm --version)"
        return
    fi

    error "A compatible Node.js/npm installation is required."
    error "Install Node.js >= $MIN_NODE_MAJOR and npm >= $MIN_NPM_MAJOR, then rerun setup."
    exit 1
}

ensure_python_venv_support() {
    if python3 -m venv --help >/dev/null 2>&1; then
        return
    fi

    if command -v apt-get >/dev/null 2>&1; then
        step "Installing python3-venv..."
        if command -v sudo >/dev/null 2>&1; then
            sudo apt-get update
            sudo apt-get install -y python3-venv
        else
            apt-get update
            apt-get install -y python3-venv
        fi
        return
    fi

    error "python3 venv support is missing. Install python3-venv (or the equivalent package for your OS) and rerun setup."
    exit 1
}

echo "========================================"
echo "  FastCons - Full Setup"
echo "========================================"
echo ""

# --- Step 1: Check prerequisites ---
step "Checking prerequisites..."
require_command python3
info "python3: $(python3 --version)"
ensure_node_and_npm
ensure_python_venv_support
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
npm install
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

# --- Step 8: Generate Prisma client ---
step "Generating Prisma client..."
npm run prisma:generate
info "Prisma client generated"
echo ""

# --- Step 9: Push database schema ---
step "Pushing database schema..."
npm run db:push
info "Database schema pushed"
echo ""

# --- Step 10: Seed admin user + sample contests ---
step "Seeding database..."
SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run seed
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
