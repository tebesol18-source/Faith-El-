#!/usr/bin/env bash
#
# deploy-oracle.sh — Deploy Faith-El ERP to Oracle Cloud (or any Ubuntu VPS)
#
# This script automates the entire deployment:
#   1. Installs Node.js, Python, Caddy
#   2. Creates the app directory + copies source code
#   3. Installs dependencies
#   4. Runs database migrations
#   5. Seeds demo operators
#   6. Builds Next.js for production
#   7. Installs systemd services (auto-start on boot)
#   8. Configures Caddy (reverse proxy + HTTPS)
#
# Prerequisites:
#   - A fresh Ubuntu 22.04/24.04 VPS (Oracle Cloud ARM or x86)
#   - SSH access with sudo privileges
#   - Your domain (e.g., faithel.com) pointing to the VPS IP (A record)
#
# Usage (run ON the VPS):
#   curl -sL https://raw.githubusercontent.com/your-repo/deploy-oracle.sh | bash
#
# Or copy this file to the VPS and run:
#   chmod +x deploy-oracle.sh && sudo ./deploy-oracle.sh
#
# Or run from your local machine via SSH:
#   scp deploy-oracle.sh ubuntu@your-vps:/tmp/ && ssh ubuntu@your-vps 'sudo bash /tmp/deploy-oracle.sh'
#

set -euo pipefail

# ─── Configuration ───
APP_NAME="faith-el-erp"
APP_DIR="/opt/$APP_NAME"
APP_USER="faithel"
APP_GROUP="faithel"
NODE_VERSION="22"
PORT=3000
DOMAIN="${1:-faithel.com}"  # Pass your domain as the first argument

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Faith-El ERP — Oracle Cloud Deployment                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Domain:   $DOMAIN"
echo "  App dir:  $APP_DIR"
echo "  Port:     $PORT"
echo "  User:     $APP_USER"
echo ""

# ─── Step 1: Check prerequisites ───
echo "─── Step 1/8: Checking prerequisites ───"
if [ "$EUID" -ne 0 ]; then
  echo "❌ Please run as root (use sudo)" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq curl
fi
echo "  ✓ Running as root"

# ─── Step 2: Install system dependencies ───
echo "─── Step 2/8: Installing system packages ───"
apt-get update -qq
apt-get install -y -qq \
  build-essential \
  python3 python3-venv python3-pip \
  git \
  ufw \
  certkit 2>/dev/null || true

# Install Node.js 22 via NodeSource
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt "$NODE_VERSION" ]; then
  echo "  Installing Node.js $NODE_VERSION..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y -qq nodejs
fi
echo "  ✓ Node.js: $(node -v)"

# Install bun (faster than npm for installs)
if ! command -v bun >/dev/null 2>&1; then
  echo "  Installing bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
echo "  ✓ bun: $(bun --version 2>/dev/null || echo 'installed')"

# Install Caddy (reverse proxy + automatic HTTPS)
if ! command -v caddy >/dev/null 2>&1; then
  echo "  Installing Caddy..."
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https 2>/dev/null || true
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi
echo "  ✓ Caddy: $(caddy version 2>/dev/null | head -1 || echo 'installed')"

# ─── Step 3: Create app user + directory ───
echo "─── Step 3/8: Creating app user + directory ───"
if ! id "$APP_USER" &>/dev/null; then
  useradd --system --create-home --shell /bin/bash "$APP_USER"
fi
echo "  ✓ User: $APP_USER"

mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"
echo "  ✓ Directory: $APP_DIR"

# ─── Step 4: Copy source code ───
echo "─── Step 4/8: Copying source code ───"
# This script assumes you've already uploaded the source zip to the VPS
# (e.g., via scp). Adjust the path as needed.
SOURCE_ZIP="${SOURCE_ZIP:-/tmp/faith-el-erp.zip}"

if [ -f "$SOURCE_ZIP" ]; then
  echo "  Extracting from $SOURCE_ZIP..."
  sudo -u "$APP_USER" unzip -q -o "$SOURCE_ZIP" -d "$APP_DIR"
