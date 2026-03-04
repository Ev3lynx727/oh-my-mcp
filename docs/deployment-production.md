# Production Deployment

Best practices for deploying oh-my-mcp in production.

## Overview

This guide covers production-ready deployment of oh-my-mcp, including security, reliability, and operational considerations.

## Prerequisites

- Node.js 18+ (LTS recommended)
- Linux server with systemd
- SSL certificate (Let's Encrypt or purchased)
- Reverse proxy (nginx, Traefik, or cloud load balancer)

## Architecture

```text
                    ┌─────────────────┐
                    │   DNS / LB      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Nginx (TLS)    │
                    │  Rate Limit     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  oh-my-mcp      │
                    │  :8080 / :8090  │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
┌────────▼───────┐  ┌──────▼──────┐  ┌────────▼────────┐
│ supergateway   │  │ supergateway │  │ supergateway   │
│ :8100 (mem)   │  │ :8101 (gh)   │  │ :8102 (fs)     │
└────────────────┘  └─────────────┘  └─────────────────┘
```

## Step-by-Step Deployment

### 1. Prepare Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install nginx
sudo apt install -y nginx
```

### 2. Install oh-my-mcp

```bash
# Create user
sudo useradd -m -s /bin/bash mcp
sudo mkdir -p /opt/oh-my-mcp
sudo chown mcp:mcp /opt/oh-my-mcp

# Clone or copy project
cd /opt/oh-my-mcp

# Install dependencies
npm install --production

# Build
npm run build
```

### 3. Create Configuration

```bash
sudo -u mcp vim /opt/oh-my-mcp/config.yaml
```

```yaml
managementPort: 8080
gatewayPort: 8090
logLevel: info

auth:
  tokens:

    - "${OH_MY_MCP_TOKEN}"  # Use environment variable

servers:
  memory:
    command:

      - "npx"
      - "-y"
      - "@modelcontextprotocol/server-memory"

    enabled: true
```

### 4. Set Environment Variables

```bash
# Create env file
sudo -u mcp vim /opt/oh-my-mcp/.env

# Content
OH_MY_MCP_TOKEN=$(openssl rand -hex 32)
GITHUB_TOKEN=your_github_token
```

### 5. Create Systemd Service

```bash
sudo vim /etc/systemd/system/oh-my-mcp.service
```

```ini
[Unit]
Description=oh-my-mcp - Native MCP Gateway
After=network.target

[Service]
Type=simple
User=mcp
Group=mcp
WorkingDirectory=/opt/oh-my-mcp
ExecStart=/usr/bin/node /opt/oh-my-mcp/dist/index.js /opt/oh-my-mcp/config.yaml
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/oh-my-mcp/.env
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable oh-my-mcp
sudo systemctl start oh-my-mcp
```

### 6. Configure Nginx

```bash
sudo vim /etc/nginx/sites-available/oh-my-mcp
```

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    ssl_certificate /etc/letsencrypt/live/mcp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.example.com/privkey.pem;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    # Management API
    location / {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # MCP Gateway
    location /mcp/ {
        limit_req zone=api burst=30 nodelay;
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name mcp.example.com;
    return 301 https://$server_name$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/oh-my-mcp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Setup SSL (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mcp.example.com
```

### 8. Firewall

```bash
sudo ufw allow 22    # SSH
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

## Monitoring

### Health Checks

```bash
# Service health
curl https://mcp.example.com/health

# Per-server health
curl -H "Authorization: Bearer TOKEN" https://mcp.example.com/servers/memory/health
```

### Logs

```bash
# System logs
sudo journalctl -u oh-my-mcp -f

# Nginx access logs
tail -f /var/log/nginx/access.log
```

### Metrics

Consider adding Prometheus metrics. See: [Custom Metrics](#custom-metrics)

## Backup

### Backup Script

```bash
#!/bin/bash
BACKUP_DIR="/backup/mcp"
DATE=$(date +%Y%m%d)

mkdir -p $BACKUP_DIR

# Backup config
cp /opt/oh-my-mcp/config.yaml $BACKUP_DIR/config-$DATE.yaml

# Backup env (without secrets)
grep -v "^=" /opt/oh-my-mcp/.env > $BACKUP_DIR/env-$DATE.txt

echo "Backup complete: $DATE"
```

Add to crontab:

```bash
0 2 * * * /opt/oh-my-mcp/backup.sh
```

## Updates

### Update Process

```bash
# Backup first
cp -r /opt/oh-my-mcp /opt/oh-my-mcp.backup

# Pull updates
cd /opt/oh-my-mcp
git pull

# Rebuild
npm install --production
npm run build

# Restart
sudo systemctl restart oh-my-mcp

# Check
sudo systemctl status oh-my-mcp
```

### Rollback

```bash
sudo systemctl stop oh-my-mcp
rm -rf /opt/oh-my-mcp
mv /opt/oh-my-mcp.backup /opt/oh-my-mcp
sudo systemctl start oh-my-mcp
```

## Security Checklist

- [ ] Run as non-root user
- [ ] Enable TLS/SSL
- [ ] Configure firewall
- [ ] Set up rate limiting
- [ ] Use strong authentication tokens
- [ ] Enable systemd security options
- [ ] Regular backups
- [ ] Log monitoring
- [ ] Health checks

## Performance Tuning

### Node.js

```ini
# /etc/systemd/system/oh-my-mcp.service
Environment=NODE_ENV=production
Environment=NODE_OPTIONS="--max-old-space-size=1024"
```

### Nginx

```nginx
# Increase worker connections
worker_connections 2048;

# Enable caching
proxy_cache_path /tmp/nginx_cache levels=1:2 keys_zone=mcp_cache:10m max_size=1g inactive=60m;
```

## High Availability

For HA deployment:

- Run multiple oh-my-mcp instances
- Use load balancer with sticky sessions
- Share configuration via NFS or etcd
- Use shared state store for sessions
