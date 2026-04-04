#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Drais SDK — Linux installer
#  Installs the binary, launch script, icon, and .desktop file so the app
#  appears in the Ubuntu GNOME application drawer.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BINARY_NAME="drais-sdk"
BINARY_SRC="$(dirname "$0")/dist/drais-sdk-linux-amd64"
ICON_SRC="$(dirname "$0")/assets/drais-sdk.svg"

BIN_DIR="$HOME/.local/bin"
ICON_DIR="$HOME/.local/share/icons/hicolor/scalable/apps"
DESKTOP_DIR="$HOME/.local/share/applications"
LAUNCHER="$BIN_DIR/drais-sdk-launch"

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}  ✓${RESET}  $*"; }
info() { echo -e "${CYAN}  →${RESET}  $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET}  $*"; }

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║        Drais SDK  —  Installer       ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────
if [[ ! -f "$BINARY_SRC" ]]; then
    echo "  ERROR: Binary not found at $BINARY_SRC"
    echo "         Run  make linux  first."
    exit 1
fi

# ── Create directories ────────────────────────────────────────────────────────
mkdir -p "$BIN_DIR" "$ICON_DIR" "$DESKTOP_DIR"

# ── Install binary ────────────────────────────────────────────────────────────
info "Installing binary → $BIN_DIR/$BINARY_NAME"
cp "$BINARY_SRC" "$BIN_DIR/$BINARY_NAME"
chmod +x "$BIN_DIR/$BINARY_NAME"
ok "Binary installed"

# ── Install icon ──────────────────────────────────────────────────────────────
if [[ -f "$ICON_SRC" ]]; then
    info "Installing icon → $ICON_DIR/$BINARY_NAME.svg"
    cp "$ICON_SRC" "$ICON_DIR/$BINARY_NAME.svg"
    ok "Icon installed"
else
    warn "Icon not found at $ICON_SRC — continuing without icon"
fi

# ── Create launcher wrapper script ────────────────────────────────────────────
info "Creating launcher script → $LAUNCHER"
cat > "$LAUNCHER" << 'SCRIPT'
#!/usr/bin/env bash
# Drais SDK launcher — starts the SDK daemon if not running, then opens dashboard

BINARY="$HOME/.local/bin/drais-sdk"
PORT=7430
DASHBOARD="http://127.0.0.1:$PORT"

# Check if already running
if ! pgrep -x "drais-sdk" > /dev/null 2>&1; then
    # Start the SDK in background, detached from terminal
    nohup "$BINARY" >> "$HOME/.drais-sdk/sdk.log" 2>&1 &
    # Wait for the HTTP server to be ready (up to 5 s)
    for i in $(seq 1 10); do
        sleep 0.5
        if curl -sf "$DASHBOARD/api/status" > /dev/null 2>&1; then
            break
        fi
    done
fi

# Open dashboard in default browser
xdg-open "$DASHBOARD" 2>/dev/null || \
    sensible-browser "$DASHBOARD" 2>/dev/null || \
    notify-send "Drais SDK" "Dashboard running at $DASHBOARD"
SCRIPT
chmod +x "$LAUNCHER"
ok "Launcher script created"

# ── Create .desktop file ──────────────────────────────────────────────────────
info "Creating .desktop entry → $DESKTOP_DIR/drais-sdk.desktop"
cat > "$DESKTOP_DIR/drais-sdk.desktop" << DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=Drais SDK
GenericName=ZKTeco Device Bridge
Comment=Drais Cloud to ZKTeco biometric device bridge — opens the local dashboard
Exec=$LAUNCHER
Icon=drais-sdk
Terminal=false
Categories=Network;System;Science;
Keywords=drais;zkteco;attendance;biometric;fingerprint;school;
StartupNotify=true
StartupWMClass=drais-sdk
DESKTOP
chmod +x "$DESKTOP_DIR/drais-sdk.desktop"
ok ".desktop entry created"

# ── Refresh desktop database & icon cache ────────────────────────────────────
info "Refreshing desktop database…"
if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null && ok "Desktop database updated"
else
    warn "update-desktop-database not found — skipping"
fi

info "Refreshing icon cache…"
if command -v gtk-update-icon-cache &>/dev/null; then
    gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null && ok "Icon cache updated"
elif command -v gtk4-update-icon-cache &>/dev/null; then
    gtk4-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null && ok "Icon cache updated (gtk4)"
else
    warn "gtk-update-icon-cache not found — icon may not show immediately"
fi

# ── Ensure ~/.local/bin is on PATH hint ──────────────────────────────────────
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    warn "$BIN_DIR is not in your PATH."
    warn "Add the following to your ~/.bashrc or ~/.zshrc:"
    warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

echo ""
echo -e "  ${GREEN}Installation complete!${RESET}"
echo ""
echo "  Launch options:"
echo "    • App drawer  — search for 'Drais SDK'"
echo "    • Terminal    — drais-sdk -device-ip 192.168.1.197 -token <TOKEN>"
echo "    • Dashboard   — http://127.0.0.1:7430"
echo ""
