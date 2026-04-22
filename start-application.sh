#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
WEB_DIR="$ROOT_DIR/apps/web"
API_DIR="$ROOT_DIR/apps/api"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }
step()  { echo -e "${BLUE}[→]${NC} $1"; }

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
if [ ! -d "$VENV_DIR" ]; then
    step "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
    info "Virtual environment created"
fi

# --- Step 2: Activate venv ---
step "Activating virtual environment..."
source "$VENV_DIR/bin/activate"
info "Virtual environment activated"

ensure_pnpm
echo ""

# --- Step 3: Verify dependencies ---
step "Checking dependencies..."

if [ ! -d "$ROOT_DIR/node_modules" ]; then
    step "Installing Node dependencies..."
    cd "$ROOT_DIR"
    pnpm install
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

# --- Step 4: Build ---
step "Building application..."
pnpm build
info "Build complete"
echo ""

# --- Step 5: Start services ---
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
pnpm --filter @repo/web start &
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
