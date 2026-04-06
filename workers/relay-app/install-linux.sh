#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  DRAIS Relay — Linux Installer
#  Installs the relay binary as a user systemd service (auto-start on boot)
#  AND sets up the GUI app in the application drawer.
#
#  Usage:
#    cd workers
#    bash relay-app/install-linux.sh
#
#  What this script does:
#   1. Copies the relay binary to ~/.local/bin/drais-relay
#   2. Creates a user systemd service (no sudo needed)
#   3. Enables autostart on login / boot with loginctl enable-linger
#   4. Installs the GUI (AppImage) to ~/.local/share/drais-relay/
#   5. Creates a .desktop entry so it appears in the app drawer
#   6. Immediately starts the relay service
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKERS_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$WORKERS_DIR/dist"
DIST_GUI_DIR="$WORKERS_DIR/dist-gui"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'; BOLD='\033[1m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; }
hdr()  { echo -e "\n${BOLD}$*${NC}"; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     DRAIS Relay — Linux Installer v2.0               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Install relay binary ─────────────────────────────────────────────
hdr "Step 1: Installing relay binary"

BIN_SRC=""
for candidate in "$DIST_DIR/drais-relay-linux-x64" "$DIST_DIR/drais-relay-linux" "$DIST_DIR/drais-relay"; do
  if [[ -f "$candidate" ]]; then BIN_SRC="$candidate"; break; fi
done

if [[ -z "$BIN_SRC" ]]; then
  fail "Relay binary not found in $DIST_DIR"
  fail "Run 'npm run build:linux' in the workers/ directory first."
  exit 1
fi

BIN_DEST="$HOME/.local/bin/drais-relay"
mkdir -p "$HOME/.local/bin"
cp "$BIN_SRC" "$BIN_DEST"
chmod +x "$BIN_DEST"
ok "Binary installed: $BIN_DEST"

# ── Step 2: Copy / init config ───────────────────────────────────────────────
hdr "Step 2: Configuration"

CFG_DIR="$HOME/.config/drais-relay"
CFG_FILE="$CFG_DIR/config.json"
mkdir -p "$CFG_DIR"

DIST_CFG="$DIST_DIR/drais-relay.config.json"
if [[ ! -f "$CFG_FILE" ]]; then
  if [[ -f "$DIST_CFG" ]]; then
    cp "$DIST_CFG" "$CFG_FILE"
    ok "Config copied from dist: $CFG_FILE"
  else
    cat > "$CFG_FILE" <<EOF
{
  "drais_url":   "https://sims.drais.pro",
  "device_ip":   "192.168.1.197",
  "device_sn":   "GED7254601154",
  "relay_key":   "DRAIS-355DF9C35EB60899009C01DD948EAD14",
  "device_port": 4370,
  "poll_ms":     2000
}
EOF
    ok "Default config created: $CFG_FILE"
  fi
else
  ok "Config already exists (not overwritten): $CFG_FILE"
fi

echo "   Edit with: nano $CFG_FILE"

# ── Step 3: systemd user service ─────────────────────────────────────────────
hdr "Step 3: Installing systemd user service"

SYSTEMD_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SYSTEMD_DIR/drais-relay.service"
mkdir -p "$SYSTEMD_DIR"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=DRAIS ZK Relay Agent
Documentation=https://sims.drais.pro
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/.config/drais-relay
EnvironmentFile=-%h/.config/drais-relay/env
ExecStartPre=/bin/sh -c 'RELAY_CFG="%h/.config/drais-relay/config.json"; export DRAIS_URL=\$(jq -r .drais_url "\$RELAY_CFG") DEVICE_IP=\$(jq -r .device_ip "\$RELAY_CFG") DEVICE_SN=\$(jq -r .device_sn "\$RELAY_CFG") RELAY_KEY=\$(jq -r .relay_key "\$RELAY_CFG") DEVICE_PORT=\$(jq -r .device_port "\$RELAY_CFG") POLL_MS=\$(jq -r .poll_ms "\$RELAY_CFG"); echo "DRAIS_URL=\$DRAIS_URL\nDEVICE_IP=\$DEVICE_IP\nDEVICE_SN=\$DEVICE_SN\nRELAY_KEY=\$RELAY_KEY\nDEVICE_PORT=\$DEVICE_PORT\nPOLL_MS=\$POLL_MS" > "%h/.config/drais-relay/env"'
ExecStart=%h/.local/bin/drais-relay
Restart=always
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=5
StandardOutput=journal
StandardError=journal
Environment=HOME=%h

[Install]
WantedBy=default.target
EOF

ok "Service file written: $SERVICE_FILE"

# ── Step 4: Fallback service (without jq dependency) ─────────────────────────
# If jq not available, write a simpler service that reads env from config via node
if ! command -v jq &>/dev/null; then
  warn "jq not installed — using env-var-based service (no ExecStartPre)"
  # Read config and write env file directly from bash (basic key=value extraction)
  python3 -c "
import json,os
c=json.load(open('$CFG_FILE'))
lines=['DRAIS_URL='+c.get('drais_url',''), 'DEVICE_IP='+c.get('device_ip',''),
       'DEVICE_SN='+c.get('device_sn',''), 'RELAY_KEY='+c.get('relay_key',''),
       'DEVICE_PORT='+str(c.get('device_port',4370)), 'POLL_MS='+str(c.get('poll_ms',2000))]
open('$CFG_DIR/env','w').write('\n'.join(lines))
print('  env file written')
" 2>/dev/null || true

  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=DRAIS ZK Relay Agent
After=network.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/.config/drais-relay
EnvironmentFile=%h/.config/drais-relay/env
ExecStart=%h/.local/bin/drais-relay
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF
  ok "Fallback service written (no jq)"
fi

systemctl --user daemon-reload
ok "systemd daemon reloaded"

systemctl --user enable drais-relay
ok "Service enabled (auto-start on login)"

# ── Step 5: loginctl enable-linger (start before login / survive logout) ─────
hdr "Step 5: Enabling linger (auto-start at boot, before login)"

if loginctl enable-linger "$USER" 2>/dev/null; then
  ok "Linger enabled for user $USER"
else
  warn "loginctl enable-linger failed — relay will start on login, not at boot"
fi

# ── Step 6: Start the service now ────────────────────────────────────────────
hdr "Step 6: Starting relay service"

if systemctl --user start drais-relay; then
  ok "drais-relay service started"
  sleep 1
  STATUS=$(systemctl --user is-active drais-relay 2>&1)
  ok "Service status: $STATUS"
else
  fail "Failed to start service. Check: journalctl --user -u drais-relay -n 30"
fi

# ── Step 7: Install GUI app (AppImage) if built ───────────────────────────────
hdr "Step 7: Installing GUI"

APPIMAGE=$(find "$DIST_GUI_DIR" -maxdepth 2 -name "*.AppImage" 2>/dev/null | head -1)
APP_DEST="$HOME/.local/share/drais-relay"
DESKTOP_DIR="$HOME/.local/share/applications"

mkdir -p "$APP_DEST" "$DESKTOP_DIR"

if [[ -n "$APPIMAGE" && -f "$APPIMAGE" ]]; then
  cp "$APPIMAGE" "$APP_DEST/DRAIS-Relay.AppImage"
  chmod +x "$APP_DEST/DRAIS-Relay.AppImage"
  ok "AppImage installed: $APP_DEST/DRAIS-Relay.AppImage"
  GUI_EXEC="$APP_DEST/DRAIS-Relay.AppImage"
else
  warn "AppImage not found — GUI not installed. Run 'npm run build:linux' in relay-app/ to build."
  warn "Skipping .desktop file"
  GUI_EXEC=""
fi

# Copy icon
ICON_SRC="$SCRIPT_DIR/assets/icon.png"
[[ ! -f "$ICON_SRC" ]] && ICON_SRC="$SCRIPT_DIR/../relay-gui/drais-relay.png"
ICON_DEST="$APP_DEST/icon.png"
if [[ -f "$ICON_SRC" ]]; then
  cp "$ICON_SRC" "$ICON_DEST"
  ok "Icon installed: $ICON_DEST"
fi

if [[ -n "$GUI_EXEC" ]]; then
  cat > "$DESKTOP_DIR/drais-relay.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=DRAIS Relay
Comment=Control biometric device relay bridge
Exec=$GUI_EXEC
Icon=$ICON_DEST
Terminal=false
Categories=Network;Utility;
StartupWMClass=drais-relay
StartupNotify=true
EOF
  chmod +x "$DESKTOP_DIR/drais-relay.desktop"
  # Update desktop database
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  ok ".desktop entry created — app appears in app drawer"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✓  DRAIS Relay installed successfully               ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Service : systemctl --user status drais-relay       ║"
echo "║  Logs    : journalctl --user -u drais-relay -f       ║"
echo "║  Config  : $CFG_FILE"
echo "║  Restart : systemctl --user restart drais-relay      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  The relay starts automatically on every boot/login."
echo "  Open the 'DRAIS Relay' app from your app drawer for the GUI."
echo ""
