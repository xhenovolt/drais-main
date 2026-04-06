#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  DRAIS Relay Manager — Ubuntu / Linux Installer
#  Run once after cloning the repo:
#      cd workers/relay-gui && bash install-linux.sh
# ══════════════════════════════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUI_SCRIPT="$SCRIPT_DIR/relay_gui.py"
DIST_DIR="$SCRIPT_DIR/../dist"
ICON_SRC="$SCRIPT_DIR/drais-relay.png"
ICON_DEST="$HOME/.local/share/icons/drais-relay.png"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║       DRAIS Relay Manager — Linux Installer          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Check Python 3 ─────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    echo "✗  Python 3 not found. Install with:"
    echo "   sudo apt install python3 python3-pip"
    exit 1
fi
PYTHON=$(command -v python3)
echo "✓  Python 3 found: $PYTHON ($(python3 --version))"

# ── 2. Install tkinter (needed by customtkinter) ──────────────────────────────
echo ""
echo "→  Ensuring python3-tk is installed..."
if ! python3 -c "import tkinter" 2>/dev/null; then
    sudo apt-get install -y python3-tk 2>/dev/null || {
        echo "⚠  Could not install python3-tk via apt."
        echo "   Run manually: sudo apt install python3-tk"
    }
fi
echo "✓  tkinter OK"

# ── 3. Install Python dependencies ────────────────────────────────────────────
echo ""
echo "→  Installing Python dependencies (customtkinter, Pillow)..."
# Ubuntu 24.04+ requires --break-system-packages; older versions don't need it
pip3 install --user --quiet customtkinter Pillow 2>/dev/null || \
pip3 install --user --break-system-packages customtkinter Pillow 2>/dev/null || \
pip3 install --break-system-packages customtkinter Pillow 2>/dev/null || true
echo "✓  Dependencies installed (or already present)"

# ── 4. Generate icon ──────────────────────────────────────────────────────────
echo ""
echo "→  Generating app icon..."
python3 "$SCRIPT_DIR/generate_icon.py"

# ── 5. Copy icon to ~/.local/share/icons ─────────────────────────────────────
mkdir -p "$HOME/.local/share/icons"
if [ -f "$ICON_SRC" ]; then
    cp "$ICON_SRC" "$ICON_DEST"
    echo "✓  Icon installed: $ICON_DEST"
fi

# ── 6. Make relay binary executable ──────────────────────────────────────────
BINARY=""
for f in "$DIST_DIR/drais-relay-linux-x64" "$DIST_DIR/drais-relay-linux" "$DIST_DIR/drais-relay-linux-arm64"; do
    if [ -f "$f" ]; then
        chmod +x "$f"
        BINARY="$f"
        echo "✓  Relay binary marked executable: $(basename $f)"
        break
    fi
done

if [ -z "$BINARY" ]; then
    echo "⚠  No relay binary found in dist/. Build it first with 'npm run build:linux'"
fi

# ── 7. Create app drawer desktop entry ───────────────────────────────────────
mkdir -p "$HOME/.local/share/applications"

cat > "$HOME/.local/share/applications/drais-relay.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=DRAIS Relay Manager
Comment=Manage DRAIS fingerprint relay agent for ZKTeco devices
Exec=python3 $GUI_SCRIPT
Icon=$ICON_DEST
Terminal=false
Categories=Utility;Network;
Keywords=drais;relay;fingerprint;zkteco;biometric;attendance;
StartupWMClass=relay_gui
StartupNotify=true
EOF

echo "✓  App drawer entry created: ~/.local/share/applications/drais-relay.desktop"

# ── 8. Create GNOME autostart entry (launch on login) ─────────────────────────
mkdir -p "$HOME/.config/autostart"

cat > "$HOME/.config/autostart/drais-relay.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=DRAIS Relay Manager
Comment=Auto-start DRAIS fingerprint relay on login
Exec=python3 $GUI_SCRIPT --autostart
Icon=$ICON_DEST
Terminal=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=5
EOF

echo "✓  Autostart on login configured: ~/.config/autostart/drais-relay.desktop"

# ── 9. Refresh app menu database ─────────────────────────────────────────────
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
gtk-update-icon-cache "$HOME/.local/share/icons" 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                   Install Complete!                  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  ▶  App Drawer:  Search 'DRAIS Relay' in your apps  ║"
echo "║  ▶  On Login:    Relay Manager starts automatically  ║"
echo "║  ▶  Toggle:      Check 'Auto-start relay on open'    ║"
echo "║                  to have the relay run immediately   ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Launch now:  python3 $GUI_SCRIPT"
echo ""
