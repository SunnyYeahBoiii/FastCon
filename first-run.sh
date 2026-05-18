#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
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
NODE_MAJOR=16
NODE_MIN_MINOR=14
NPM_MAJOR=8
PYTHON_MIN_MAJOR=3
PYTHON_MIN_MINOR=10

info() { echo "[OK] $1"; }
warn() { echo "[WARN] $1" >&2; }
error() { echo "[ERROR] $1" >&2; }
step() { echo "[STEP] $1"; }

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        error "Missing required command: $1"
        exit 1
    fi
}

run_as_root() {
    if command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    else
        "$@"
    fi
}

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

install_node_16() {
    if ! command -v apt-get >/dev/null 2>&1; then
        return 1
    fi

    step "Installing Node.js 16.x and npm 8.x with apt-get..."
    run_as_root apt-get update
    run_as_root apt-get install -y curl ca-certificates

    local setup_script
    setup_script="$(mktemp)"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o "$setup_script"
    run_as_root bash "$setup_script"
    rm -f "$setup_script"

    run_as_root apt-get install -y nodejs
    hash -r
}

ensure_node_and_npm() {
    if node_is_supported && npm_is_supported; then
        info "node: $(node --version)"
        info "npm: $(npm --version)"
        return
    fi

    if command -v node >/dev/null 2>&1; then
        warn "Current node: $(node --version)"
    fi
    if command -v npm >/dev/null 2>&1; then
        warn "Current npm: $(npm --version)"
    fi

    if install_node_16 && node_is_supported && npm_is_supported; then
        info "node: $(node --version)"
        info "npm: $(npm --version)"
        return
    fi

    error "FastCons requires Node.js >= 16.14.0 and < 17, with npm 8.x."
    error "Install Node.js 16.x (npm 8.x) or adjust PATH, then rerun ./first-run.sh."
    exit 1
}

python_meets_minimum() {
    "$1" - "$PYTHON_MIN_MAJOR" "$PYTHON_MIN_MINOR" <<'PY' >/dev/null 2>&1
import sys

required = (int(sys.argv[1]), int(sys.argv[2]))
raise SystemExit(0 if sys.version_info[:2] >= required else 1)
PY
}

python_version() {
    "$1" - <<'PY'
import sys

print(".".join(str(part) for part in sys.version_info[:3]))
PY
}

ensure_curl() {
    if command -v curl >/dev/null 2>&1; then
        info "curl: $(curl --version | head -n 1)"
        return
    fi

    if command -v apt-get >/dev/null 2>&1; then
        step "Installing curl..."
        run_as_root apt-get update
        run_as_root apt-get install -y curl ca-certificates
        return
    fi

    error "Missing required command: curl"
    exit 1
}

select_python_bin() {
    if [ -n "${PYTHON_BIN:-}" ]; then
        printf '%s\n' "$PYTHON_BIN"
        return
    fi

    local candidate
    for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
        if command -v "$candidate" >/dev/null 2>&1 && python_meets_minimum "$candidate"; then
            printf '%s\n' "$candidate"
            return
        fi
    done

    printf '%s\n' "python3"
}

ensure_python() {
    PYTHON_BIN="$(select_python_bin)"
    export PYTHON_BIN

    require_command "$PYTHON_BIN"

    if ! python_meets_minimum "$PYTHON_BIN"; then
        error "FastCons requires Python >= ${PYTHON_MIN_MAJOR}.${PYTHON_MIN_MINOR}."
        error "Ubuntu 18.04's default python3 is too old for the FastAPI code and current requirements."
        error "Install Python 3.10+ and rerun with PYTHON_BIN=/path/to/python3.10 ./first-run.sh."
        exit 1
    fi

    info "python: $("$PYTHON_BIN" --version 2>&1)"
}

ensure_python_venv_support() {
    if "$PYTHON_BIN" -m venv --help >/dev/null 2>&1; then
        return
    fi

    if command -v apt-get >/dev/null 2>&1; then
        local package_name
        package_name="$(basename "$PYTHON_BIN")-venv"
        step "Installing $package_name..."
        run_as_root apt-get update
        if run_as_root apt-get install -y "$package_name"; then
            return
        fi
        run_as_root apt-get install -y python3-venv
        return
    fi

    error "Python venv support is missing for $PYTHON_BIN."
    error "Install the matching venv package, then rerun ./first-run.sh."
    exit 1
}

verify_python_packages() {
    "$VENV_DIR/bin/python3" - <<'PY'
import aiosqlite
import fastapi
import multipart
import numpy
import pandas
import uvicorn
PY
}

