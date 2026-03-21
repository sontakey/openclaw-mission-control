#!/usr/bin/env bash
set -euo pipefail

# Mission Control — Quick Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/sontakey/mission-control/main/install.sh | bash

REPO_URL="${MISSION_CONTROL_REPO:-https://github.com/sontakey/mission-control.git}"
INSTALL_DIR="${MISSION_CONTROL_DIR:-$HOME/mission-control}"
PORT="${MISSION_CONTROL_PORT:-3100}"
GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://127.0.0.1:18789}"
SERVICE_NAME="mission-control"

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[&|]/\\&/g'
}

echo "🎛️  Mission Control — OpenClaw Agent Dashboard"
echo ""

# Check prerequisites
for cmd in git node npm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "❌ Missing: $cmd"
    exit 1
  fi
done

# Auto-detect gateway token
TOKEN="${OPENCLAW_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  ENV_FILE="$HOME/.openclaw/.env"
  if [ -f "$ENV_FILE" ]; then
    TOKEN=$(grep -oP 'GATEWAY_AUTH_TOKEN=\K\S+' "$ENV_FILE" 2>/dev/null || true)
  fi
fi

if [ -z "$TOKEN" ]; then
  echo "⚠️  Could not auto-detect gateway token."
  echo "   Set OPENCLAW_TOKEN env var or check: grep GATEWAY_AUTH_TOKEN ~/.openclaw/.env"
  read -rp "   Enter gateway auth token: " TOKEN
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Gateway token is required."
  exit 1
fi

# Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "▸ Updating existing installation..."
  cd "$INSTALL_DIR" && git pull --ff-only
else
  echo "▸ Cloning Mission Control..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install and build
echo "▸ Installing dependencies..."
npm install --production=false

echo "▸ Building..."
npm run build

# Write .env
cat > .env <<EOF
PORT=$PORT
OPENCLAW_GATEWAY_URL=$GATEWAY_URL
OPENCLAW_TOKEN=$TOKEN
DATABASE_FILE=mission-control.db
EOF

# Systemd service (Linux only)
if command -v systemctl &>/dev/null; then
  echo "▸ Setting up systemd service..."
  NODE_BIN=$(command -v node)
  USER_NAME="${SUDO_USER:-$(id -un)}"
  SERVICE_TEMPLATE="$INSTALL_DIR/deploy/systemd/$SERVICE_NAME.service"
  SERVICE_TARGET="/etc/systemd/system/$SERVICE_NAME.service"
  TEMP_SERVICE_FILE=$(mktemp)

  if [ ! -f "$SERVICE_TEMPLATE" ]; then
    echo "❌ Missing service template: $SERVICE_TEMPLATE"
    exit 1
  fi

  sed \
    -e "s|__MISSION_CONTROL_USER__|$(escape_sed_replacement "$USER_NAME")|g" \
    -e "s|__MISSION_CONTROL_DIR__|$(escape_sed_replacement "$INSTALL_DIR")|g" \
    -e "s|__NODE_BIN__|$(escape_sed_replacement "$NODE_BIN")|g" \
    "$SERVICE_TEMPLATE" > "$TEMP_SERVICE_FILE"

  sudo install -m 0644 "$TEMP_SERVICE_FILE" "$SERVICE_TARGET"
  rm -f "$TEMP_SERVICE_FILE"

  sudo systemctl daemon-reload
  sudo systemctl enable --now $SERVICE_NAME
  echo "✓ Service started"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎛️  Mission Control is ready!"
echo ""
echo "  Local:     http://localhost:$PORT"

# Detect Tailscale
TS_NAME=$(tailscale status --self --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))" 2>/dev/null || true)
if [ -n "$TS_NAME" ]; then
  echo "  Tailscale:  http://$TS_NAME:$PORT"
fi

echo ""
echo "  Gateway:   $GATEWAY_URL"
echo "  Config:    $INSTALL_DIR/.env"
echo ""