elif [ -d "$(dirname "$0")/../src" ]; then
  # Running from the repo itself — copy current directory
  echo "  Copying from current directory..."
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  sudo -u "$APP_USER" cp -r "$PROJECT_ROOT"/* "$APP_DIR/"
  sudo -u "$APP_USER" cp -r "$PROJECT_ROOT"/.env* "$APP_DIR/" 2>/dev/null || true
  sudo -u "$APP_USER" cp -r "$PROJECT_ROOT"/.gitignore "$APP_DIR/" 2>/dev/null || true
else
  echo "❌ Source code not found." >&2
  echo "   Either:" >&2
  echo "   1. Upload the zip: scp faith-el-erp.zip ubuntu@your-vps:/tmp/" >&2
  echo "   2. Or run this script from the project root" >&2
  exit 1
fi
echo "  ✓ Source code copied"

# ─── Step 5: Install dependencies ───
echo "─── Step 5/8: Installing dependencies ───"
cd "$APP_DIR"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm install --production=false"
echo "  ✓ Node dependencies installed"

# Python venv + dependencies
if [ -d "coffee_export" ]; then
  echo "  Setting up Python venv..."
  sudo -u "$APP_USER" bash -c "cd $APP_DIR/coffee_export && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt bcrypt"
  echo "  ✓ Python dependencies installed"
fi

# ─── Step 6: Database setup ───
echo "─── Step 6/8: Database setup ───"
if [ -d "coffee_export" ]; then
  sudo -u "$APP_USER" bash -c "cd $APP_DIR/coffee_export && source venv/bin/activate && alembic upgrade head"
  echo "  ✓ Migrations applied"

  # Seed demo operators (admin@faithel.com / admin123, abi@faithel.com / coffee123)
  sudo -u "$APP_USER" bash -c "cd $APP_DIR && coffee_export/venv/bin/python scripts/seed-demo-operators.py"
  echo "  ✓ Demo operators seeded"
fi

# ─── Step 7: Build Next.js for production ───
echo "─── Step 7/8: Building Next.js ───"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm run build"
echo "  ✓ Production build complete"

# ─── Step 8: Install systemd services ───
echo "─── Step 8/8: Installing systemd services ───"

# App service (Next.js production server)
cat > /etc/systemd/system/${APP_NAME}.service << EOF
[Unit]
Description=Faith-El ERP — Next.js production server
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=HOSTNAME=0.0.0.0
ExecStart=$(which node) $APP_DIR/.next/standalone/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Supervisor service (7 AI agents)
cat > /etc/systemd/system/${APP_NAME}-supervisor.service << EOF
[Unit]
Description=Faith-El ERP — AI Supervisor (7 agents)
After=network.target ${APP_NAME}.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
ExecStart=$(which node) $APP_DIR/scripts/supervisor.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Keep-alive monitor
cat > /etc/systemd/system/${APP_NAME}-keepalive.service << EOF
[Unit]
Description=Faith-El ERP — Keep-alive monitor
After=network.target ${APP_NAME}.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
ExecStart=$(which node) $APP_DIR/scripts/keep-alive.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${APP_NAME} ${APP_NAME}-supervisor ${APP_NAME}-keepalive
systemctl start ${APP_NAME} ${APP_NAME}-supervisor ${APP_NAME}-keepalive
echo "  ✓ systemd services installed + started"

# ─── Configure Caddy (HTTPS + reverse proxy) ───
echo ""
echo "─── Configuring Caddy ───"
CADDYFILE="/etc/caddy/Caddyfile"
cat > "$CADDYFILE" << EOF
$DOMAIN {
    reverse_proxy localhost:$PORT {
        header_up Host {host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }

    # Compress responses
    encode gzip zstd

    # Static file caching
    @static {
        path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff *.woff2
    }
    header @static Cache-Control "public, max-age=31536000, immutable"
}
EOF
systemctl restart caddy
echo "  ✓ Caddy configured for $DOMAIN"
echo "  ✓ HTTPS will be auto-provisioned via Let's Encrypt"

# ─── Configure firewall ───
echo ""
echo "─── Configuring firewall ───"
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (Caddy redirects to HTTPS)
ufw allow 443/tcp  # HTTPS
ufw --force enable
echo "  ✓ Firewall: SSH(22) + HTTP(80) + HTTPS(443) open"

# ─── Verify ───
echo ""
echo "─── Verifying deployment ───"
sleep 3
if curl -s http://localhost:$PORT/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
  echo "  ✓ Health check: OK"
else
  echo "  ⚠️  Health check failed — check logs: journalctl -u $APP_NAME -f"
fi

# ─── Summary ───
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ DEPLOYMENT COMPLETE                                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "                                                              "
echo "  Your app is now running at: https://$DOMAIN                 "
echo "                                                              "
echo "  Admin login:    admin@faithel.com / admin123                "
echo "  Seller login:   abi@faithel.com / coffee123                 "
echo "                                                              "
echo "  Services (auto-start on boot):                              "
echo "    • faith-el-erp         (Next.js server)                   "
echo "    • faith-el-erp-supervisor (7 AI agents)                   "
echo "    • faith-el-erp-keepalive (health monitor)                 "
echo "    • caddy                (HTTPS reverse proxy)              "
echo "                                                              "
echo "  Useful commands:                                            "
echo "    systemctl status faith-el-erp                             "
echo "    systemctl restart faith-el-erp                            "
echo "    journalctl -u faith-el-erp -f                             "
echo "    cd $APP_DIR && ./scripts/backup-db.sh                     "
echo "                                                              "
echo "  ⚠️  First HTTPS request may take 10-30s (Let's Encrypt      "
echo "     certificate provisioning)                                "
echo "╚══════════════════════════════════════════════════════════════╝"
