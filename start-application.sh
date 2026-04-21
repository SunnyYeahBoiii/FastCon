#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo "  FastCons"
echo "========================================"
echo ""
echo "1) Setup (dependencies + database)"
echo "2) Build + Start"
echo "3) Full (Setup + Build + Start)"
echo ""
read -rp "Choose [1/2/3]: " CHOICE

case "$CHOICE" in
    1)
        bash "$SCRIPT_DIR/scripts/setup.sh"
        ;;
    2)
        bash "$SCRIPT_DIR/scripts/run.sh"
        ;;
    3)
        bash "$SCRIPT_DIR/scripts/setup.sh"
        echo ""
        bash "$SCRIPT_DIR/scripts/run.sh"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
