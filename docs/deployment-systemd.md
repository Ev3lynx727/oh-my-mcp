# Systemd Service Deployment

This guide covers deploying oh-my-mcp as a systemd service on Linux.

## Create Systemd Service File

Create `/etc/systemd/system/oh-my-mcp.service`:

```ini
[Unit]
Description=oh-my-mcp - Native MCP Gateway
After=network.target

[Service]
Type=simple
User=ev3lynx
Group=ev3lynx
WorkingDirectory=/home/ev3lynx/Project/oh-my-mcp
ExecStart=/usr/bin/node /home/ev3lynx/Project/oh-my-mcp/dist/index.js /home/ev3lynx/Project/oh-my-mcp/config.yaml
Restart=always
RestartSec=10

# Environment variables (optional - can also use .env file)
Environment=NODE_ENV=production
Environment=GITHUB_TOKEN=your_github_token

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
ReadWritePaths=/home/ev3lynx/Project/oh-my-mcp

[Install]
WantedBy=multi-user.target
```

## Adjust Paths

Update the paths to match your installation:

- `User` / `Group` - Your Linux user
- `WorkingDirectory` - Path to oh-my-mcp installation
- `ExecStart` - Path to Node.js and oh-my-mcp

## Install the Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable oh-my-mcp

# Start the service
sudo systemctl start oh-my-mcp

# Check status
sudo systemctl status oh-my-mcp
```

## Service Management Commands

### Start
```bash
sudo systemctl start oh-my-mcp
```

### Stop
```bash
sudo systemctl stop oh-my-mcp
```

### Restart
```bash
sudo systemctl restart oh-my-mcp
```

### View Logs

```bash
# Recent logs
sudo journalctl -u oh-my-mcp -n 50

# Follow logs
sudo journalctl -u oh-my-mcp -f

# Logs since last boot
sudo journalctl -u oh-my-mcp -b
```

### Check Status

```bash
sudo systemctl status oh-my-mcp
```

## Troubleshooting

### Service Won't Start

Check logs:
```bash
sudo journalctl -u oh-my-mcp -e
```

Common issues:
- **Port in use**: Change ports in config.yaml
- **Missing dependencies**: Run `npm install` in the project directory
- **Wrong paths**: Verify ExecStart paths are correct

### Permission Denied

Make sure the user has access to:
- The project directory
- Any directories accessed by MCP servers (e.g., filesystem server)

### Environment Variables Not Working

Use `Environment=` in the service file, or create a `.env` file:

```bash
# In project directory
echo "GITHUB_TOKEN=your_token" > .env
echo "CONTEXT7_API_KEY=your_key" >> .env
```

## Production Hardening

### Security Options

```ini
[Service]
# Don't allow privilege escalation
NoNewPrivileges=true

# Restrict system access
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true

# Resource limits
MemoryMax=1G
CPUQuota=50%

# Timeout
TimeoutStartSec=60
TimeoutStopSec=30
```

### Running Without Root

Create a dedicated user:

```bash
sudo useradd -r -s /bin/false mcp
sudo chown -R mcp:mcp /home/ev3lynx/Project/oh-my-mcp
```

Update service file:
```ini
User=mcp
Group=mcp
```

## Backup and Updates

### Update oh-my-mcp

```bash
# Stop service
sudo systemctl stop oh-my-mcp

# Backup
cp -r /home/ev3lynx/Project/oh-my-mcp /home/ev3lynx/Project/oh-my-mcp.backup

# Pull updates
cd /home/ev3lynx/Project/oh-my-mcp
git pull

# Rebuild
npm install
npm run build

# Start service
sudo systemctl start oh-my-mcp
```

## Log Rotation

Create `/etc/logrotate.d/oh-my-mcp`:

```
/home/ev3lynx/Project/oh-my-mcp/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 ev3lynx ev3lynx
}
```

Note: oh-my-mcp logs to stdout/stderr, which systemd captures. Use `journalctl` for logs as shown above.
