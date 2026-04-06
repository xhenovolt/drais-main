#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  DRAIS Relay GUI — Build Script
#  Builds the Electron control panel as standalone .AppImage + .deb (Linux)
#  Run: bash workers/relay-app/build.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'
ok()  { echo -e "${GREEN}✓${NC} $*"; }
hdr() { echo -e "\n${BOLD}$*${NC}"; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  DRAIS Relay GUI — Build (Linux)                     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

cd "$SCRIPT_DIR"

# Verify relay binary exists
DIST_DIR="$(dirname "$SCRIPT_DIR")/dist"
if [[ ! -f "$DIST_DIR/drais-relay-linux-x64" ]]; then
  echo -e "${YELLOW}⚠${NC} Relay binary not found. Building it first..."
  cd "$(dirname "$SCRIPT_DIR")"
  npm run build:linux
  cd "$SCRIPT_DIR"
fi
ok "Relay binary found"

# Install Electron + electron-builder
hdr "Installing build dependencies..."
npm install
ok "Dependencies installed"

# Build
hdr "Building Electron app..."
npm run build:linux
ok "Build complete"

# Report output
hdr "Output:"
find "$(dirname "$SCRIPT_DIR")/dist-gui" -maxdepth 2 \( -name "*.AppImage" -o -name "*.deb" \) 2>/dev/null | while read f; do
  size=$(du -sh "$f" 2>/dev/null | cut -f1)
  ok "  [$size] $f"
done

echo ""
echo "Run installer:"
echo "  bash $SCRIPT_DIR/install-linux.sh"
echo ""
