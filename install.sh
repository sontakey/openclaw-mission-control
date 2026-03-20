#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${MISSION_CONTROL_REPO_URL:-https://github.com/sontakey/mission-control.git}"
INSTALL_DIR="${MISSION_CONTROL_DIR:-$HOME/mission-control}"
PORT="${MISSION_CONTROL_PORT:-3100}"
GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://127.0.0.1:18789}"
SERVICE_NAME="${MISSION_CONTROL_SERVICE_NAME:-mission-control}"
NODE_BIN="${MISSION_CONTROL_NODE_BIN:-$(command -v node)}"
NPM_BIN="${MISSION_CONTROL_NPM_BIN:-$(command -v npm)}"
DATABASE_FILE="${MISSION_CONTROL_DATABASE_FILE:-$INSTALL_DIR/mission-control.db}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command git
require_command node
require_command npm
require_command sudo
require_command systemctl

if [ -e "$INSTALL_DIR" ] && [ ! -d "$INSTALL_DIR/.git" ]; then
  echo "Install directory exists but is not a git checkout: $INSTALL_DIR" >&2
  exit 1
fi

if [ ! -d "$INSTALL_DIR/.git" ]; then
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
"$NPM_BIN" install
"$NPM_BIN" run build

cat > .env <<EOF
PORT=$PORT
OPENCLAW_GATEWAY_URL=$GATEWAY_URL
OPENCLAW_TOKEN=${OPENCLAW_TOKEN:-}
DATABASE_FILE=$DATABASE_FILE
EOF

sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Mission Control Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN dist/server/index.js
Restart=always
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"

echo "Mission Control running at http://$(hostname):$PORT"
