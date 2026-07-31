# Faith-El ERP — Oracle Cloud Deployment Guide

Deploy the Faith-El ERP to Oracle Cloud Always Free (or any Ubuntu VPS) in under 30 minutes.

## Prerequisites

1. **Oracle Cloud account** — sign up at [cloud.oracle.com](https://cloud.oracle.com) (free, no credit card charge)
2. **A domain name** — e.g., `faithel.com` (optional but recommended for HTTPS)
3. **SSH key pair** — for accessing the VPS

## Step 1: Create the VPS on Oracle Cloud

### 1a. Create a VM instance

1. Log into Oracle Cloud Console
2. Go to **Compute → Instances → Create Instance**
3. Configure:
   - **Name:** `faith-el-erp`
   - **Image:** Canonical Ubuntu 22.04 (or 24.04)
   - **Shape:** `VM.Standard.A1.Flex` (ARM, free tier)
     - OCPUs: **4**
     - Memory: **24 GB**
   - **SSH keys:** Paste your public key (`~/.ssh/id_rsa.pub`)
4. Click **Create**

### 1b. Open firewall ports

Oracle Cloud blocks all ports by default. You need to open:

1. Go to **Networking → Virtual Cloud Networks → your VCN → Security Lists**
2. Add Ingress Rules:
   - **Port 22** (SSH) — Source `0.0.0.0/0`
   - **Port 80** (HTTP) — Source `0.0.0.0/0`
   - **Port 443** (HTTPS) — Source `0.0.0.0/0`

### 1c. Get the public IP

After the instance is created, note the **Public IP Address** (shown on the instance details page).

## Step 2: Point your domain (optional but recommended)

If you have a domain (e.g., `faithel.com`):

1. Go to your DNS provider (Cloudflare, Namecheap, GoDaddy, etc.)
2. Create an **A record**:
   - **Name:** `@` (or `app` for a subdomain)
   - **Value:** your VPS public IP
   - **TTL:** 300 (5 minutes)
3. Wait for DNS to propagate (5-30 minutes)

**No domain?** You can use the VPS IP directly (`http://YOUR-IP`) — just skip the Caddy HTTPS config in the deploy script (pass `localhost` as the domain).

## Step 3: Upload the source code

From your local machine:

```bash
# Download the deployment zip
cd /home/z/my-project
zip -r /tmp/faith-el-erp.zip . \
  -x "node_modules/*" -x ".next/*" -x ".git/*" \
  -x "coffee_export/venv/*" -x "*__pycache__*" -x "*.pyc" \
  -x "*.log" -x "*.png" -x "*.jpg" -x "*.jpeg" \
  -x "tool-results/*" -x "state/*" -x ".zscripts/*" \
  -x "db/*" -x "mini-services/*" -x "upload/*" \
  -x "skills/*" -x "examples/*" -x "tsconfig.tsbuildinfo" \
  -x "download/*"

# Upload to the VPS
scp /tmp/faith-el-erp.zip ubuntu@YOUR-VPS-IP:/tmp/
scp scripts/deploy-oracle.sh ubuntu@YOUR-VPS-IP:/tmp/
```

## Step 4: Run the deployment script

SSH into the VPS:

```bash
ssh ubuntu@YOUR-VPS-IP
```

Run the deployment:

```bash
# Set your domain (or use the IP address if no domain)
export SOURCE_ZIP=/tmp/faith-el-erp.zip

sudo bash /tmp/deploy-oracle.sh faithel.com
```

The script will:
1. Install Node.js 22, Python 3, Caddy, bun
2. Create a system user (`faithel`) + app directory (`/opt/faith-el-erp`)
3. Extract the source code
4. Install all dependencies (Node + Python)
5. Run database migrations
6. Seed demo operators (admin@faithel.com / admin123)
7. Build Next.js for production
8. Install systemd services (auto-start on boot)
9. Configure Caddy (HTTPS + reverse proxy)
10. Configure the firewall

**Total time: ~5-10 minutes.**

## Step 5: Verify

Once the script completes:

```bash
# Check the health endpoint
curl http://localhost:3000/api/health

# Check the service status
systemctl status faith-el-erp
systemctl status faith-el-erp-supervisor

# Check Caddy (HTTPS)
curl https://faithel.com/api/health
```

Open your browser to `https://faithel.com` and log in:

| Email | Password | Role |
|---|---|---|
| `admin@faithel.com` | `admin123` | Admin |
| `abi@faithel.com` | `coffee123` | Seller |

**First visit may take 10-30 seconds** — Caddy needs to provision the Let's Encrypt SSL certificate.

## Post-deployment

### Set up daily backups (cron)

```bash
# Edit crontab
sudo crontab -e

# Add this line (daily at 2 AM):
0 2 * * * cd /opt/faith-el-erp && sudo -u faithel ./scripts/backup-db.sh >> /var/log/faith-el-backup.log 2>&1
```

### Change the admin password

**Do this immediately after deployment:**

1. Log in as `admin@faithel.com` / `admin123`
2. You'll be prompted to change your password (must_change_password flag is set)
3. Choose a strong password (min 8 chars, 1 letter + 1 digit)

### Create real operator accounts

1. Log in as admin
2. Go to **Admin → System tab**
3. Click **"+ New Operator"**
4. Fill in the operator's name, email, password, role
5. Communicate the password to them out-of-band
6. They'll be forced to change it on first login

### Set up the Python backend (Streamlit dashboard)

The Streamlit dashboard runs on port 8501. To enable it:

```bash
# Create a systemd service for Streamlit
sudo tee /etc/systemd/system/faith-el-streamlit.service << 'EOF'
[Unit]
Description=Faith-El ERP — Streamlit dashboard
After=network.target

[Service]
Type=simple
User=faithel
Group=faithel
WorkingDirectory=/opt/faith-el-erp/coffee_export
ExecStart=/opt/faith-el-erp/coffee_export/venv/bin/streamlit run coffee_export/dashboard/app.py --server.port=8501 --server.address=0.0.0.0
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable faith-el-streamlit
sudo systemctl start faith-el-streamlit
```

Add Streamlit to Caddy (optional — exposes dashboard at `dashboard.faithel.com`):

```caddyfile
dashboard.faithel.com {
    reverse_proxy localhost:8501
}
```

## Troubleshooting

### "502 Bad Gateway"

```bash
# Check if the app is running
systemctl status faith-el-erp

# Check logs
journalctl -u faith-el-erp -f

# Restart the app
sudo systemctl restart faith-el-erp
```

### "Connection refused"

```bash
# Check if the firewall is blocking
sudo ufw status

# Check if port 3000 is listening
ss -tlnp | grep :3000

# Check if Caddy is running
sudo systemctl status caddy
```

### Database errors

```bash
# Check DB exists
ls -la /opt/faith-el-erp/coffee_export/data/coffee_export.db

# Run migrations manually
cd /opt/faith-el-erp/coffee_export
source venv/bin/activate
alembic upgrade head

# Re-seed demo operators
cd /opt/faith-el-erp
coffee_export/venv/bin/python scripts/seed-demo-operators.py
```

### Caddy/HTTPS issues

```bash
# Check Caddy logs
sudo journalctl -u caddy -f

# Check Caddy config
caddy validate --config /etc/caddy/Caddyfile

# Restart Caddy
sudo systemctl restart caddy
```

## Updating the app

To deploy a new version:

```bash
# On your local machine
cd /home/z/my-project
zip -r /tmp/faith-el-erp.zip . -x "node_modules/*" -x ".next/*" -x ".git/*" -x "coffee_export/venv/*" -x "*__pycache__*" -x "*.pyc" -x "*.log" -x "*.png" -x "*.jpg"
scp /tmp/faith-el-erp.zip ubuntu@YOUR-VPS-IP:/tmp/

# On the VPS
ssh ubuntu@YOUR-VPS-IP
sudo -u faithel unzip -q -o /tmp/faith-el-erp.zip -d /opt/faith-el-erp/
cd /opt/faith-el-erp
sudo -u faithel npm install
sudo -u faithel npm run build
sudo systemctl restart faith-el-erp
```

## Backup + restore

```bash
# Backup
cd /opt/faith-el-erp
sudo -u faithel ./scripts/backup-db.sh

# Restore
sudo -u faithel ./scripts/restore-db.sh coffee_export/data/backups/coffee_export_YYYYMMDD.db.gz
sudo systemctl restart faith-el-erp
```

See `docs/backup-restore.md` for full documentation.

## Cost

| Item | Cost |
|---|---|
| Oracle Cloud VM (4 ARM cores, 24 GB RAM) | **$0** (Always Free) |
| Domain (faithel.com) | ~$10/year |
| Let's Encrypt SSL certificate | **$0** |
| **Total** | **~$0.83/month** (just the domain) |

The Oracle Cloud Always Free tier is genuinely free — no credit card charge, no time limit, no hidden fees. They verify your identity with a card during signup but never bill it.