write_env_files() {
    local admin_password="$1"
    local venv_python="$VENV_DIR/bin/python3"

    cat > "$WEB_ENV_FILE" <<EOF
DATABASE_URL="file:$DATABASE_PATH"
STORAGE_ROOT="$STORAGE_DIR"
FASTAPI_INTERNAL_URL="$FASTAPI_INTERNAL_URL"
JUDGE_SERVICE_URL="$FASTAPI_INTERNAL_URL"
PYTHON_BIN="$venv_python"
WORKER_POLL_MS="$WORKER_POLL_MS"
WORKER_MAX_CONCURRENT="$WORKER_MAX_CONCURRENT"
JUDGE_TIMEOUT_SECONDS="$JUDGE_TIMEOUT_SECONDS"
UPLOAD_DIR="$STORAGE_DIR/submissions"
MAX_CONCURRENT_JUDGES="$WORKER_MAX_CONCURRENT"
SEED_ADMIN_PASSWORD="$admin_password"
EOF

    cat > "$API_ENV_FILE" <<EOF
DATABASE_URL="file:$DATABASE_PATH"
STORAGE_ROOT="$STORAGE_DIR"
FASTAPI_INTERNAL_URL="$FASTAPI_INTERNAL_URL"
JUDGE_SERVICE_URL="$FASTAPI_INTERNAL_URL"
PYTHON_BIN="$venv_python"
WORKER_POLL_MS="$WORKER_POLL_MS"
WORKER_MAX_CONCURRENT="$WORKER_MAX_CONCURRENT"
JUDGE_TIMEOUT_SECONDS="$JUDGE_TIMEOUT_SECONDS"
UPLOAD_DIR="$STORAGE_DIR/submissions"
MAX_CONCURRENT_JUDGES="$WORKER_MAX_CONCURRENT"
SEED_ADMIN_PASSWORD="$admin_password"
EOF
}

read_admin_password() {
    if [ -n "${SEED_ADMIN_PASSWORD:-}" ]; then
        printf '%s\n' "$SEED_ADMIN_PASSWORD"
        return
    fi

    if [ -t 0 ]; then
        local password
        read -r -p "Enter admin password [admin123]: " password
        printf '%s\n' "${password:-admin123}"
        return
    fi

    warn "No interactive terminal detected; using default admin password."
    printf '%s\n' "admin123"
}

echo "========================================"
echo "  FastCons - First Run"
echo "========================================"
echo ""

step "Checking runtime prerequisites..."
ensure_node_and_npm
ensure_python
ensure_python_venv_support
ensure_curl
echo ""

step "Creating Python virtual environment..."
if [ -d "$VENV_DIR" ]; then
    if ! python_meets_minimum "$VENV_DIR/bin/python3"; then
        VENV_PYTHON_VERSION="unknown"
        if [ -x "$VENV_DIR/bin/python3" ]; then
            VENV_PYTHON_VERSION="$(python_version "$VENV_DIR/bin/python3")"
        fi
        error "Existing virtual environment uses Python $VENV_PYTHON_VERSION, which is too old."
        error "Remove $VENV_DIR or recreate it with Python >= ${PYTHON_MIN_MAJOR}.${PYTHON_MIN_MINOR}."
        exit 1
    fi
    info "Virtual environment already exists at $VENV_DIR"
else
    "$PYTHON_BIN" -m venv "$VENV_DIR"
    info "Virtual environment created at $VENV_DIR"
fi
echo ""

step "Installing Python dependencies..."
"$VENV_DIR/bin/python3" -m pip install --upgrade pip >/dev/null 2>&1
"$VENV_DIR/bin/python3" -m pip install -r "$API_DIR/requirements.txt"
verify_python_packages
info "Python dependencies installed"
echo ""

step "Installing Node dependencies..."
cd "$ROOT_DIR"
npm install
info "Node dependencies installed"
echo ""

step "Creating shared runtime directories..."
mkdir -p "$STORAGE_DIR/submissions" "$STORAGE_DIR/testdata"
info "Shared directories ready"
echo ""

echo "========================================"
echo "  Admin User Setup"
echo "========================================"
ADMIN_PASSWORD="$(read_admin_password)"
echo ""

step "Writing environment files..."
write_env_files "$ADMIN_PASSWORD"
info "Wrote $WEB_ENV_FILE"
info "Wrote $API_ENV_FILE"
echo ""

step "Generating Prisma client..."
npm run prisma:generate
info "Prisma client generated"
echo ""

step "Pushing database schema..."
npm run db:push
info "Database schema pushed"
echo ""

step "Seeding database..."
SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run seed
info "Database seeded"
echo ""

step "Building application..."
npm run build
info "Application built"
echo ""

echo "========================================"
echo "  First Run Complete"
echo "========================================"
echo ""
echo "Admin credentials:"
echo "  Username: admin"
echo "  Password: $ADMIN_PASSWORD"
echo ""
echo "Start the application with:"
echo "  ./start-application.sh"
echo ""
