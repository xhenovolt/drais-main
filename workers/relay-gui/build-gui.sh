#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  DRAIS Relay Manager — Build Standalone GUI Binary (Linux / ARM64)
#  Run once on the target machine. Produces a single self-contained binary
#  that requires NO Python, Node.js, or any other runtime.
#
#  Output:  workers/relay-gui/dist-gui/drais-relay-manager
#  Size:    ~40–60 MB (Python runtime bundled)
# ══════════════════════════════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/dist-gui"
FINAL_BIN="$OUT_DIR/drais-relay-manager"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     DRAIS Relay Manager — Standalone Binary Build       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Check Python3 ─────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    echo "✗  Python 3 not found. Installing..."
    sudo apt-get install -y python3 python3-pip python3-tk 2>/dev/null || {
        echo "   Run: sudo apt install python3 python3-pip python3-tk"
        exit 1
    }
fi
PYTHON=$(command -v python3)
echo "✓  Python: $PYTHON ($(python3 --version 2>&1))"

# ── Ensure tkinter ────────────────────────────────────────────────────────────
if ! python3 -c "import tkinter" 2>/dev/null; then
    echo "→  Installing python3-tk..."
    sudo apt-get install -y python3-tk 2>/dev/null || true
fi

# ── Install build deps ────────────────────────────────────────────────────────
echo ""
echo "→  Installing build dependencies (PyInstaller, customtkinter, Pillow)..."
install_pkgs() {
    pip3 install --user --quiet "$@" 2>/dev/null \
    || pip3 install --user --break-system-packages --quiet "$@" 2>/dev/null \
    || pip3 install --break-system-packages --quiet "$@" 2>/dev/null \
    || true
}
install_pkgs pyinstaller customtkinter Pillow
echo "✓  Build dependencies ready"

# ── Ensure icon ────────────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/drais-relay.png" ]; then
    echo "→  Generating icon..."
    python3 "$SCRIPT_DIR/generate_icon.py"
fi

# ── Find pyinstaller ──────────────────────────────────────────────────────────
PYINST=""
for candidate in \
    "$HOME/.local/bin/pyinstaller" \
    "$(python3 -m site --user-base)/bin/pyinstaller" \
    "/usr/local/bin/pyinstaller" \
    "/usr/bin/pyinstaller"; do
    if [ -f "$candidate" ]; then
        PYINST="$candidate"
        break
    fi
done

if [ -z "$PYINST" ]; then
    # Try running as a module
    if python3 -m PyInstaller --version &>/dev/null 2>&1; then
        PYINST="python3 -m PyInstaller"
    else
        echo "✗  PyInstaller not found after install. Try: pip3 install pyinstaller"
        exit 1
    fi
fi
echo "✓  PyInstaller: $PYINST"

# ── Build ─────────────────────────────────────────────────────────────────────
echo ""
echo "→  Building standalone binary (this takes 30–90 seconds)..."
mkdir -p "$OUT_DIR"

cd "$SCRIPT_DIR"

$PYINST \
    --onefile \
    --windowed \
    --name drais-relay-manager \
    --distpath "$OUT_DIR" \
    --workpath "$SCRIPT_DIR/.pyinstaller-build" \
    --specpath "$SCRIPT_DIR/.pyinstaller-build" \
    --add-data "drais-relay.png:." \
    --hidden-import customtkinter \
    --hidden-import PIL \
    --hidden-import PIL.Image \
    --hidden-import PIL.ImageTk \
    --hidden-import PIL.ImageDraw \
    --hidden-import PIL.ImageFont \
    --hidden-import tkinter \
    --hidden-import tkinter.messagebox \
    --collect-all customtkinter \
    relay_gui.py \
    2>&1 | tail -20

# Clean up build artifacts
rm -rf "$SCRIPT_DIR/.pyinstaller-build" 2>/dev/null || true

# ── Verify ────────────────────────────────────────────────────────────────────
if [ -f "$FINAL_BIN" ]; then
    chmod +x "$FINAL_BIN"
    SIZE=$(du -sh "$FINAL_BIN" | cut -f1)
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║               ✓  Build Successful!                      ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    printf "║  Binary: %-47s ║\n" "dist-gui/drais-relay-manager"
    printf "║  Size:   %-47s ║\n" "$SIZE  (Python runtime bundled)"
    echo "║                                                          ║"
    echo "║  No Python needed to run this binary!                   ║"
    echo "║                                                          ║"
    echo "║  Next:  bash install-linux.sh                           ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
else
    echo ""
    echo "✗  Build failed — binary not found at: $FINAL_BIN"
    echo "   Check the PyInstaller output above for errors."
    exit 1
fi
