#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
VENV_DIR="$ROOT_DIR/.venv"
WEB_DIR="$ROOT_DIR/apps/web"
API_DIR="$ROOT_DIR/apps/api"
NODE_MAJOR=16
NODE_MIN_MINOR=14
NPM_MAJOR=8
PYTHON_MIN_MAJOR=3
PYTHON_MIN_MINOR=10
API_PID=""
WEB_PID=""

info() { echo "[OK] $1"; }
warn() { echo "[WARN] $1" >&2; }
error() { echo "[ERROR] $1" >&2; }
step() { echo "[STEP] $1"; }

parse_semver() {
    local raw="$1"
    local major minor patch
    raw="${raw#v}"
    raw="${raw%%-*}"
    IFS=. read -r major minor patch _ <<< "$raw"
    printf '%s %s %s\n' "${major:-0}" "${minor:-0}" "${patch:-0}"
}

node_is_supported() {
    command -v node >/dev/null 2>&1 || return 1

    local major minor patch
    read -r major minor patch <<< "$(parse_semver "$(node --version)")"
    [ "$major" -eq "$NODE_MAJOR" ] && [ "$minor" -ge "$NODE_MIN_MINOR" ]
}

npm_is_supported() {
    command -v npm >/dev/null 2>&1 || return 1

    local major minor patch
    read -r major minor patch <<< "$(parse_semver "$(npm --version)")"
    [ "$major" -eq "$NPM_MAJOR" ]
}

python_meets_minimum() {
    "$1" - "$PYTHON_MIN_MAJOR" "$PYTHON_MIN_MINOR" <<'PY' >/dev/null 2>&1
import sys

required = (int(sys.argv[1]), int(sys.argv[2]))
raise SystemExit(0 if sys.version_info[:2] >= required else 1)
PY
}

require_file() {
    if [ ! -f "$1" ]; then
        error "$2"
        error "Run ./first-run.sh before starting the application."
        exit 1
    fi
}

require_dir() {
    if [ ! -d "$1" ]; then
        error "$2"
        error "Run ./first-run.sh before starting the application."
        exit 1
    fi
}

require_executable() {
    if [ ! -x "$1" ]; then
        error "$2"
        error "Run ./first-run.sh before starting the application."
        exit 1
    fi
}

cleanup() {
    local exit_code=$?
    trap - EXIT INT TERM

    if [ -n "${WEB_PID:-}" ] || [ -n "${API_PID:-}" ]; then
        echo ""
        step "Shutting down services..."
    fi

    if [ -n "${WEB_PID:-}" ]; then
        kill "$WEB_PID" 2>/dev/null || true
    fi
    if [ -n "${API_PID:-}" ]; then
        kill "$API_PID" 2>/dev/null || true
    fi
    if [ -n "${WEB_PID:-}" ]; then
        wait "$WEB_PID" 2>/dev/null || true
    fi
    if [ -n "${API_PID:-}" ]; then
        wait "$API_PID" 2>/dev/null || true
    fi

    if [ -n "${WEB_PID:-}" ] || [ -n "${API_PID:-}" ]; then
        info "All services stopped"
    fi

    exit "$exit_code"
}

wait_for_http() {
    local name="$1"
    local url="$2"
    local pid="$3"
    local attempts="${4:-30}"
    local i

    step "Waiting for $name to be ready..."
    for i in $(seq 1 "$attempts"); do
        if curl -s "$url" >/dev/null 2>&1; then
            info "$name is ready (PID: $pid)"
            return
        fi
        if ! kill -0 "$pid" 2>/dev/null; then
            error "$name exited before becoming ready."
            wait "$pid" 2>/dev/null || true
            exit 1
        fi
        sleep 1
    done

    error "$name failed to start within ${attempts} seconds."
    exit 1
}

wait_for_services() {
    while true; do
        if ! kill -0 "$API_PID" 2>/dev/null; then
            wait "$API_PID"
            exit $?
        fi

        if ! kill -0 "$WEB_PID" 2>/dev/null; then
            wait "$WEB_PID"
            exit $?
        fi

        sleep 1
    done
}

trap cleanup EXIT INT TERM

echo "========================================"
echo "  FastCons - Start Application"
echo "========================================"
echo ""

step "Checking runtime..."
if ! command -v curl >/dev/null 2>&1; then
    error "Missing required command: curl"
    error "Run ./first-run.sh to install prerequisites."
    exit 1
fi

if ! node_is_supported; then
    if command -v node >/dev/null 2>&1; then
        error "Unsupported node: $(node --version)"
    else
        error "Node.js is not installed."
    fi
    error "FastCons requires Node.js >= 16.14.0 and < 17."
    error "Run ./first-run.sh after installing the supported runtime."
    exit 1
fi

if ! npm_is_supported; then
    if command -v npm >/dev/null 2>&1; then
        error "Unsupported npm: $(npm --version)"
    else
        error "npm is not installed."
    fi
    error "FastCons expects npm 8.x for the Node 16 workspace lockfile."
    error "Run ./first-run.sh after installing the supported runtime."
    exit 1
fi

info "node: $(node --version)"
info "npm: $(npm --version)"
echo ""

step "Checking first-run artifacts..."
require_dir "$ROOT_DIR/node_modules" "Node dependencies are missing."
require_executable "$VENV_DIR/bin/python3" "Python virtual environment is missing."
require_file "$WEB_DIR/.env.local" "Web environment file is missing."
require_file "$API_DIR/.env.local" "API environment file is missing."
require_executable "$ROOT_DIR/node_modules/.bin/prisma" "Prisma executable is missing."
require_executable "$ROOT_DIR/node_modules/.bin/next" "Next.js executable is missing."
require_file "$WEB_DIR/.next/BUILD_ID" "Next.js production build is missing."
if ! python_meets_minimum "$VENV_DIR/bin/python3"; then
    error "Python virtual environment must use Python >= ${PYTHON_MIN_MAJOR}.${PYTHON_MIN_MINOR}."
    error "Run ./first-run.sh with a supported PYTHON_BIN to recreate setup artifacts."
    exit 1
fi
info "Required artifacts found"
echo ""

step "Generating Prisma client..."
cd "$ROOT_DIR"
npm run prisma:generate
require_file "$ROOT_DIR/node_modules/.prisma/client/index.js" "Prisma client generation failed."
info "Prisma client generated"
echo ""

step "Syncing database schema..."
cd "$ROOT_DIR"
npm run db:push
info "Database schema synced"
echo ""

step "Activating Python virtual environment..."
source "$VENV_DIR/bin/activate"
info "python: $(python --version 2>&1)"
echo ""

echo "========================================"
echo "  Starting Services"
echo "========================================"
echo ""

step "Starting FastAPI (port 8010)..."
set -a
source "$API_DIR/.env.local"
set +a
cd "$API_DIR"
"${PYTHON_BIN:-$VENV_DIR/bin/python3}" -m uvicorn backend.main:app --host "${API_HOST:-0.0.0.0}" --port 8010 &
API_PID=$!
cd "$ROOT_DIR"
wait_for_http "FastAPI" "http://127.0.0.1:8010/docs" "$API_PID" 30
echo ""

step "Starting Next.js (port 3000)..."
set -a
source "$WEB_DIR/.env.local"
set +a
cd "$WEB_DIR"
"$ROOT_DIR/node_modules/.bin/next" start --port 3000 &
WEB_PID=$!
cd "$ROOT_DIR"
wait_for_http "Next.js" "http://127.0.0.1:3000" "$WEB_PID" 30
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

wait_for_services
