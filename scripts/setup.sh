#!/bin/bash
set -e

echo "========================================"
echo "  FastCons - Setup Script"
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

# Detect package manager
detect_pkg_manager() {
    if command -v brew &> /dev/null; then
        echo "brew"
    elif command -v apt-get &> /dev/null; then
        echo "apt-get"
    elif command -v yum &> /dev/null; then
        echo "yum"
    elif command -v dnf &> /dev/null; then
        echo "dnf"
    elif command -v pacman &> /dev/null; then
        echo "pacman"
    else
        echo ""
    fi
}

PKG_MGR=$(detect_pkg_manager)

install_pkg() {
    local name="$1"
    if [ -n "$PKG_MGR" ]; then
        case "$PKG_MGR" in
            brew)    brew install "$name" ;;
            apt-get) sudo apt-get update && sudo apt-get install -y "$name" ;;
            yum)     sudo yum install -y "$name" ;;
            dnf)     sudo dnf install -y "$name" ;;
            pacman)  sudo pacman -S --noconfirm "$name" ;;
        esac
    else
        error "No package manager found. Install $name manually."
        exit 1
    fi
}

# --- Check / Install prerequisites ---
echo "--- Checking prerequisites ---"

# Node.js
if ! command -v node &> /dev/null; then
    warn "Node.js not found. Installing..."
    install_pkg "node"
fi
NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 20 ]; then
    warn "Node.js version $NODE_VER < 20. Upgrading..."
    if [ "$PKG_MGR" = "brew" ]; then
        brew upgrade node
    elif [ "$PKG_MGR" = "apt-get" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        error "Cannot auto-upgrade Node.js. Install Node.js >= 20 manually."
        exit 1
    fi
fi
info "Node.js $(node -v)"

# Python3
if ! command -v python3 &> /dev/null; then
    warn "Python3 not found. Installing..."
    install_pkg "python3"
fi
info "Python $(python3 --version 2>&1)"

# pip3
if ! command -v pip3 &> /dev/null; then
    warn "pip3 not found. Installing..."
    if [ "$PKG_MGR" = "brew" ]; then
        brew install python3
    elif [ "$PKG_MGR" = "apt-get" ]; then
        sudo apt-get install -y python3-pip
    else
        python3 -m ensurepip --upgrade 2>/dev/null || install_pkg "python3-pip"
    fi
fi
info "pip3 installed"

# npm
if ! command -v npm &> /dev/null; then
    warn "npm not found. Installing..."
    install_pkg "npm"
fi
info "npm $(npm -v)"

echo ""

# --- Install dependencies ---
echo "--- Installing npm dependencies ---"
npm install
info "Dependencies installed"

echo ""

# --- Install Python dependencies ---
echo "--- Installing Python dependencies ---"
pip3 install --user numpy pandas
info "Python dependencies installed"

echo ""

# --- Setup environment ---
echo "--- Setting up environment ---"
if [ ! -f .env.local ]; then
    if [ -f .env.example ]; then
        cp .env.example .env.local
        info "Created .env.local from .env.example"
    else
        cat > .env.local << 'EOF'
DATABASE_URL="file:./dev.db"
MAX_CONCURRENT_JUDGES=3
PYTHON_BIN="python3"
UPLOAD_DIR="./storage/submissions"
EOF
        info "Created .env.local with defaults"
    fi
else
    warn ".env.local already exists, skipping"
fi

echo ""

# --- Create directories ---
echo "--- Creating directories ---"
mkdir -p storage/submissions
info "Created storage/submissions"

echo ""

# --- Admin password ---
echo "--- Admin Account ---"
read -rp "Enter admin password [admin123]: " ADMIN_PASSWORD
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

# Write password to .env.local
ESCAPED_PASSWORD="${ADMIN_PASSWORD//\\/\\\\}"
ESCAPED_PASSWORD="${ESCAPED_PASSWORD//\//\\/}"
ESCAPED_PASSWORD="${ESCAPED_PASSWORD//&/\\&}"

if grep -q "^SEED_ADMIN_PASSWORD=" .env.local 2>/dev/null; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=\"${ESCAPED_PASSWORD}\"|" .env.local
    else
        sed -i "s|^SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=\"${ESCAPED_PASSWORD}\"|" .env.local
    fi
else
    echo "SEED_ADMIN_PASSWORD=\"${ADMIN_PASSWORD}\"" >> .env.local
fi
info "Admin password set"

echo ""

# --- Database ---
echo "--- Database ---"

npx prisma db push --accept-data-loss
info "Database schema pushed"

echo ""
echo "--- Creating admin user ---"
SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" npx tsx prisma/seed.ts --admin-only
info "Admin user created"

echo ""
echo "========================================"
echo "  Setup complete!"
echo "========================================"
echo ""
echo "Admin credentials:"
echo "  Username: admin"
echo "  Password: ${ADMIN_PASSWORD}"
echo ""
echo "Build and start:"
echo "  npm run build && npm run start"
echo ""
echo "Or one command:"
echo "  npm run deploy"
echo ""
echo "Then open http://localhost:3000"
echo ""
