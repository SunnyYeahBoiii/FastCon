#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
WEB_DIR="$ROOT_DIR/apps/web"
API_DIR="$ROOT_DIR/apps/api"
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
    error "Install Node.js >= $MIN_NODE_MAJOR and npm >= $MIN_NPM_MAJOR, then rerun start."
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

    error "python3 venv support is missing. Install python3-venv (or the equivalent package for your OS) and rerun start."
    exit 1
}

ensure_python_package() {
    local pkg="$1"
    if python3 -c "import $pkg" >/dev/null 2>&1; then
        return
    fi

    step "Installing missing Python dependencies..."
    python3 -m pip install --upgrade pip >/dev/null 2>&1
    python3 -m pip install -r "$API_DIR/requirements.txt"
    info "Python dependencies installed"
}

echo "========================================"
echo "  FastCons - Start Application"
echo "========================================"
echo ""

# --- Step 1: Ensure venv exists ---
ensure_node_and_npm
ensure_python_venv_support

if [ ! -d "$VENV_DIR" ]; then
    step "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
    info "Virtual environment created"
fi

# --- Step 2: Activate venv ---
step "Activating virtual environment..."
source "$VENV_DIR/bin/activate"
info "Virtual environment activated"
echo ""

# --- Step 3: Verify dependencies ---
step "Checking dependencies..."

if [ ! -d "$ROOT_DIR/node_modules" ]; then
    step "Installing Node dependencies..."
    cd "$ROOT_DIR"
    npm install
    info "Node dependencies installed"
fi

if [ ! -f "$WEB_DIR/.env.local" ] || [ ! -f "$API_DIR/.env.local" ]; then
    error "Environment files missing. Run setup first."
    exit 1
fi

# Check key Python packages
for pkg in fastapi uvicorn aiosqlite; do
    ensure_python_package "$pkg"
done

info "All dependencies verified"
echo ""

# --- Step 4: Generate Prisma client ---
step "Generating Prisma client..."
npm run prisma:generate
info "Prisma client generated"
echo ""

# --- Step 5: Build ---
step "Building application..."
npm run build
info "Build complete"
echo ""

# --- Step 6: Start services ---
echo "========================================"
echo "  Starting Services"
echo "========================================"
echo ""

# Start FastAPI in background
step "Starting FastAPI (port 8010)..."
set -a
[ -f "$API_DIR/.env.local" ] && source "$API_DIR/.env.local"
set +a
cd "$API_DIR"
python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8010 &
API_PID=$!
cd "$ROOT_DIR"
echo ""

# Wait for API to be ready
step "Waiting for API to be ready..."
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:8010/docs >/dev/null 2>&1; then
        info "FastAPI is ready (PID: $API_PID)"
        break
    fi
    if [ "$i" -eq 30 ]; then
        error "API failed to start within 30 seconds"
        kill "$API_PID" 2>/dev/null || true
        exit 1
    fi
    sleep 1
done
echo ""

# Start Next.js
step "Starting Next.js (port 3000)..."
npm --workspace @repo/web run start &
WEB_PID=$!
echo ""

info "Next.js is starting (PID: $WEB_PID)"
echo ""

echo "========================================"
echo "  Application Running"
echo "========================================"
echo ""
echo "  Web:  http://localhost:3000"
echo "  API:  http://127.0.0.1:8010"
echo "  Docs: http://127.0.0.1:8010/docs"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

# Cleanup on exit
cleanup() {
    echo ""
    step "Shutting down services..."
    kill "$WEB_PID" 2>/dev/null || true
    kill "$API_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
    info "All services stopped"
}

trap cleanup EXIT INT TERM

# Wait for both processes
wait
